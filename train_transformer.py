"""
Transformer-based Fake News Detector
=====================================
Fine-tunes xlm-roberta-base on the TruthLens Nepal dataset.

Usage:
    py -3.12 train_transformer.py

Requirements:
    pip install torch transformers datasets accelerate scikit-learn pandas
"""

import json
import re
import warnings
from pathlib import Path

import pandas as pd
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import train_test_split

# ── Suppress noisy deprecation warnings ───────────────────────────────────────
warnings.filterwarnings("ignore", category=FutureWarning)

import torch
from datasets import Dataset
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    Trainer,
    TrainingArguments,
    EarlyStoppingCallback,
)
from peft import get_peft_model, LoraConfig, TaskType

# ── Paths ─────────────────────────────────────────────────────────────────────
ROOT_DIR   = Path(__file__).resolve().parent
DATA_DIR   = ROOT_DIR / "data"
OUTPUT_DIR = ROOT_DIR / "outputs" / "xlmr_model"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ── Config ────────────────────────────────────────────────────────────────────
MODEL_NAME  = "xlm-roberta-base"
MAX_LENGTH  = 512          # Increased for LoRA efficiency
BATCH_SIZE  = 16           # Increased for LoRA efficiency
GRAD_ACCUM  = 1            
EPOCHS      = 4
LR          = 2e-4         # LoRA often needs a slightly higher learning rate
SEED        = 42
LABEL_MAP   = {0: "Credible", 1: "Uncredible"}


# ── Text cleaning ─────────────────────────────────────────────────────────────
def clean_text(text: str) -> str:
    if not isinstance(text, str):
        return ""
    text = re.sub(r"\s+", " ", text).strip()
    return text[:1024]  # safety cap before tokenizer


# ── Load & prepare dataset ────────────────────────────────────────────────────
def load_data():
    real_df = pd.read_csv(DATA_DIR / "True.csv")
    fake_df = pd.read_csv(DATA_DIR / "Fake.csv")

    real_df["label"] = 0
    fake_df["label"] = 1

    # Combine title + text if both exist
    def combine(df):
        title = df.get("title", pd.Series([""] * len(df))).fillna("").astype(str)
        text  = df.get("text",  pd.Series([""] * len(df))).fillna("").astype(str)
        return (title + " " + text).apply(clean_text)

    real_df["combined"] = combine(real_df)
    fake_df["combined"] = combine(fake_df)

    df = pd.concat(
        [real_df[["combined", "label"]], fake_df[["combined", "label"]]],
        ignore_index=True
    ).dropna()

    df = df[df["combined"].str.len() >= 5].reset_index(drop=True)
    print(f"Dataset: {len(df)} rows  |  Real: {(df['label']==0).sum()}  |  Fake: {(df['label']==1).sum()}")
    return df


# ── Tokenisation helper ───────────────────────────────────────────────────────
def tokenize_fn(examples, tokenizer):
    return tokenizer(
        examples["combined"],
        truncation=True,
        max_length=MAX_LENGTH,
        padding="max_length",
    )


# ── Metrics ───────────────────────────────────────────────────────────────────
def compute_metrics(eval_pred):
    import numpy as np
    logits, labels = eval_pred
    preds = np.argmax(logits, axis=-1)
    acc = accuracy_score(labels, preds)
    report = classification_report(labels, preds, target_names=list(LABEL_MAP.values()), output_dict=True)
    return {
        "accuracy":  acc,
        "f1_fake":   report["Uncredible"]["f1-score"],
        "f1_real":   report["Credible"]["f1-score"],
    }


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Using device: {device}")
    if device == "cuda":
        print(f"GPU: {torch.cuda.get_device_name(0)}")
        print(f"VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")

    # 1. Data
    df = load_data()
    train_df, val_df = train_test_split(
        df, test_size=0.2, stratify=df["label"], random_state=SEED
    )

    # 2. Tokeniser
    print(f"\nLoading tokenizer: {MODEL_NAME}")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)

    train_ds = Dataset.from_pandas(train_df.reset_index(drop=True))
    val_ds   = Dataset.from_pandas(val_df.reset_index(drop=True))

    train_ds = train_ds.map(lambda x: tokenize_fn(x, tokenizer), batched=True)
    val_ds   = val_ds.map(lambda x: tokenize_fn(x, tokenizer),   batched=True)

    train_ds = train_ds.rename_column("label", "labels")
    val_ds   = val_ds.rename_column("label", "labels")
    train_ds.set_format("torch", columns=["input_ids", "attention_mask", "labels"])
    val_ds.set_format("torch",   columns=["input_ids", "attention_mask", "labels"])

    # 3. Model
    print(f"Loading model: {MODEL_NAME}")
    model = AutoModelForSequenceClassification.from_pretrained(
        MODEL_NAME,
        num_labels=2,
        id2label=LABEL_MAP,
        label2id={v: k for k, v in LABEL_MAP.items()},
    )

    peft_config = LoraConfig(
        task_type=TaskType.SEQ_CLS, 
        inference_mode=False, 
        r=8, 
        lora_alpha=16, 
        lora_dropout=0.1
    )
    model = get_peft_model(model, peft_config)
    model.print_trainable_parameters()
    model.to(device)

    # 4. Training arguments
    training_args = TrainingArguments(
        output_dir=str(OUTPUT_DIR / "checkpoints"),
        num_train_epochs=EPOCHS,
        per_device_train_batch_size=BATCH_SIZE,
        per_device_eval_batch_size=BATCH_SIZE,
        gradient_accumulation_steps=GRAD_ACCUM,
        learning_rate=LR,
        warmup_ratio=0.1,
        weight_decay=0.01,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="accuracy",
        logging_dir=str(OUTPUT_DIR / "logs"),
        logging_steps=10,
        seed=SEED,
        fp16=(device == "cuda"),
        report_to="none",            
        dataloader_num_workers=0,    
    )

    # 5. Trainer
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        compute_metrics=compute_metrics,
        callbacks=[EarlyStoppingCallback(early_stopping_patience=2)],
    )

    print("\n" + "="*60)
    print("  Starting fine-tuning of XLM-RoBERTa...")
    print("="*60 + "\n")
    trainer.train()

    # 6. Final evaluation
    print("\nRunning final evaluation...")
    results = trainer.evaluate()
    print(f"\n✅ Final Accuracy : {results['eval_accuracy']:.4f}")
    print(f"   F1 (Fake)      : {results['eval_f1_fake']:.4f}")
    print(f"   F1 (Real)      : {results['eval_f1_real']:.4f}")

    # 7. Save model + tokenizer + metrics
    print(f"\nSaving fine-tuned model to: {OUTPUT_DIR}")
    trainer.save_model(str(OUTPUT_DIR))
    tokenizer.save_pretrained(str(OUTPUT_DIR))

    metrics_out = {
        "model": MODEL_NAME,
        "accuracy": results["eval_accuracy"],
        "f1_fake":  results["eval_f1_fake"],
        "f1_real":  results["eval_f1_real"],
        "epochs": EPOCHS,
        "train_samples": len(train_df),
        "val_samples":   len(val_df),
        "device": device,
    }
    with open(OUTPUT_DIR / "metrics.json", "w", encoding="utf-8") as f:
        json.dump(metrics_out, f, indent=2)

    print("\n🎉 Training complete! Model saved to outputs/xlmr_model/")
    print("   You can now restart the API server to use the new model.")


if __name__ == "__main__":
    main()
