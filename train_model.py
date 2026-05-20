import argparse
import json
import re
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

ROOT_DIR = Path(__file__).resolve().parent
DATA_DIR = ROOT_DIR / "data"
OUTPUT_DIR = ROOT_DIR / "outputs"
OUTPUT_DIR.mkdir(exist_ok=True)


def clean_text(text: str) -> str:
    if not isinstance(text, str):
        return ""
    text = text.lower()
    text = re.sub(r"[^\u0900-\u097Fa-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def build_text_series(df: pd.DataFrame, text_col: str, title_col: str | None = None) -> pd.Series:
    if text_col not in df.columns and not title_col:
        raise ValueError(f"Text column '{text_col}' not found in dataset and no title column provided.")

    if title_col and title_col in df.columns:
        title = df[title_col].fillna("").astype(str)
        body = df[text_col].fillna("").astype(str) if text_col in df.columns else pd.Series([""] * len(df))
        return (title + " " + body).str.strip()

    if text_col not in df.columns:
        raise ValueError(f"Text column '{text_col}' not found in dataset.")

    return df[text_col].fillna("").astype(str)


def load_dataset(real_path: Path, fake_path: Path, text_col: str, title_col: str | None) -> pd.DataFrame:
    if not real_path.exists():
        raise FileNotFoundError(f"Real data file not found: {real_path}")
    if not fake_path.exists():
        raise FileNotFoundError(f"Fake data file not found: {fake_path}")

    real_df = pd.read_csv(real_path, encoding="utf-8")
    fake_df = pd.read_csv(fake_path, encoding="utf-8")

    real_df["label"] = 0
    fake_df["label"] = 1

    real_df["text"] = build_text_series(real_df, text_col, title_col)
    fake_df["text"] = build_text_series(fake_df, text_col, title_col)

    df = pd.concat([real_df[["text", "label"]], fake_df[["text", "label"]]], ignore_index=True)
    df = df.dropna(subset=["text", "label"])
    df["text"] = df["text"].map(clean_text)
    df = df[df["text"].str.len() > 5].reset_index(drop=True)

    return df


def train(real_path: Path, fake_path: Path, text_col: str, title_col: str | None, outdir: Path, test_size: float, random_state: int, use_stop_words: bool, class_weight: str | None):
    print("Starting model training...")
    outdir.mkdir(parents=True, exist_ok=True)

    df = load_dataset(real_path, fake_path, text_col, title_col)
    print(f"Loaded dataset with {len(df)} rows.")

    X_train, X_test, y_train, y_test = train_test_split(
        df["text"], df["label"], test_size=test_size, stratify=df["label"], random_state=random_state
    )

    print("Training model using TF-IDF and Logistic Regression...")
    pipeline = Pipeline(
        [
            (
                "tfidf",
                TfidfVectorizer(
                    max_features=15000,
                    ngram_range=(1, 2),
                    sublinear_tf=True,
                    stop_words="english" if use_stop_words else None,
                ),
            ),
            (
                "clf",
                LogisticRegression(max_iter=2000, class_weight=class_weight),
            ),
        ]
    )

    pipeline.fit(X_train, y_train)

    y_pred = pipeline.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    report = classification_report(y_test, y_pred, output_dict=True)
    report_text = classification_report(y_test, y_pred)

    print(f"Training complete. Accuracy: {acc:.2%}")
    print("\nClassification Report:")
    print(report_text)

    print(f"Saving artifacts to {outdir}")
    joblib.dump(pipeline, outdir / "pipeline.joblib")
    joblib.dump(pipeline.named_steps["clf"], outdir / "model.joblib")
    joblib.dump(pipeline.named_steps["tfidf"], outdir / "vectorizer.joblib")

    metrics_path = outdir / "metrics.json"
    with metrics_path.open("w", encoding="utf-8") as metrics_file:
        json.dump({"accuracy": acc, "classification_report": report}, metrics_file, ensure_ascii=False, indent=2)

    text_report_path = outdir / "classification_report.txt"
    with text_report_path.open("w", encoding="utf-8") as report_file:
        report_file.write(report_text)

    print(f"Saved metrics to {metrics_path}")
    print(f"Saved classification report to {text_report_path}")
    print("All artifacts saved successfully!")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train a fake news detector for Nepali datasets.")
    parser.add_argument("--real", type=Path, default=DATA_DIR / "True.csv", help="Path to the real news CSV file.")
    parser.add_argument("--fake", type=Path, default=DATA_DIR / "Fake.csv", help="Path to the fake news CSV file.")
    parser.add_argument("--text-col", type=str, default="text", help="Name of the text column in the dataset.")
    parser.add_argument("--title-col", type=str, default="title", help="Optional title column to concatenate with text.")
    parser.add_argument("--use-stop-words", action="store_true", help="Enable English stop-word removal in TF-IDF.")
    parser.add_argument(
        "--class-weight",
        choices=["balanced", "none"],
        default="balanced",
        help="Choose class_weight strategy for Logistic Regression.",
    )
    parser.add_argument("--outdir", type=Path, default=OUTPUT_DIR, help="Output directory for saved model artifacts.")
    parser.add_argument("--test-size", type=float, default=0.2, help="Fraction of data to reserve for testing.")
    parser.add_argument("--random-state", type=int, default=42, help="Random seed for train/test split.")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    train(
        real_path=args.real,
        fake_path=args.fake,
        text_col=args.text_col,
        title_col=args.title_col,
        outdir=args.outdir,
        test_size=args.test_size,
        random_state=args.random_state,
        use_stop_words=args.use_stop_words,
        class_weight=None if args.class_weight == "none" else "balanced",
    )
