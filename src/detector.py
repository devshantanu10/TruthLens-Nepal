"""
News Authenticity Detector Module
==================================

This module provides comprehensive news credibility analysis using:
- Machine Learning-based classification
- Database matching for known articles
- Live news cross-referencing
- Heuristic analysis (clickbait, sensationalism detection)
- Political bias detection

Author: TruthLens 
Version: 2.0
"""

import re
import logging
import pandas as pd
import joblib
from typing import Tuple, List, Dict, Optional
from .config import (
    MODEL_PATH, DATA_PATH_TRUE, DATA_PATH_FAKE,
    CLICKBAIT_TRIGGERS, SENSATIONALISM_MARKERS,
    POLITICAL_PARTIES, MIN_TEXT_LENGTH,
    ML_MODEL_WEIGHT, HEURISTIC_WEIGHT
)

# Configure logging
logger = logging.getLogger(__name__)

# ============================================================================
# TEXT PROCESSING
# ============================================================================
def clean_text(text: str) -> str:
    """
    Clean and normalize text for NLP processing.
    
    Processing steps:
    1. Convert to lowercase
    2. Remove special characters (keep Nepali & English)
    3. Remove extra whitespace
    
    Args:
        text (str): Raw text input
        
    Returns:
        str: Cleaned text
    """
    if not isinstance(text, str):
        return ""
    
    # Convert to lowercase for consistency
    text = text.lower()
    
    # IMPORTANT: Keep this consistent with train_model.py — strip numbers too,
    # since the model was trained without numbers in the vocabulary.
    text = re.sub(r"[^\u0900-\u097Fa-z\s]", " ", text)
    
    # Remove extra whitespace
    text = re.sub(r"\s+", " ", text).strip()
    
    return text


def validate_text(text: str, min_length: int = MIN_TEXT_LENGTH) -> Tuple[bool, str]:
    """
    Validate text input before processing.
    
    Args:
        text (str): Input text
        min_length (int): Minimum required length
        
    Returns:
        Tuple[bool, str]: (is_valid, error_message)
    """
    if not text or not isinstance(text, str):
        return False, "Input must be valid text"
    
    if len(text.strip()) < min_length:
        return False, f"Input must be at least {min_length} characters"
    
    return True, ""


# ============================================================================
# MODEL & DATA LOADING
# ============================================================================
def load_model() -> Optional[object]:
    """
    Load trained ML pipeline model with error handling.
    
    Returns:
        Optional[object]: Loaded pipeline or None if failed
    """
    try:
        logger.info(f"Loading model from {MODEL_PATH}")
        model = joblib.load(MODEL_PATH)
        logger.info("Model loaded successfully")
        return model
    except FileNotFoundError:
        logger.error(f"Model file not found: {MODEL_PATH}")
        return None
    except Exception as e:
        logger.error(f"Error loading model: {e}")
        return None


def load_datasets() -> Tuple[Optional[pd.DataFrame], Optional[pd.DataFrame]]:
    """
    Load true and fake news datasets.
    """
    try:
        true_df = pd.read_csv(DATA_PATH_TRUE)
        fake_df = pd.read_csv(DATA_PATH_FAKE)
        logger.info(f"Datasets loaded: {len(true_df)} true, {len(fake_df)} fake articles")
        return true_df, fake_df
    except Exception as e:
        logger.error(f"Error loading datasets: {e}")
        return None, None

# Global datasets for performance
TRUE_DATASET, FAKE_DATASET = load_datasets()


# ============================================================================
# ANALYSIS PHASES
# ============================================================================
def phase_1_database_lookup(
    text: str,
    cleaned_text: str,
    true_df: Optional[pd.DataFrame],
    fake_df: Optional[pd.DataFrame]
) -> Optional[Tuple[str, float, List[str]]]:
    """
    Phase 1: Check for exact matches in known databases.
    
    Args:
        text (str): Original text
        cleaned_text (str): Cleaned text
        true_df (Optional[pd.DataFrame]): True news dataset
        fake_df (Optional[pd.DataFrame]): Fake news dataset
        
    Returns:
        Optional[Tuple]: (verdict, confidence, reasons) or None if no match
    """
    if true_df is None or fake_df is None:
        return None
    
    try:
        # Only do database lookup for longer texts (>80 chars cleaned) to avoid false matches
        if len(cleaned_text) > 80:
            # Check FAKE first — higher priority to catch misinformation
            for val in fake_df.get('text', []):
                cv = clean_text(str(val))
                if len(cv) < 80:
                    continue
                # Require a very high overlap (80%+ of words match in both directions)
                set_input = set(cleaned_text.split())
                set_val = set(cv.split())
                if len(set_input) == 0 or len(set_val) == 0:
                    continue
                overlap = len(set_input & set_val) / min(len(set_input), len(set_val))
                if overlap > 0.8:
                    return "Uncredible", 0.97, ["🚨 गलत सूचना डेटाबेसमा भेटियो — पूर्व-दस्तावेजीकृत झूटा खबर"]
            
            # Then check TRUE
            for val in true_df.get('text', []):
                cv = clean_text(str(val))
                if len(cv) < 80:
                    continue
                set_input = set(cleaned_text.split())
                set_val = set(cv.split())
                if len(set_input) == 0 or len(set_val) == 0:
                    continue
                overlap = len(set_input & set_val) / min(len(set_input), len(set_val))
                if overlap > 0.8:
                    return "Credible", 0.97, ["✅ विश्वसनीय समाचार डेटाबेसमा भेटियो"]
    
    except Exception as e:
        logger.warning(f"Database lookup error: {e}")
    
    return None


def phase_2_live_news_cross_reference(
    cleaned_text: str,
    live_news: Optional[List[Dict]]
) -> bool:
    """
    Phase 2: Cross-reference with live news from trusted sources.
    Excludes the current article if it matches the input content exactly.
    
    Args:
        cleaned_text (str): Cleaned input text
        live_news (Optional[List[Dict]]): Live news articles
        
    Returns:
        bool: Whether text was verified via live news
    """
    if not live_news:
        return False
    
    try:
        input_keywords = set(cleaned_text.split())
        
        for article in live_news:
            article_text = f"{article.get('title', '')} {article.get('description', '')}"
            article_cleaned = clean_text(article_text)
            
            # CRITICAL FIX: If the cleaned text is nearly identical to the live news article,
            # it might be the article itself. We need to find DIFFERENT sources reporting the same thing.
            if cleaned_text in article_cleaned or article_cleaned in cleaned_text:
                continue
                
            article_keywords = set(article_cleaned.split())
            intersection = input_keywords.intersection(article_keywords)
            
            # If >70% of keywords match (minimum 5 keywords) and it's from a different source, consider verified
            if len(input_keywords) >= 5 and len(intersection) / len(input_keywords) > 0.7:
                return True
    
    except Exception as e:
        logger.warning(f"Live news cross-reference error: {e}")
    
    return False


def detect_political_bias(text: str) -> List[str]:
    """
    Detect political entities and potential bias.
    
    Args:
        text (str): Input text
        
    Returns:
        List[str]: Detected political parties/entities
    """
    detected = []
    text_lower = text.lower()
    
    for party, keywords in POLITICAL_PARTIES.items():
        if any(keyword in text_lower for keyword in keywords):
            detected.append(party)
    
    return detected


def phase_3_heuristic_analysis(text: str) -> float:
    """
    Analyze heuristic factors (clickbait, sensationalism).
    
    Args:
        text (str): Input text
        
    Returns:
        float: Heuristic score (0-1)
    """
    heuristic_score = 0.0
    
    # Check for sensationalism markers
    for marker in SENSATIONALISM_MARKERS:
        if marker in text:
            heuristic_score += 0.2
            break
    
    # Check for clickbait triggers
    text_lower = text.lower()
    for trigger in CLICKBAIT_TRIGGERS:
        if trigger in text_lower:
            heuristic_score += 0.25
            break
    
    # Check for ALL CAPS (except common acronyms)
    caps_percentage = sum(1 for c in text if c.isupper()) / max(len(text), 1)
    if caps_percentage > 0.3:
        heuristic_score += 0.15
    
    return min(heuristic_score, 1.0)


def phase_4_ml_prediction(
    cleaned_text: str,
    pipeline: Optional[object]
) -> float:
    """
    ML-based prediction using trained model.
    
    Args:
        cleaned_text (str): Cleaned text
        pipeline (Optional[object]): Trained ML pipeline
        
    Returns:
        float: Probability of being fake (0-1)
    """
    if not pipeline:
        return 0.5
    
    try:
        probability = pipeline.predict_proba([cleaned_text])[0, 1]
        return float(probability)
    except Exception as e:
        logger.error(f"ML prediction error: {e}")
        return 0.5


# ============================================================================
# MAIN PREDICTION FUNCTION
# ============================================================================
def predict_authenticity(
    text: str,
    pipeline: Optional[object],
    threshold: float = 0.5,
    live_news: Optional[List[Dict]] = None
) -> Tuple[str, float, List[str], float, List[str]]:
    """
    Comprehensive news authenticity prediction using multi-phase analysis.
    
    Analysis Phases:
    1. Database Lookup: Check against known datasets
    2. Live News Cross-Reference: Verify with trusted sources
    3. Heuristic Analysis: Detect clickbait & sensationalism
    4. ML Prediction: Use trained model
    5. Final Consensus: Combine all scores
    
    Args:
        text (str): News text to analyze
        pipeline (Optional[object]): Trained ML model
        threshold (float): Decision threshold (0-1)
        live_news (Optional[List[Dict]]): Live news articles for verification
        
    Returns:
        Tuple: (verdict, confidence_score, reasons, heuristic_score, parties_detected)
        
    Verdict: "Credible" or "Uncredible"
    Confidence: 0-1 (1 = very likely fake)
    Reasons: List of analysis findings
    Heuristic Score: 0-1 sensationalism level
    Parties: List of political entities detected
    """
    # Input validation
    is_valid, error_msg = validate_text(text)
    if not is_valid:
        return "Invalid Input", 0.0, [f"⚠️ {error_msg}"], 0.0, []
    
    cleaned = clean_text(text)
    reasons = []
    
    # ===== PHASE 1: DATABASE LOOKUP =====
    # Use global datasets
    true_df, fake_df = TRUE_DATASET, FAKE_DATASET
    
    # Ensure cleaned text is not empty
    if not cleaned:
        return "Invalid Input", 0.0, ["⚠️ Input contains no valid text for analysis"], 0.0, []
        
    phase1_result = phase_1_database_lookup(text, cleaned, true_df, fake_df)
    
    if phase1_result:
        verdict, score, phase1_reasons = phase1_result
        return verdict, score, phase1_reasons, 0.0, []
    
    # ===== PHASE 2: LIVE NEWS & BIAS =====
    source_verified = phase_2_live_news_cross_reference(cleaned, live_news)
    detected_parties = detect_political_bias(text)
    
    if source_verified:
        reasons.append("✅ Verified by cross-referencing with trusted news sources")
    else:
        reasons.append("⚠️ No matching report found in trusted news sources")
    
    if detected_parties:
        reasons.append(f"📊 Political entities detected: {', '.join(detected_parties)}")
    
    # ===== PHASE 3: HEURISTIC ANALYSIS =====
    heuristic_score = phase_3_heuristic_analysis(text)
    
    if heuristic_score > 0.3:
        reasons.append("📢 Detected sensationalism or clickbait markers")
    
    # ===== PHASE 4: ML PREDICTION =====
    ml_probability = phase_4_ml_prediction(cleaned, pipeline)
    
    # ===== FINAL CONSENSUS =====
    # final_score represents probability of being UNCREDIBLE
    # We trust the ML model strongly. Live news cross-reference is disabled
    # (live_news=None from API) to avoid slow fetches during prediction.
    final_score = (ml_probability * ML_MODEL_WEIGHT) + (heuristic_score * HEURISTIC_WEIGHT)
    final_score = min(max(final_score, 0.0), 1.0)
    
    # Determine verdict
    is_fake = final_score >= threshold
    verdict = "Uncredible" if is_fake else "Credible"
    
    # Confidence should reflect how confident we are in the VERDICT:
    # - If Uncredible: confidence = final_score (how sure we are it's fake)
    # - If Credible: confidence = 1 - final_score (how sure we are it's real)
    confidence = final_score if is_fake else (1.0 - final_score)
    
    logger.info(f"Prediction: {verdict} (Confidence: {confidence:.2%}, Raw Score: {final_score:.2%})")
    
    return verdict, confidence, reasons, heuristic_score, detected_parties
