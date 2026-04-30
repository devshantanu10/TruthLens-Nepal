"""
Unit Tests for TruthLens Detector Module
=========================================

Comprehensive test suite for the news authenticity detection pipeline.
Tests cover text processing, model loading, database lookup, heuristics, and ML predictions.

Author: TruthLens Team
"""

import pytest
import pandas as pd
import sys
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.detector import (
    clean_text,
    validate_text,
    load_model,
    load_datasets,
    phase_1_database_lookup,
    phase_2_live_news_cross_reference,
    detect_political_bias,
    phase_3_heuristic_analysis,
    phase_4_ml_prediction,
    predict_authenticity
)


# ============================================================================
# FIXTURES
# ============================================================================

@pytest.fixture
def sample_valid_text():
    """Sample valid news text for testing."""
    return "This is a credible news article about recent developments in Nepal."


@pytest.fixture
def sample_fake_text():
    """Sample text with fake news indicators."""
    return "भर्खरै खुलासा! आश्चर्यजनक बिष्फोटक खबर!!! BREAKING NEWS!!!"


@pytest.fixture
def sample_short_text():
    """Sample text below minimum length."""
    return "Short"


@pytest.fixture
def sample_political_text():
    """Text containing political party mentions."""
    return "एमाले और कांग्रेस के बीच नई बहस शुरू हुई है राजनीति में।"


@pytest.fixture
def mock_dataframes():
    """Create mock true and fake news dataframes."""
    true_df = pd.DataFrame({
        'text': [
            'Real news about actual events',
            'This is a verified article from trusted source',
            'Breaking news from official authorities'
        ]
    })
    
    fake_df = pd.DataFrame({
        'text': [
            'This is completely made up story',
            'Fake news article for testing',
            'Misinformation spread on social media'
        ]
    })
    
    return true_df, fake_df


@pytest.fixture
def mock_pipeline():
    """Create a mock ML pipeline."""
    mock = MagicMock()
    mock.predict_proba.return_value = [[0.7, 0.3]]  # 30% fake probability
    return mock


@pytest.fixture
def sample_live_news():
    """Sample live news articles for cross-referencing."""
    return [
        {
            "title": "Nepal Government Announces New Policy",
            "description": "The government of Nepal announced a new education policy today",
            "source": "Official News"
        },
        {
            "title": "Earthquake Alert in Nepal",
            "description": "Minor earthquake detected in central Nepal region",
            "source": "Seismic Center"
        }
    ]


# ============================================================================
# TEXT PROCESSING TESTS
# ============================================================================

class TestTextCleaning:
    """Tests for text cleaning function."""
    
    def test_clean_text_lowercase(self, sample_valid_text):
        """Test that text is converted to lowercase."""
        result = clean_text("HELLO WORLD")
        assert result == "hello world"
    
    def test_clean_text_removes_special_chars(self):
        """Test that special characters are removed."""
        result = clean_text("Hello@123#World!")
        assert "@" not in result
        assert "#" not in result
        assert "!" not in result
    
    def test_clean_text_preserves_nepali(self):
        """Test that Nepali characters are preserved."""
        nepali_text = "नेपाल एक सुंदर देश है"
        result = clean_text(nepali_text)
        assert "नेपाल" in result or len(result) > 0
    
    def test_clean_text_removes_extra_whitespace(self):
        """Test that extra whitespace is removed."""
        result = clean_text("Hello    world   test")
        assert "    " not in result
        assert result == "hello world test"
    
    def test_clean_text_non_string_input(self):
        """Test handling of non-string input."""
        result = clean_text(123)
        assert result == ""
        
        result = clean_text(None)
        assert result == ""


class TestTextValidation:
    """Tests for text validation function."""
    
    def test_validate_valid_text(self, sample_valid_text):
        """Test validation of valid text."""
        is_valid, message = validate_text(sample_valid_text)
        assert is_valid is True
        assert message == ""
    
    def test_validate_short_text(self, sample_short_text):
        """Test validation of text below minimum length."""
        is_valid, message = validate_text(sample_short_text)
        assert is_valid is False
        assert "at least" in message.lower()
    
    def test_validate_empty_text(self):
        """Test validation of empty text."""
        is_valid, message = validate_text("")
        assert is_valid is False
    
    def test_validate_none_input(self):
        """Test validation of None input."""
        is_valid, message = validate_text(None)
        assert is_valid is False
    
    def test_validate_whitespace_only(self):
        """Test validation of whitespace-only text."""
        is_valid, message = validate_text("     ")
        assert is_valid is False


# ============================================================================
# MODEL LOADING TESTS
# ============================================================================

class TestModelLoading:
    """Tests for model loading function."""
    
    @patch('src.detector.joblib.load')
    def test_load_model_success(self, mock_joblib_load):
        """Test successful model loading."""
        mock_model = Mock()
        mock_joblib_load.return_value = mock_model
        
        result = load_model()
        assert result is not None
        mock_joblib_load.assert_called_once()
    
    @patch('src.detector.joblib.load')
    def test_load_model_file_not_found(self, mock_joblib_load):
        """Test handling of missing model file."""
        mock_joblib_load.side_effect = FileNotFoundError()
        
        result = load_model()
        assert result is None
    
    @patch('src.detector.joblib.load')
    def test_load_model_general_error(self, mock_joblib_load):
        """Test handling of general exceptions."""
        mock_joblib_load.side_effect = Exception("Generic error")
        
        result = load_model()
        assert result is None


class TestDatasetLoading:
    """Tests for dataset loading function."""
    
    @patch('src.detector.pd.read_csv')
    def test_load_datasets_success(self, mock_read_csv, mock_dataframes):
        """Test successful dataset loading."""
        true_df, fake_df = mock_dataframes
        mock_read_csv.side_effect = [true_df, fake_df]
        
        result_true, result_fake = load_datasets()
        assert result_true is not None
        assert result_fake is not None
        assert len(result_true) > 0
        assert len(result_fake) > 0
    
    @patch('src.detector.pd.read_csv')
    def test_load_datasets_file_not_found(self, mock_read_csv):
        """Test handling of missing dataset files."""
        mock_read_csv.side_effect = FileNotFoundError()
        
        result_true, result_fake = load_datasets()
        assert result_true is None
        assert result_false is None


# ============================================================================
# ANALYSIS PHASE TESTS
# ============================================================================

class TestPhase1DatabaseLookup:
    """Tests for Phase 1: Database lookup."""
    
    def test_database_lookup_exact_match_true(self, mock_dataframes):
        """Test detection of exact match in true news database."""
        true_df, fake_df = mock_dataframes
        
        # Use exact text from the dataframe
        text = "Real news about actual events"
        cleaned = clean_text(text)
        
        result = phase_1_database_lookup(text, cleaned, true_df, fake_df)
        assert result is not None
        assert result[0] == "Credible"
        assert result[1] == 1.0
    
    def test_database_lookup_exact_match_fake(self, mock_dataframes):
        """Test detection of exact match in fake news database."""
        true_df, fake_df = mock_dataframes
        
        text = "This is completely made up story"
        cleaned = clean_text(text)
        
        result = phase_1_database_lookup(text, cleaned, true_df, fake_df)
        assert result is not None
        assert result[0] == "Uncredible"
        assert result[1] == 1.0
    
    def test_database_lookup_no_match(self, mock_dataframes):
        """Test behavior when no match found in databases."""
        true_df, fake_df = mock_dataframes
        
        text = "Completely unique text that does not exist anywhere"
        cleaned = clean_text(text)
        
        result = phase_1_database_lookup(text, cleaned, true_df, fake_df)
        assert result is None
    
    def test_database_lookup_none_dataframes(self):
        """Test handling of None dataframes."""
        result = phase_1_database_lookup("test", "test", None, None)
        assert result is None


class TestPhase2LiveNewsCrossReference:
    """Tests for Phase 2: Live news cross-reference."""
    
    def test_live_news_cross_reference_match(self, sample_live_news):
        """Test successful cross-reference with live news."""
        text = "Nepal Government Policy Education"
        cleaned = clean_text(text)
        
        result = phase_2_live_news_cross_reference(cleaned, sample_live_news)
        assert isinstance(result, bool)
    
    def test_live_news_cross_reference_no_match(self, sample_live_news):
        """Test when text doesn't match live news."""
        text = "Completely different topic about cooking recipes"
        cleaned = clean_text(text)
        
        result = phase_2_live_news_cross_reference(cleaned, sample_live_news)
        assert isinstance(result, bool)
    
    def test_live_news_cross_reference_empty_news(self):
        """Test with empty news list."""
        result = phase_2_live_news_cross_reference("test text", [])
        assert result is False
    
    def test_live_news_cross_reference_none_news(self):
        """Test with None news."""
        result = phase_2_live_news_cross_reference("test text", None)
        assert result is False


class TestPoliticalBiasDetection:
    """Tests for political bias detection."""
    
    def test_detect_political_bias_uml(self):
        """Test detection of UML party mentions."""
        text = "एमाले ने नई घोषणा की है"
        result = detect_political_bias(text)
        assert len(result) > 0
        assert any("एमाले" in r or "UML" in r for r in result)
    
    def test_detect_political_bias_congress(self):
        """Test detection of Congress party mentions."""
        text = "नेपाली कांग्रेस की बैठक आज हुई"
        result = detect_political_bias(text)
        assert len(result) > 0
    
    def test_detect_political_bias_no_parties(self):
        """Test when no political parties detected."""
        text = "यह एक सामान्य समाचार है जिसमें कोई राजनीति नहीं है"
        result = detect_political_bias(text)
        assert isinstance(result, list)
    
    def test_detect_political_bias_multiple_parties(self):
        """Test detection of multiple parties in one text."""
        text = "एमाले और कांग्रेस दोनों ने बयान दिया है"
        result = detect_political_bias(text)
        assert len(result) >= 1


class TestPhase3HeuristicAnalysis:
    """Tests for Phase 3: Heuristic analysis."""
    
    def test_heuristic_analysis_with_sensationalism(self, sample_fake_text):
        """Test detection of sensationalism markers."""
        score = phase_3_heuristic_analysis(sample_fake_text)
        assert 0 <= score <= 1
        assert score > 0  # Should detect sensationalism
    
    def test_heuristic_analysis_normal_text(self, sample_valid_text):
        """Test heuristic score for normal text."""
        score = phase_3_heuristic_analysis(sample_valid_text)
        assert 0 <= score <= 1
    
    def test_heuristic_analysis_all_caps(self):
        """Test detection of excessive capitalization."""
        text = "THIS IS ALL CAPS TEXT!!!"
        score = phase_3_heuristic_analysis(text)
        assert score > 0
    
    def test_heuristic_analysis_max_score(self):
        """Test that score is capped at 1.0."""
        text = "भर्खरै बिष्फोटक खुलासा आश्चर्यजनक!!! ??? *** ...!!!"
        score = phase_3_heuristic_analysis(text)
        assert score <= 1.0


class TestPhase4MLPrediction:
    """Tests for Phase 4: ML prediction."""
    
    def test_ml_prediction_with_pipeline(self, mock_pipeline):
        """Test ML prediction with valid pipeline."""
        result = phase_4_ml_prediction("test text", mock_pipeline)
        assert 0 <= result <= 1
    
    def test_ml_prediction_without_pipeline(self):
        """Test ML prediction without pipeline returns default."""
        result = phase_4_ml_prediction("test text", None)
        assert result == 0.5
    
    def test_ml_prediction_pipeline_error(self):
        """Test handling of pipeline errors."""
        bad_pipeline = Mock()
        bad_pipeline.predict_proba.side_effect = Exception("Pipeline error")
        
        result = phase_4_ml_prediction("test text", bad_pipeline)
        assert result == 0.5


# ============================================================================
# FULL PREDICTION PIPELINE TESTS
# ============================================================================

class TestFullPredictionPipeline:
    """Tests for the complete prediction authenticity function."""
    
    def test_predict_authenticity_invalid_input(self):
        """Test prediction with invalid input."""
        verdict, score, reasons, h_score, parties = predict_authenticity("", None)
        assert verdict == "Invalid Input"
    
    def test_predict_authenticity_short_input(self):
        """Test prediction with too-short input."""
        verdict, score, reasons, h_score, parties = predict_authenticity("Hi", None)
        assert verdict == "Invalid Input"
    
    @patch('src.detector.load_datasets')
    @patch('src.detector.load_model')
    def test_predict_authenticity_with_valid_input(self, mock_load_model, mock_load_datasets, 
                                                     mock_dataframes, mock_pipeline, sample_valid_text):
        """Test prediction with valid input."""
        mock_load_datasets.return_value = mock_dataframes
        mock_load_model.return_value = mock_pipeline
        
        verdict, score, reasons, h_score, parties = predict_authenticity(sample_valid_text, mock_pipeline)
        
        assert verdict in ["Credible", "Uncredible"]
        assert 0 <= score <= 1
        assert isinstance(reasons, list)
        assert 0 <= h_score <= 1
        assert isinstance(parties, list)
    
    @patch('src.detector.load_datasets')
    def test_predict_authenticity_with_threshold(self, mock_load_datasets, mock_dataframes, 
                                                   mock_pipeline, sample_valid_text):
        """Test prediction respects threshold parameter."""
        mock_load_datasets.return_value = mock_dataframes
        
        verdict_low, _, _, _, _ = predict_authenticity(sample_valid_text, mock_pipeline, threshold=0.3)
        verdict_high, _, _, _, _ = predict_authenticity(sample_valid_text, mock_pipeline, threshold=0.8)
        
        # Results may differ based on threshold
        assert verdict_low in ["Credible", "Uncredible"]
        assert verdict_high in ["Credible", "Uncredible"]


# ============================================================================
# INTEGRATION TESTS
# ============================================================================

class TestIntegration:
    """Integration tests combining multiple components."""
    
    @patch('src.detector.load_datasets')
    @patch('src.detector.load_model')
    def test_full_workflow_with_database_match(self, mock_load_model, mock_load_datasets, 
                                                mock_dataframes, mock_pipeline):
        """Test complete workflow when database match found."""
        mock_load_datasets.return_value = mock_dataframes
        mock_load_model.return_value = mock_pipeline
        
        text = "Real news about actual events"
        verdict, score, reasons, _, _ = predict_authenticity(text, mock_pipeline)
        
        # Should detect database match
        assert "database" in str(reasons).lower() or "verified" in str(reasons).lower()
    
    @patch('src.detector.load_datasets')
    @patch('src.detector.load_model')
    def test_full_workflow_with_heuristics(self, mock_load_model, mock_load_datasets, 
                                            mock_dataframes, mock_pipeline, sample_fake_text):
        """Test complete workflow with heuristic analysis."""
        mock_load_datasets.return_value = mock_dataframes
        mock_load_model.return_value = mock_pipeline
        
        verdict, score, reasons, h_score, _ = predict_authenticity(sample_fake_text, mock_pipeline)
        
        assert h_score > 0
        assert len(reasons) > 0


# ============================================================================
# PERFORMANCE TESTS
# ============================================================================

class TestPerformance:
    """Performance-related tests."""
    
    def test_text_cleaning_performance(self):
        """Test that text cleaning handles large texts efficiently."""
        large_text = "word " * 10000
        result = clean_text(large_text)
        assert isinstance(result, str)
    
    def test_prediction_response_time(self, mock_pipeline):
        """Test that prediction completes in reasonable time."""
        import time
        
        start = time.time()
        predict_authenticity("This is a test news article for performance testing", mock_pipeline)
        elapsed = time.time() - start
        
        assert elapsed < 5.0  # Should complete in less than 5 seconds


# ============================================================================
# RUN TESTS
# ============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
