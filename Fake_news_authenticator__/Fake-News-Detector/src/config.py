"""
Configuration Module for TruthLens Nepal
=========================================

Centralized configuration management for the application including:
- File paths and model locations
- API keys and credentials
- UI styling constants
- News source definitions
- Model parameters
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# ============================================================================
# ENVIRONMENT SETUP
# ============================================================================
load_dotenv()

# Get project root directory
PROJECT_ROOT = Path(__file__).parent.parent
DATA_DIR = PROJECT_ROOT / "data"
OUTPUTS_DIR = PROJECT_ROOT / "outputs"

# ============================================================================
# APPLICATION METADATA
# ============================================================================
APP_NAME = "TruthLens Nepal"
APP_VERSION = "2.0"
APP_ICON = "🛡️"
APP_TAGLINE = "AI-Powered Forensic News Verification Engine"
APP_DESCRIPTION = "Detect fake vs. real news with advanced ML and forensic analysis"

# ============================================================================
# FILE PATHS & MODELS
# ============================================================================
MODEL_PATH = str(OUTPUTS_DIR / "pipeline.joblib")
VECTORIZER_PATH = str(OUTPUTS_DIR / "vectorizer.joblib")
METRICS_PATH = str(OUTPUTS_DIR / "metrics.json")

# Dataset paths
DATA_PATH_TRUE = str(DATA_DIR / "True.csv")
DATA_PATH_FAKE = str(DATA_DIR / "Fake.csv")

# ============================================================================
# API & AUTHENTICATION
# ============================================================================
# API Keys (Use environment variables in production)
NEWSDATA_API_KEY = os.getenv("NEWSDATA_API_KEY", "pub_72186835a6435c44f33161c575a6c38210356")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")

# Default credentials (CHANGE IN PRODUCTION)
DEFAULT_CREDENTIALS = {
    "admin": "nepal123",
    "user": "truthlens"
}

# ============================================================================
# TRUSTED NEWS SOURCES
# ============================================================================
TRUSTED_SOURCES = [
    {
        "name": "Onlinekhabar",
        "rss": "https://www.onlinekhabar.com/feed",
        "reliability_score": 0.95,
        "category": "General News"
    },
    {
        "name": "Setopati",
        "rss": "https://www.setopati.com/feed",
        "reliability_score": 0.93,
        "category": "General News"
    },
    {
        "name": "Kathmandu Post",
        "rss": "https://kathmandupost.com/rss",
        "reliability_score": 0.92,
        "category": "General News"
    },
    {
        "name": "Nagarik News",
        "rss": "https://nagariknews.com/feed",
        "reliability_score": 0.90,
        "category": "General News"
    }
]

# ============================================================================
# UI & STYLING CONSTANTS - NEPAL COLORS
# ============================================================================
# Nepal Official Colors
PRIMARY_COLOR = "#C60C30"              # Crimson Red (from Nepal flag)
PRIMARY_DARK = "#8B0A23"               # Darker crimson
PRIMARY_LIGHT = "#E63B52"              # Lighter crimson

SECONDARY_COLOR = "#003893"            # Traditional Nepal Blue
SECONDARY_DARK = "#002654"             # Darker blue
SECONDARY_LIGHT = "#0052CC"            # Lighter blue

ACCENT_COLOR = "#FF9933"               # Gold/Saffron (cultural)
ACCENT_ORANGE = "#FF6B35"              # Deep orange

BG_PRIMARY = "#0D0E11"                 # Deep dark
BG_SECONDARY = "#1A1D24"               # Dark blue-gray
BG_TERTIARY = "#252B36"                # Medium dark

TEXT_PRIMARY = "#FFFFFF"               # White
TEXT_SECONDARY = "#B8BEC8"             # Light gray

# Old color references (for backward compatibility)
PRIMARY_COLOR_OLD = "#00d084"
SECONDARY_COLOR_OLD = "#ff4b4b"

# Typography
FONT_FAMILY = "Poppins, Inter, sans-serif"
FONT_SIZE_LARGE = "1.8rem"
FONT_SIZE_NORMAL = "0.95rem"
FONT_SIZE_SMALL = "0.75rem"

# ============================================================================
# MODEL & ML PARAMETERS
# ============================================================================
# Model Configuration
MODEL_TYPE = "LogisticRegression"
VECTORIZER_TYPE = "TfidfVectorizer"
FEATURE_EXTRACTION = "TF-IDF"

# Prediction Parameters
PREDICTION_THRESHOLD = 0.5
MIN_TEXT_LENGTH = 5
CONFIDENCE_LEVELS = {
    "very_high": (0.80, 1.0),
    "high": (0.60, 0.80),
    "moderate": (0.40, 0.60),
    "low": (0.0, 0.40)
}

# Analysis Weights
ML_MODEL_WEIGHT = 0.7
HEURISTIC_WEIGHT = 0.3
LIVE_NEWS_WEIGHT = 0.2

# ============================================================================
# NEWS FETCHING PARAMETERS
# ============================================================================
# RSS Feed Configuration
FEED_TIMEOUT = 5  # seconds
MAX_ARTICLES_PER_SOURCE = 8
TOTAL_ARTICLES_DISPLAY = 15
CACHE_TTL = 300  # seconds (5 minutes)

# ============================================================================
# CLICKBAIT & SENSATIONALISM TRIGGERS
# ============================================================================
CLICKBAIT_TRIGGERS = [
    "भर्खरै",      # Just now
    "बिष्फोटक",    # Explosive
    "खुलासा",      # Revelation
    "आश्चर्यजनक",  # Surprising
    "ब्रेकिङ्ग",    # Breaking
    "BREAKING",
    "EXCLUSIVE",
    "SHOCKING",
    "VIRAL"
]

SENSATIONALISM_MARKERS = ["!!!", "???", "***", "...!!!"]

# ============================================================================
# NEPALI POLITICAL PARTIES (FOR BIAS DETECTION)
# ============================================================================
POLITICAL_PARTIES = {
    "UML / एमाले": ["एमाले", "केपी ओली", "uml", "नेकपा एमाले"],
    "Congress / कांग्रेस": ["कांग्रेस", "देउवा", "congress", "नेपाली कांग्रेस"],
    "Maoist / माओवादी": ["माओवादी", "प्रचण्ड", "maoist", "नेकपा माओवादी"],
    "RSP / रास्वपा": ["रास्वपा", "रवि लामिछाने", "rsp"]
}

# ============================================================================
# LOGGING CONFIGURATION
# ============================================================================
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
LOG_FILE = str(PROJECT_ROOT / "logs" / "app.log")

# ============================================================================
# PERFORMANCE & OPTIMIZATION
# ============================================================================
# Caching
ENABLE_CACHING = True
CACHE_TTL_MODEL = 3600  # 1 hour
CACHE_TTL_DATA = 600    # 10 minutes

# Threading
MAX_WORKERS = 4  # For concurrent news fetching

# ============================================================================
# SECURITY
# ============================================================================
# Session timeout (in minutes)
SESSION_TIMEOUT = 30

# Rate limiting
MAX_PREDICTIONS_PER_MINUTE = 100

# ============================================================================
# FEATURE FLAGS
# ============================================================================
ENABLE_GOOGLE_SEARCH = True
ENABLE_BIAS_DETECTION = True
ENABLE_EXPORT_RESULTS = False  # Coming soon
ENABLE_DARK_MODE = True
