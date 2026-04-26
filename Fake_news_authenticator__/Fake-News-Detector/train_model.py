import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.metrics import accuracy_score, classification_report
import joblib
import re
from pathlib import Path

# Paths
DATA_DIR = Path("data")
OUTPUT_DIR = Path("outputs")
OUTPUT_DIR.mkdir(exist_ok=True)

def clean_text(text):
    if not isinstance(text, str): return ""
    text = text.lower()
    # Keep Devanagari (Nepali) and English characters
    text = re.sub(r"[^\u0900-\u097Fa-z\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text

def train():
    print("Starting Model Training...")
    
    # Load datasets
    try:
        fake_df = pd.read_csv(DATA_DIR / "Fake.csv")
        true_df = pd.read_csv(DATA_DIR / "True.csv")
    except Exception as e:
        print(f"Error loading data: {e}")
        return

    # Label data
    fake_df['label'] = 1
    true_df['label'] = 0
    
    # Combine
    df = pd.concat([fake_df, true_df]).reset_index(drop=True)
    
    # Handle missing values
    df = df[['text', 'label']].dropna()
    
    print(f"Dataset size: {len(df)} rows")
    
    # Cleaning
    print("Cleaning text...")
    df['text'] = df['text'].apply(clean_text)
    
    # Split
    X_train, X_test, y_train, y_test = train_test_split(df['text'], df['label'], test_size=0.2, random_state=42)
    
    # Pipeline: TF-IDF + Logistic Regression
    print("Training model (TF-IDF + Logistic Regression)...")
    pipeline = Pipeline([
        ('tfidf', TfidfVectorizer(max_features=10000, stop_words='english', ngram_range=(1,2))),
        ('clf', LogisticRegression(max_iter=1000))
    ])
    
    pipeline.fit(X_train, y_train)
    
    # Evaluate
    y_pred = pipeline.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    print(f"Training Complete! Accuracy: {acc:.2%}")
    print("\nClassification Report:")
    print(classification_report(y_test, y_pred))
    
    # Save
    print(f"Saving model to {OUTPUT_DIR}...")
    joblib.dump(pipeline, OUTPUT_DIR / "pipeline.joblib")
    
    # Split save for app compatibility if needed
    joblib.dump(pipeline.named_steps['clf'], OUTPUT_DIR / "model.joblib")
    joblib.dump(pipeline.named_steps['tfidf'], OUTPUT_DIR / "vectorizer.joblib")
    
    print("All artifacts saved successfully!")

if __name__ == "__main__":
    train()
