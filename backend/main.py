"""
main.py — FastAPI backend for Vidhi Setu
Endpoints:
  POST /analyze        — Core Q&A pipeline
  POST /alerts/match   — Bonus A: batch topic matching
  POST /compare        — Bonus B: compare two bill versions
  GET  /health         — Health check
"""

import os
from fastapi import File, UploadFile
import pdfplumber
import io
import logging
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from dotenv import load_dotenv

from pathlib import Path
load_dotenv(Path(__file__).parent.parent / ".env")

from dataset         import get_combined_act_text, get_index_size
from scaledown_client import compress, compress_batch
from llm             import answer_citizen_question, classify_topic, compare_bills

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Vidhi Setu — AI Legislative Analyzer", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Models ─────────────────────────────────────────────────────────────────────
class AnalyzeRequest(BaseModel):
    question: str                        # citizen's question in any language

class AlertRequest(BaseModel):
    bill_text:  str                      # paste the new bill text
    bill_title: str = "New Bill"
    topics:     list[str]                # ["health", "agriculture", "taxation"]

class CompareRequest(BaseModel):
    question:      str
    old_bill_text: str
    new_bill_text: str
    old_title:     str = "Previous Act"
    new_title:     str = "New Bill"


# ═══════════════════════════════════════════════════════════════════════════════
# ENDPOINT 1 — Core Q&A
# ═══════════════════════════════════════════════════════════════════════════════
@app.post("/analyze")
async def analyze(req: AnalyzeRequest):
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    # Step 1 — Groq identifies relevant acts from question (any language)
    from llm import identify_relevant_acts
    act_names = identify_relevant_acts(req.question)

    # Step 2 — Fetch act text (LLM-guided, fallback to TF-IDF)
    act_text, act_titles = get_combined_act_text(
        req.question,
        act_names=act_names,
        top_k=3
    )
    if not act_text:
        raise HTTPException(status_code=404, detail="No acts found in dataset.")

    # Step 3 — ScaleDown compression
    try:
        compression = compress(context=act_text, prompt=req.question)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Compression failed: {str(e)}")

    # Step 4 — Groq answers in citizen's language
    try:
        answer = answer_citizen_question(
            compressed_clauses=compression.compressed_text,
            citizen_question=req.question,
            act_titles=act_titles,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM failed: {str(e)}")

    return {
        "answer":             answer,
        "acts_found":         act_titles,
        "compressed_clauses": compression.compressed_text,
        "compression": {
            "original_tokens":   compression.original_tokens,
            "compressed_tokens": compression.compressed_tokens,
            "tokens_saved":      compression.tokens_saved,
            "compression_ratio": compression.compression_ratio,
            "savings_percent":   compression.savings_percent,
        },
    }

# ═══════════════════════════════════════════════════════════════════════════════
# ENDPOINT 2 — Bonus A: Personalized Alert Matching
# ═══════════════════════════════════════════════════════════════════════════════
@app.post("/alerts/match")
async def alerts_match(req: AlertRequest):
    """
    Bonus A — Batch compress a new bill against each interest topic.
    Returns which topics are covered + one-line summary per topic.
    """
    if not req.bill_text.strip():
        raise HTTPException(status_code=400, detail="Bill text cannot be empty")
    if not req.topics:
        raise HTTPException(status_code=400, detail="At least one topic required")

    # Build topic probe questions
    probes = [
        f"Does this bill contain provisions related to {topic}? "
        f"What does it say about {topic}?"
        for topic in req.topics
    ]

    # Batch compress: same bill against each topic probe
    try:
        compressions = compress_batch(
            contexts=[req.bill_text] * len(req.topics),
            prompts=probes,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Batch compression failed: {str(e)}")

    results = []
    total_saved = 0

    for i, (topic, compression) in enumerate(zip(req.topics, compressions)):
        classification = classify_topic(compression.compressed_text, topic)
        total_saved += compression.tokens_saved
        results.append({
            "topic":             topic,
            "present":           classification.get("present", False),
            "summary":           classification.get("summary"),
            "tokens_saved":      compression.tokens_saved,
            "savings_percent":   compression.savings_percent,
        })

    matched = [r for r in results if r["present"]]

    return {
        "bill_title":      req.bill_title,
        "topics_checked":  len(req.topics),
        "topics_matched":  len(matched),
        "total_tokens_saved": total_saved,
        "matches":         matched,
        "all_results":     results,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# ENDPOINT 3 — Bonus B: Bill Comparison
# ═══════════════════════════════════════════════════════════════════════════════
@app.post("/compare")
async def compare(req: CompareRequest):
    """
    Bonus B — Compress old act + new bill against same question, then diff.
    """
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    try:
        old_compression = compress(context=req.old_bill_text, prompt=req.question)
        new_compression = compress(context=req.new_bill_text, prompt=req.question)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Compression failed: {str(e)}")

    try:
        comparison = compare_bills(
            old_clauses=old_compression.compressed_text,
            new_clauses=new_compression.compressed_text,
            citizen_question=req.question,
            old_title=req.old_title,
            new_title=req.new_title,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM failed: {str(e)}")

    return {
        "comparison":    comparison,
        "old_title":     req.old_title,
        "new_title":     req.new_title,
        "compression": {
            "old_tokens_saved":   old_compression.tokens_saved,
            "new_tokens_saved":   new_compression.tokens_saved,
            "total_tokens_saved": old_compression.tokens_saved + new_compression.tokens_saved,
        },
    }


# ═══════════════════════════════════════════════════════════════════════════════
# ENDPOINT 4 — Health check
# ═══════════════════════════════════════════════════════════════════════════════
@app.get("/health")
async def health():
    return {
        "status":      "ok",
        "service":     "Vidhi Setu — AI Legislative Analyzer",
        "dataset_size": get_index_size(),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# ENDPOINT 5 — PDF Extraction
# ═══════════════════════════════════════════════════════════════════════════════
@app.post("/extract-pdf")
async def extract_pdf(file: UploadFile = File(...)):
    """Extract text from uploaded PDF."""
    try:
        contents = await file.read()
        with pdfplumber.open(io.BytesIO(contents)) as pdf:
            text = "\n\n".join(
                page.extract_text() or "" 
                for page in pdf.pages
            )
        if not text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from PDF")
        return {
            "text":       text,
            "pages":      len(pdf.pages),
            "filename":   file.filename,
            "char_count": len(text),
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"PDF extraction failed: {str(e)}")