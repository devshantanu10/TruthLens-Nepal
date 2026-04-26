"""
News Authenticity Detector Module
==================================

This module provides comprehensive news credibility analysis using:
- Machine Learning-based classification
- Database matching for known articles
- Live news cross-referencing
- Heuristic analysis (clickbait, sensationalism detection)
- Political bias detection

Author: TruthLens Team
Version: 2.0
"""

import re
import logging
import pandas as pd
import joblib
import streamlit as st
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
    
    # Remove special characters while keeping Nepali (0900-097F) & English
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


@st.cache_data(ttl=3600)
def load_datasets() -> Tuple[Optional[pd.DataFrame], Optional[pd.DataFrame]]:
    """
    Load true and fake news datasets.
    
    Returns:
        Tuple: (true_df, fake_df) or (None, None) if failed
    """
    try:
        true_df = pd.read_csv(DATA_PATH_TRUE)
        fake_df = pd.read_csv(DATA_PATH_FAKE)
        logger.info(f"Datasets loaded: {len(true_df)} true, {len(fake_df)} fake articles")
        return true_df, fake_df
    except FileNotFoundError as e:
        logger.error(f"Dataset not found: {e}")
        return None, None
    except Exception as e:
        logger.error(f"Error loading datasets: {e}")
        return None, None


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
        # Check for exact match in true news
        if any(cleaned_text in clean_text(str(val)) for val in true_df.get('text', [])):
            return "Credible", 1.0, ["✅ Verified in trusted news database"]
        
        # Check for exact match in fake news
        if any(cleaned_text in clean_text(str(val)) for val in fake_df.get('text', [])):
            return "Uncredible", 1.0, ["🚨 Found in documented misinformation database"]
    
    except Exception as e:
        logger.warning(f"Database lookup error: {e}")
    
    return None


def phase_2_live_news_cross_reference(
    cleaned_text: str,
    live_news: Optional[List[Dict]]
) -> bool:
    """
    Phase 2: Cross-reference with live news from trusted sources.
    
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
            article_keywords = set(clean_text(article_text).split())
            
            intersection = input_keywords.intersection(article_keywords)
            
            # If >40% of keywords match, consider verified
            if len(input_keywords) > 0 and len(intersection) / len(input_keywords) > 0.4:
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
    # Load datasets once and reuse
    true_df, fake_df = load_datasets()
    
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
    # Adjust ML probability based on live news verification
    # If source is verified, we have high confidence it's credible
    if source_verified:
        # Heavily discount fake news probability if verified by trusted sources
        adjusted_ml_prob = ml_probability * 0.3
    else:
        # If not found in live news, we don't force 'Uncredible', 
        # but we add a slight caution weight to the ML result.
        adjusted_ml_prob = min(ml_probability + 0.1, 1.0)
    
    # Combine scores with weights
    # final_score represents probability of being UNCREDIBLE
    final_score = (adjusted_ml_prob * ML_MODEL_WEIGHT) + (heuristic_score * HEURISTIC_WEIGHT)
    final_score = min(max(final_score, 0.0), 1.0)
    
    # Determine verdict
    is_fake = final_score >= threshold
    verdict = "Uncredible" if is_fake else "Credible"
    
    logger.info(f"Prediction: {verdict} (Score: {final_score:.2%})")
    
    return verdict, final_score, reasons, heuristic_score, detected_parties
