"""
Pytest Configuration and Fixtures
===================================

Centralized configuration for pytest including shared fixtures and settings.
"""

import pytest
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))


# ============================================================================
# PYTEST CONFIGURATION
# ============================================================================

def pytest_configure(config):
    """Configure pytest with custom settings."""
    config.addinivalue_line(
        "markers", "unit: mark test as a unit test"
    )
    config.addinivalue_line(
        "markers", "integration: mark test as an integration test"
    )
    config.addinivalue_line(
        "markers", "slow: mark test as slow running"
    )


# ============================================================================
# SHARED FIXTURES
# ============================================================================

@pytest.fixture(scope="session")
def project_root():
    """Get project root directory."""
    return Path(__file__).parent.parent


@pytest.fixture(scope="session")
def data_dir(project_root):
    """Get data directory path."""
    return project_root / "data"


@pytest.fixture(scope="session")
def outputs_dir(project_root):
    """Get outputs directory path."""
    return project_root / "outputs"


@pytest.fixture
def sample_nepali_text():
    """Sample Nepali text for testing."""
    return "नेपाल एक सुंदर देश है जहां विविध संस्कृति और परंपराएं हैं।"


@pytest.fixture
def sample_english_text():
    """Sample English text for testing."""
    return "This is a sample English text for testing purposes."


@pytest.fixture
def sample_mixed_text():
    """Sample mixed English and Nepali text."""
    return "नेपाल में आजकल weather बहुत अच्छा है।"


@pytest.fixture
def sample_suspicious_text():
    """Sample text with suspicious markers."""
    return "SHOCKING NEWS!!! एक खुलासा जो आप नहीं सोच सकते??? Read more!!!"


# ============================================================================
# LOGGING FIXTURES
# ============================================================================

@pytest.fixture
def caplog_handler(caplog):
    """Fixture for capturing and checking logs."""
    return caplog
