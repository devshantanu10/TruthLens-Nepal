"""
Cache Module — TruthLens Nepal
================================
Provides a lightweight SQLite-backed caching layer for:
  - News authenticity predictions  (/api/predict)
  - AI-generated summaries         (/api/summary)

Using Python's built-in `sqlite3` means zero extra dependencies.
The database file is stored at `data/cache.db` and is automatically
created on first use.

Usage:
    from src.cache import get_cached_prediction, set_cached_prediction
    from src.cache import get_cached_summary, set_cached_summary
"""

import sqlite3
import hashlib
import json
import logging
import os
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

# Location of the SQLite database file
_DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'cache.db')


# ──────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────

def _hash(text: str) -> str:
    """Return a stable SHA-256 hex digest for the given text."""
    return hashlib.sha256(text.strip().lower().encode('utf-8')).hexdigest()


def _get_connection() -> sqlite3.Connection:
    """Open a connection to the SQLite database, creating it if necessary."""
    os.makedirs(os.path.dirname(_DB_PATH), exist_ok=True)
    conn = sqlite3.connect(_DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """
    Create the cache tables if they do not already exist.
    Call this once at application startup.
    """
    try:
        with _get_connection() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS predictions (
                    text_hash   TEXT PRIMARY KEY,
                    verdict     TEXT NOT NULL,
                    confidence  REAL,
                    reasons     TEXT NOT NULL,   -- JSON array
                    h_score     REAL NOT NULL,
                    parties     TEXT NOT NULL,   -- JSON array
                    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS summaries (
                    text_hash   TEXT PRIMARY KEY,
                    summary     TEXT NOT NULL,
                    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            """)
        logger.info("Cache database initialised at %s", _DB_PATH)
    except Exception:
        logger.exception("Failed to initialise cache database")


# ──────────────────────────────────────────────────
# Prediction Cache
# ──────────────────────────────────────────────────

def get_cached_prediction(text: str) -> Optional[Dict[str, Any]]:
    """
    Look up a previous prediction result by input text.

    Returns:
        A dict with keys {verdict, confidence, reasons, heuristic_score, parties}
        if a cache hit is found, otherwise None.
    """
    key = _hash(text)
    try:
        with _get_connection() as conn:
            row = conn.execute(
                "SELECT * FROM predictions WHERE text_hash = ?", (key,)
            ).fetchone()
            if row:
                logger.debug("Cache HIT for prediction (hash=%s)", key[:8])
                return {
                    'verdict':        row['verdict'],
                    'confidence':     row['confidence'],
                    'reasons':        json.loads(row['reasons']),
                    'heuristic_score': row['h_score'],
                    'parties':        json.loads(row['parties']),
                    '_from_cache':    True,
                }
    except Exception:
        logger.exception("Error reading prediction cache")
    return None


def set_cached_prediction(
    text: str,
    verdict: str,
    confidence: Optional[float],
    reasons: list,
    heuristic_score: float,
    parties: list,
) -> None:
    """
    Persist a prediction result so future identical requests are served instantly.
    """
    key = _hash(text)
    try:
        with _get_connection() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO predictions
                    (text_hash, verdict, confidence, reasons, h_score, parties)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    key,
                    verdict,
                    confidence,
                    json.dumps(reasons, ensure_ascii=False),
                    heuristic_score,
                    json.dumps(parties, ensure_ascii=False),
                ),
            )
        logger.debug("Cache SET for prediction (hash=%s)", key[:8])
    except Exception:
        logger.exception("Error writing prediction cache")


# ──────────────────────────────────────────────────
# Summary Cache
# ──────────────────────────────────────────────────

def get_cached_summary(text: str) -> Optional[str]:
    """
    Look up a previously generated summary.

    Returns:
        The cached summary string, or None if not found.
    """
    key = _hash(text)
    try:
        with _get_connection() as conn:
            row = conn.execute(
                "SELECT summary FROM summaries WHERE text_hash = ?", (key,)
            ).fetchone()
            if row:
                logger.debug("Cache HIT for summary (hash=%s)", key[:8])
                return row['summary']
    except Exception:
        logger.exception("Error reading summary cache")
    return None


def set_cached_summary(text: str, summary: str) -> None:
    """
    Persist a generated summary for future instant retrieval.
    """
    key = _hash(text)
    try:
        with _get_connection() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO summaries (text_hash, summary) VALUES (?, ?)",
                (key, summary),
            )
        logger.debug("Cache SET for summary (hash=%s)", key[:8])
    except Exception:
        logger.exception("Error writing summary cache")
