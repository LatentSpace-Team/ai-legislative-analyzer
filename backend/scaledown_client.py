import os
import logging
import requests
from dataclasses import dataclass

logger = logging.getLogger(__name__)

SCALEDOWN_URL = "https://api.scaledown.xyz/compress/raw/"

@dataclass
class CompressionResult:
    compressed_text:   str
    original_tokens:   int
    compressed_tokens: int
    tokens_saved:      int
    compression_ratio: float
    savings_percent:   float


def compress(context: str, prompt: str) -> CompressionResult:
    api_key = os.getenv("SCALEDOWN_API_KEY")
    if not api_key:
        raise RuntimeError("SCALEDOWN_API_KEY not set in .env")

    response = requests.post(
        SCALEDOWN_URL,
        headers={
            "x-api-key":    api_key,
            "Content-Type": "application/json",
        },
        json={
            "context":   context,
            "prompt":    prompt,
            "scaledown": {"rate": "auto"},
        },
        timeout=60,
    )

    if response.status_code != 200:
        raise RuntimeError(f"ScaleDown API error {response.status_code}: {response.text}")

    outer = response.json()

    # ── Response is nested under "results" ──────────────────────────────────
    data = outer.get("results", outer)

    original   = data.get("original_prompt_tokens", 0)
    compressed = data.get("compressed_prompt_tokens", 0)
    saved      = original - compressed
    ratio      = round(original / max(compressed, 1), 2)
    savings    = round((saved / max(original, 1)) * 100, 1)

    logger.info(f"[ScaleDown] {original} → {compressed} tokens | saved {saved} | {savings}%")

    return CompressionResult(
        compressed_text=data["compressed_prompt"],
        original_tokens=original,
        compressed_tokens=compressed,
        tokens_saved=saved,
        compression_ratio=ratio,
        savings_percent=savings,
    )


def compress_batch(contexts: list, prompts: list) -> list:
    results = []
    for context, prompt in zip(contexts, prompts):
        try:
            results.append(compress(context, prompt))
        except Exception as e:
            logger.error(f"Batch compress failed: {e}")
            results.append(CompressionResult(
                compressed_text=context[:500],
                original_tokens=0,
                compressed_tokens=0,
                tokens_saved=0,
                compression_ratio=1.0,
                savings_percent=0.0,
            ))
    return results