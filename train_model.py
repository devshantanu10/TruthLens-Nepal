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


def parse_ngram_range(value: str) -> tuple[int, int]:
    parts = [part.strip() for part in value.split(",") if part.strip()]
    if len(parts) != 2:
        raise argparse.ArgumentTypeError("ngram range must be provided as two integers separated by a comma, e.g. 1,2")
    first, second = int(parts[0]), int(parts[1])
    if first < 1 or second < first:
        raise argparse.ArgumentTypeError("ngram range must be two positive integers with min <= max")
    return first, second


def load_dataset(real_path: Path, fake_path: Path, text_col: str, title_col: str | None, min_text_length: int = 5, remove_duplicates: bool = False) -> pd.DataFrame:
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
    if remove_duplicates:
        df = df.drop_duplicates(subset=["text"]).reset_index(drop=True)
    df = df[df["text"].str.len() >= min_text_length].reset_index(drop=True)

    return df


def train(
    real_path: Path,
    fake_path: Path,
    text_col: str,
    title_col: str | None,
    outdir: Path,
    test_size: float,
    random_state: int,
    use_stop_words: bool,
    class_weight: str | None,
    min_text_length: int,
    max_features: int,
    ngram_range: tuple[int, int],
    use_sublinear_tf: bool,
    remove_duplicates: bool,
    save_metadata: bool,
    verbose: bool,
):
    print("Starting model training...")
    outdir.mkdir(parents=True, exist_ok=True)

    df = load_dataset(real_path, fake_path, text_col, title_col, min_text_length)
    if verbose:
        print("Dataset label distribution:")
        print(df["label"].value_counts().to_dict())
        print("Sample cleaned texts:")
        print(df["text"].head(3).to_list())
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
                    max_features=max_features,
                    ngram_range=ngram_range,
                    sublinear_tf=use_sublinear_tf,
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

    if save_metadata:
        metadata_path = outdir / "metadata.json"
        metadata = {
            "real_path": str(real_path),
            "fake_path": str(fake_path),
            "text_col": text_col,
            "title_col": title_col,
            "test_size": test_size,
            "random_state": random_state,
            "use_stop_words": use_stop_words,
            "class_weight": class_weight,
            "min_text_length": min_text_length,
            "max_features": max_features,
            "ngram_range": list(ngram_range),
            "use_sublinear_tf": use_sublinear_tf,
            "remove_duplicates": remove_duplicates,
        }
        with metadata_path.open("w", encoding="utf-8") as metadata_file:
            json.dump(metadata, metadata_file, ensure_ascii=False, indent=2)
        print(f"Saved metadata to {metadata_path}")

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
    parser.add_argument("--verbose", action="store_true", help="Show dataset and training debug information.")
    parser.add_argument("--min-text-length", type=int, default=5, help="Minimum length for text samples after cleaning.")
    parser.add_argument("--max-features", type=int, default=15000, help="Maximum number of TF-IDF features to extract.")
    parser.add_argument("--ngram-range", type=parse_ngram_range, default="1,2", help="N-gram range for TF-IDF as 'min,max'.")
    parser.add_argument("--disable-sublinear-tf", action="store_true", help="Disable sublinear TF scaling in TF-IDF.")
    parser.add_argument("--remove-duplicates", action="store_true", help="Drop duplicate text samples before training.")
    parser.add_argument("--save-metadata", action="store_true", help="Save training metadata to outputs/metadata.json.")
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
        min_text_length=args.min_text_length,
        max_features=args.max_features,
        ngram_range=args.ngram_range,
        use_sublinear_tf=not args.disable_sublinear_tf,
        remove_duplicates=args.remove_duplicates,
        save_metadata=args.save_metadata,
        verbose=args.verbose,
    )
