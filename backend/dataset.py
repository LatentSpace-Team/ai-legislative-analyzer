"""
dataset.py — Zenodo dataset loader
Two modes:
  1. fetch_by_names()  — fetch acts by name (used with LLM-guided retrieval)
  2. search_acts()     — TF-IDF fallback if LLM returns no names
"""

import os
import json
import re
import math
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

ZENODO_DIR = Path(__file__).parent.parent / "data" / "zenodo"

_acts: list[dict] = []       # [{title, text, path}]
_tfidf_matrix: list[dict] = []
_idf: dict = {}
_loaded = False


def _tokenize(text: str) -> list[str]:
    text = text.lower()
    text = re.sub(r'[^a-z0-9\s]', ' ', text)
    return [t for t in text.split() if len(t) > 2]


def _load_act_text(path: Path) -> tuple[str, str]:
    try:
        with open(path, encoding='utf-8') as f:
            data = json.load(f)

        # Correct field names from Zenodo dataset
        title = data.get("Act Title", data.get("title", path.stem))

        sections = data.get("Sections", data.get("sections", []))
        if isinstance(sections, list) and sections:
            parts = []
            for s in sections:
                num     = s.get("section_number", s.get("Section Number", ""))
                stitle  = s.get("section_title",  s.get("Section Title", ""))
                content = s.get("section_content", s.get("Section Content", s.get("content", "")))
                parts.append(f"Section {num}. {stitle}\n{content}")
            full_text = f"{title}\n\n" + "\n\n".join(parts)
        elif isinstance(sections, dict):
            # Some acts have sections as dict
            parts = []
            for key, val in sections.items():
                if isinstance(val, str):
                    parts.append(val)
                elif isinstance(val, dict):
                    parts.append(val.get("Section Content", val.get("content", str(val))))
            full_text = f"{title}\n\n" + "\n\n".join(parts)
        else:
            # Fallback — dump Act Definition
            full_text = title + "\n\n" + data.get("Act Definition", "")

        return title, full_text
    except Exception as e:
        logger.warning(f"Could not load {path}: {e}")
        return path.stem, ""


def _build_index():
    global _acts, _tfidf_matrix, _idf, _loaded

    json_files = list(ZENODO_DIR.glob("*.json"))
    if not json_files:
        logger.warning(f"No JSON files in {ZENODO_DIR}")
        _loaded = True
        return

    logger.info(f"Building index over {len(json_files)} acts...")

    doc_freq: dict[str, int] = {}
    corpus: list[dict] = []

    for path in json_files:
        title, text = _load_act_text(path)
        if not text.strip():
            continue

        _acts.append({"title": title, "text": text})

        tokens = _tokenize(title + " " + text[:5000])
        tf: dict[str, float] = {}
        for t in tokens:
            tf[t] = tf.get(t, 0) + 1
        total = max(len(tokens), 1)
        tf = {k: v / total for k, v in tf.items()}

        for term in tf:
            doc_freq[term] = doc_freq.get(term, 0) + 1

        corpus.append({"title": title, "text": text, "tf": tf})

    N = len(corpus)
    _idf = {term: math.log(N / (1 + df)) for term, df in doc_freq.items()}
    _tfidf_matrix = [
        {
            "title": doc["title"],
            "text":  doc["text"],
            "tfidf": {t: tf * _idf.get(t, 0) for t, tf in doc["tf"].items()}
        }
        for doc in corpus
    ]

    _loaded = True
    logger.info(f"Index ready: {len(_acts)} acts loaded.")


def _ensure_loaded():
    if not _loaded:
        _build_index()


def fetch_by_names(act_names: list[str], top_k: int = 3) -> list[dict]:
    """
    Fetch acts by name match.
    LLM returns act names → we find them in the dataset.
    Uses fuzzy substring matching so partial names work.
    """
    _ensure_loaded()
    if not act_names:
        return []

    results = []
    for act in _acts:
        title_lower = act["title"].lower()
        for name in act_names:
            name_lower = name.lower()
            # Check if any significant words from the LLM name appear in the title
            words = [w for w in name_lower.split() if len(w) > 3]
            matches = sum(1 for w in words if w in title_lower)
            if matches >= max(1, len(words) // 2):
                results.append({
                    "title": act["title"],
                    "text":  act["text"],
                    "score": matches / max(len(words), 1),
                })
                break

    # Sort by score, return top_k
    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:top_k]


def search_acts_tfidf(query: str, top_k: int = 3) -> list[dict]:
    """TF-IDF fallback when LLM-guided retrieval finds nothing."""
    _ensure_loaded()
    if not _tfidf_matrix:
        return []

    query_tokens = _tokenize(query)
    query_tfidf: dict[str, float] = {}
    for t in query_tokens:
        query_tfidf[t] = query_tfidf.get(t, 0) + 1
    total = max(len(query_tokens), 1)
    query_tfidf = {k: (v / total) * _idf.get(k, 0) for k, v in query_tfidf.items()}

    scores = []
    for doc in _tfidf_matrix:
        score = sum(
            query_tfidf.get(t, 0) * doc["tfidf"].get(t, 0)
            for t in query_tfidf
        )
        if score > 0:
            scores.append({"title": doc["title"], "text": doc["text"], "score": score})

    scores.sort(key=lambda x: x["score"], reverse=True)
    return scores[:top_k]


def get_combined_act_text(
    query: str,
    act_names: list[str] = None,
    top_k: int = 3
) -> tuple[str, list[str]]:
    """
    Main entry point.
    1. If act_names provided (from LLM) → fetch by name
    2. Fallback → TF-IDF search
    """
    _ensure_loaded()

    # Try LLM-guided first
    if act_names:
        results = fetch_by_names(act_names, top_k=top_k)
        if results:
            logger.info(f"LLM-guided retrieval found: {[r['title'] for r in results]}")
        else:
            logger.info("LLM-guided retrieval found nothing, falling back to TF-IDF")
            results = search_acts_tfidf(query, top_k=top_k)
    else:
        results = search_acts_tfidf(query, top_k=top_k)

    if not results:
        return "", []

    combined = "\n\n" + ("=" * 60 + "\n\n").join(
        f"ACT: {r['title']}\n\n{r['text']}" for r in results
    )
    titles = [r["title"] for r in results]
    return combined, titles


def get_index_size() -> int:
    _ensure_loaded()
    return len(_acts)