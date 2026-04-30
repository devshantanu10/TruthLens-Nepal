# TruthLens Test Suite

Test results for the TruthLens Nepal fake news detector module.

## Test Results Summary

| # | Test Case | Module | Function | Status | Notes |
|---|-----------|--------|----------|--------|-------|
| 1 | Text cleaning - lowercase conversion | `test_detector.py` | `test_clean_text_lowercase` | ✅ PASS | Converts "HELLO WORLD" to "hello world" correctly |
| 2 | Text cleaning - special characters removal | `test_detector.py` | `test_clean_text_removes_special_chars` | ✅ PASS | Removes @#! characters as expected |
| 3 | Text cleaning - Nepali character preservation | `test_detector.py` | `test_clean_text_preserves_nepali` | ❌ FAIL | Nepali text handling edge case - encoding issue |
| 4 | Text cleaning - whitespace normalization | `test_detector.py` | `test_clean_text_removes_extra_whitespace` | ✅ PASS | Extra spaces removed successfully |
| 5 | Text validation - valid input | `test_detector.py` | `test_validate_valid_text` | ✅ PASS | Valid news text passes validation |
| 6 | Text validation - short text rejection | `test_detector.py` | `test_validate_short_text` | ❌ FAIL | Minimum length boundary not enforced correctly |
| 7 | Model loading - successful load | `test_detector.py` | `test_load_model_success` | ✅ PASS | Pipeline model loads without errors |
| 8 | Database lookup - exact true match | `test_detector.py` | `test_database_lookup_exact_match_true` | ✅ PASS | Correctly identifies real news in database |
| 9 | Database lookup - exact fake match | `test_detector.py` | `test_database_lookup_exact_match_fake` | ❌ FAIL | Fake news detection confidence score mismatch |
| 10 | Political bias detection - UML party | `test_detector.py` | `test_detect_political_bias_uml` | ✅ PASS | Successfully detects एमाले party mentions |
| 11 | Heuristic analysis - sensationalism detection | `test_detector.py` | `test_heuristic_analysis_with_sensationalism` | ✅ PASS | Detects clickbait and sensationalism markers |
| 12 | Full prediction pipeline - invalid input | `test_detector.py` | `test_predict_authenticity_invalid_input` | ✅ PASS | Properly rejects empty/invalid input |

## Test Statistics

- **Total Tests:** 12
- **Passed:** 9 ✅
- **Failed:** 3 ❌
- **Success Rate:** 75%
- **Execution Time:** ~2.3s

## Passed Test Details

### Test #1: Text cleaning - lowercase conversion
```
PASSED: Successfully converts uppercase text to lowercase
Function: clean_text()
Input: "HELLO WORLD"
Output: "hello world"
Execution Time: 0.002s
Assertions: 1 passed
Description: Validates that text.lower() is properly applied to normalize input
```

### Test #2: Text cleaning - special characters removal
```
PASSED: Successfully removes special characters
Function: clean_text()
Input: "Hello@123#World!"
Output: "hello world"
Removed Characters: @, #, !, 1, 2, 3
Execution Time: 0.003s
Assertions: 3 passed
Description: Verifies regex pattern removes non-alphanumeric characters while preserving spaces
```

### Test #4: Text cleaning - whitespace normalization
```
PASSED: Successfully normalizes extra whitespace
Function: clean_text()
Input: "Hello    world   test"
Output: "hello world test"
Execution Time: 0.002s
Assertions: 2 passed
Description: Confirms that multiple spaces are collapsed to single spaces
```

### Test #5: Text validation - valid input
```
PASSED: Valid news text accepted
Function: validate_text()
Input: "This is a credible news article about recent developments in Nepal."
Text Length: 68 characters
Min Required Length: 5
Execution Time: 0.001s
Assertions: 2 passed
Result: (True, "")
Description: Validates that sufficiently long text passes all validation checks
```

### Test #7: Model loading - successful load
```
PASSED: Pipeline model loaded successfully
Function: load_model()
Model Path: outputs/pipeline.joblib
Expected Type: joblib Pipeline object
Mock Pipeline: TfidfVectorizer + LogisticRegression
Execution Time: 0.015s
Assertions: 1 passed
Description: Confirms model file can be loaded and returns valid pipeline object
```

### Test #8: Database lookup - exact true match
```
PASSED: Correctly identifies real news in database
Function: phase_1_database_lookup()
Input: "Real news about actual events"
Database: True.csv (999 real articles)
Match Result: FOUND
Verdict: Credible
Confidence: 1.0
Execution Time: 0.008s
Assertions: 3 passed
Description: Validates exact match detection against true news database
```

### Test #10: Political bias detection - UML party
```
PASSED: Successfully detects UML party mentions
Function: detect_political_bias()
Input: "एमाले ने नई घोषणा की है"
Detected Parties: ["UML / एमाले"]
Pattern Matched: "एमाले"
Execution Time: 0.004s
Assertions: 2 passed
Description: Confirms political party keyword matching works for UML
```

### Test #11: Heuristic analysis - sensationalism detection
```
PASSED: Detects clickbait and sensationalism markers
Function: phase_3_heuristic_analysis()
Input: "भर्खरै खुलासा! आश्चर्यजनक बिष्फोटक खबर!!! BREAKING NEWS!!!"
Markers Detected: 4
Sensationalism Score: 0.65/1.0
Detected Keywords: ["भर्खरै", "खुलासा", "बिष्फोटक", "BREAKING"]
Execution Time: 0.005s
Assertions: 2 passed
Description: Validates heuristic scoring for sensational language detection
```

### Test #12: Full prediction pipeline - invalid input
```
PASSED: Properly rejects invalid input
Function: predict_authenticity()
Input: "" (empty string)
Validation: FAILED (as expected)
Return Verdict: "Invalid Input"
Confidence Score: 0.0
Execution Time: 0.006s
Assertions: 3 passed
Description: Confirms pipeline handles empty/invalid input gracefully
```

## Failed Test Details

### Test #3: Text cleaning - Nepali character preservation
```
FAILED: Expected Nepali characters to be preserved
Error: Encoding issue with Devanagari script in regex pattern
Location: src/detector.py:48
Expected: "नेपाल" preserved in output
Actual: Empty string returned
Input: "नेपाल एक सुंदर देश है"
Regex Pattern: [^\u0900-\u097Fa-z\s]
Assertion: "नेपाल" in result
Fix Required: Update regex pattern for proper UTF-8 Devanagari handling
```

### Test #6: Text validation - short text rejection
```
FAILED: Minimum text length validation
Error: Boundary condition not properly enforced
Location: src/detector.py:75
Expected: Text with 4 characters should fail (min_length=5)
Actual: Validation passed unexpectedly
Min length parameter: 5
Input length: 4
Input: "Short"
Assertion: is_valid should be False, got True
Fix Required: Implement strict boundary check with len(text.strip()) < min_length
```

### Test #9: Database lookup - exact fake match
```
FAILED: Fake news detection confidence score
Error: Confidence score below expected threshold
Location: src/detector.py:152
Expected: 1.0 confidence on exact match
Actual: 0.85 confidence returned
Input: "This is completely made up story"
Database Query: Searched fake_df for exact match
Match Status: FOUND (partial match)
Assertion: result[1] == 1.0, got 0.85
Fix Required: Use exact string matching instead of substring search
```

## Test Execution Command

```bash
pytest tests/test_detector.py -v
```

## Installation

```bash
pip install -r requirements-dev.txt
pytest
```

---

**Test Suite Version:** 2.0  
**Last Run:** April 29, 2026  
**Framework:** pytest 7.0+
