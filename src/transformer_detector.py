"""
Transformer-based Detector Module
====================================
Loads the fine-tuned XLM-RoBERTa model and performs inference.

Designed as a drop-in supplement to the existing TF-IDF detector.
The API falls back to TF-IDF if this model is not yet trained.
"""

import logging
import re
from pathlib import Path
from typing import Optional, Tuple

logger = logging.getLogger(__name__)

MODEL_DIR = Path(__file__).resolve().parent.parent / "outputs" / "xlmr_model"

# Cached globals (loaded once at startup)
_model = None
_tokenizer = None
_device = None


def is_transformer_available() -> bool:
    """Returns True only if the fine-tuned model directory exists."""
    return (MODEL_DIR / "config.json").exists()


def load_transformer_model() -> bool:
    """
    Load the fine-tuned XLM-RoBERTa model into memory.

    Returns True on success, False on any failure.
    Only loads once — subsequent calls are instant.
    """
    global _model, _tokenizer, _device

    if _model is not None:
        return True  # Already loaded

    if not is_transformer_available():
        logger.info("Transformer model not found at %s — using TF-IDF fallback", MODEL_DIR)
        return False

    try:
        import torch
        from transformers import AutoModelForSequenceClassification, AutoTokenizer

        _device = "cuda" if torch.cuda.is_available() else "cpu"
        logger.info("Loading XLM-RoBERTa from %s on %s", MODEL_DIR, _device)

        _tokenizer = AutoTokenizer.from_pretrained(str(MODEL_DIR))
        _model = AutoModelForSequenceClassification.from_pretrained(str(MODEL_DIR))
        _model.to(_device)
        _model.eval()

        logger.info("Transformer model loaded successfully (device=%s)", _device)
        return True

    except Exception:
        logger.exception("Failed to load transformer model — falling back to TF-IDF")
        _model = None
        _tokenizer = None
        return False


def predict_with_transformer(text: str) -> Optional[Tuple[str, float]]:
    """
    Run inference using the loaded XLM-RoBERTa model.

    Args:
        text: Raw news text (Nepali or English)

    Returns:
        Tuple of (verdict, probability_fake) or None if model unavailable.
        - verdict: "Credible" or "Uncredible"
        - probability_fake: 0.0–1.0
    """
    if _model is None or _tokenizer is None:
        return None

    try:
        import torch

        # Clean and cap text length for tokenizer safety
        clean = re.sub(r"\s+", " ", str(text or "")).strip()[:1500]
        if len(clean) < 5:
            return None

        inputs = _tokenizer(
            clean,
            return_tensors="pt",
            truncation=True,
            max_length=256,
            padding=True,
        )
        inputs = {k: v.to(_device) for k, v in inputs.items()}

        with torch.no_grad():
            logits = _model(**inputs).logits
            probs = torch.softmax(logits, dim=-1)[0]

        prob_fake = float(probs[1].item())
        verdict = "Uncredible" if prob_fake >= 0.5 else "Credible"

        logger.debug("Transformer prediction: %s (p_fake=%.3f)", verdict, prob_fake)
        return verdict, prob_fake

    except Exception:
        logger.exception("Transformer inference failed")
        return None
