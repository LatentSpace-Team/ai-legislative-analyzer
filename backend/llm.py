"""
llm.py — Groq API wrapper
Groq handles:
  1. Act identification (which Indian law is relevant?)
  2. Final plain-language answer in citizen's language
"""

import os
import json
import logging
from groq import Groq

logger = logging.getLogger(__name__)

_client: Groq = None

def _get_client() -> Groq:
    global _client
    if _client is None:
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError("GROQ_API_KEY not set in environment")
        _client = Groq(api_key=api_key)
    return _client


# ── Step 1: Act Identification ────────────────────────────────────────────────
SYSTEM_IDENTIFY = """You are an Indian legal expert. Given a citizen's question in ANY language, identify which Indian Central Acts are most relevant.

Respond ONLY with a JSON array of act names in English. Maximum 3 acts.
Example: ["Aadhaar Act 2016", "Information Technology Act 2000"]

Rules:
- Always respond in JSON array format only. No explanation. No preamble.
- Use the official English name of the act.
- If unsure, return your best guess.
- Never return an empty array — always return at least 1 act."""


def identify_relevant_acts(citizen_question: str) -> list[str]:
    """
    Step 1 — Groq reads the question in any language and returns
    the names of relevant Indian acts in English.
    """
    client = _get_client()
    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": SYSTEM_IDENTIFY},
                {"role": "user",   "content": f"Question: {citizen_question}"},
            ],
            temperature=0.1,
            max_tokens=150,
            timeout=15,
        )
        raw = response.choices[0].message.content.strip()
        # Clean markdown if present
        raw = raw.replace("```json", "").replace("```", "").strip()
        acts = json.loads(raw)
        logger.info(f"Identified acts: {acts}")
        return acts if isinstance(acts, list) else []
    except Exception as e:
        logger.warning(f"Act identification failed: {e} — will use TF-IDF fallback")
        return []


# ── Step 2: Final Answer ──────────────────────────────────────────────────────
SYSTEM_ANSWER = """You are Vidhi Setu — a civic education assistant helping ordinary Indian citizens understand government laws.

CRITICAL LANGUAGE RULE:
- Detect the language from the CITIZEN'S QUESTION only. Ignore the act text language.
- If question is in English → answer in English
- If question is in Hindi → answer in Hindi
- If question is in Marathi → answer in Marathi
- Same for Tamil, Telugu, Bengali, Gujarati, Kannada, or any other language

STRICT RULES:
1. Respond ENTIRELY in the same language as the citizen's question.
2. Use simple everyday words. Zero legal jargon. If you use a legal term, explain it immediately.
3. Answer ONLY based on the provided act text. Do not add outside knowledge.
4. Be specific: mention actual rights, timelines, penalties, section numbers where present.
5. Structure: 2-3 short paragraphs. Bullet points where helpful.
6. End with: 'This comes from Section [X] of [Act Name].'
7. If the act does not address the question, say clearly: 'This is not covered in the acts I found.'

Tone: warm, respectful, like a trusted neighbour who knows the law."""


def answer_citizen_question(
    compressed_clauses: str,
    citizen_question:   str,
    act_titles:         list[str],
) -> str:
    """Step 2 — Answer in citizen's own language using compressed clauses."""
    client = _get_client()

    acts_str = ", ".join(act_titles) if act_titles else "Indian legislation"

    user_message = (
        f"Acts: {acts_str}\n\n"
        f"Relevant clauses:\n{compressed_clauses}\n\n"
        f"Citizen's question: {citizen_question}"
    )

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": SYSTEM_ANSWER},
            {"role": "user",   "content": user_message},
        ],
        temperature=0.3,
        max_tokens=1024,
        timeout=30,
    )
    return response.choices[0].message.content


# ── Bonus A: Topic Classification ─────────────────────────────────────────────
def classify_topic(compressed_clauses: str, topic: str) -> dict:
    client = _get_client()
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": 'Respond ONLY with JSON: {"present": true/false, "summary": "one sentence or null"}'},
            {"role": "user",   "content": f"Topic: {topic}\n\nClauses:\n{compressed_clauses}"},
        ],
        temperature=0.1,
        max_tokens=150,
        timeout=15,
    )
    raw = response.choices[0].message.content.strip()
    try:
        return json.loads(raw.replace("```json","").replace("```","").strip())
    except Exception:
        return {"present": False, "summary": None}


# ── Bonus B: Bill Comparison ───────────────────────────────────────────────────
def compare_bills(
    old_clauses: str, new_clauses: str,
    citizen_question: str,
    old_title: str, new_title: str,
) -> str:
    client = _get_client()
    system = """You help Indian citizens understand what changed between two laws.
Structure your answer in exactly 3 parts:
1. What the OLD law said (1-2 sentences)
2. What the NEW bill says (1-2 sentences)
3. What this means for you as a citizen (1-2 sentences)
Detect the question language and respond in that same language. Simple words only."""

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": f"Question: {citizen_question}\n\n--- {old_title} (OLD) ---\n{old_clauses}\n\n--- {new_title} (NEW) ---\n{new_clauses}"},
        ],
        temperature=0.3,
        max_tokens=1024,
        timeout=30,
    )
    return response.choices[0].message.content