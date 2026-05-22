import argparse
from pathlib import Path
import time

import feedparser
import pandas as pd
import requests

ROOT_DIR = Path(__file__).resolve().parent
DATA_DIR = ROOT_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

TRUE_SOURCES = [
    {"name": "Onlinekhabar", "rss": "https://www.onlinekhabar.com/feed"},
    {"name": "Setopati", "rss": "https://www.setopati.com/feed"},
    {"name": "Kathmandu Post", "rss": "https://kathmandupost.com/rss"},
    {"name": "Nagarik News", "rss": "https://nagariknews.com/feed"},
    {"name": "BBC Nepali", "rss": "https://www.bbc.com/nepali/index.xml"},
]

FAKE_PATTERNS = [
    "भर्खरै सार्वजनिक भयो बिष्फोटक समाचार! सबैले सेयर गरौं।",
    "यो भिडियो हेर्नुहोस, कसैले नदेखोस भनेर हटाइएको छ।",
    "नेपालमा फेरि अर्को ठूलो भूकम्प आउने खुलासा, सबै सचेत रहनुहोस।",
    "अमेरिकाबाट आयो यस्तो खबर, नेपालीहरुका लागि दुखद समाचार।",
    "एमसीसी पास भएपछि नेपालमा अमेरिकी सेना छिर्ने निश्चित, हेर्नुहोस प्रमाण।",
]


def parse_entry(entry):
    title = entry.get("title", "").strip()
    summary = entry.get("summary", "").strip()
    text = summary if summary else title
    if title and summary and summary not in title:
        text = f"{title} {summary}"
    return title, text


def fetch_true_articles(sources, max_articles=None):
    articles = []
    for source in sources:
        if max_articles and len(articles) >= max_articles:
            break

        try:
            print(f"  - Fetching from {source['name']}...", end="\r")
            response = requests.get(source["rss"], timeout=10, headers={"User-Agent": "Mozilla/5.0"})
            response.raise_for_status()
            feed = feedparser.parse(response.content)

            for entry in feed.entries:
                title, text = parse_entry(entry)
                if not text:
                    continue

                date = entry.get("published", entry.get("updated", "N/A"))
                articles.append(
                    {
                        "title": title,
                        "text": text,
                        "subject": "nepaliNews",
                        "date": date,
                    }
                )

                if max_articles and len(articles) >= max_articles:
                    break

            time.sleep(1)
        except Exception as exc:
            print(f"  - Error fetching {source['name']}: {exc}")

    return articles


def generate_fake_articles(count, patterns):
    fake_articles = []
    for i in range(count):
        prompt = patterns[i % len(patterns)]
        fake_text = f"{prompt} नेपालको राजनीतिमा नयाँ मोड, {i + 1} जना पक्राउ।"
        fake_articles.append(
            {
                "title": prompt,
                "text": fake_text,
                "subject": "misinformation",
                "date": "N/A",
            }
        )
    return fake_articles


def generate_data(real_count=999, fake_count=999):
    print("Preparing Nepali news dataset...")
    print("Fetching real news from Nepali RSS sources...")
    true_articles = fetch_true_articles(TRUE_SOURCES, max_articles=real_count)
    if not true_articles:
        raise RuntimeError("No real articles were fetched. Check RSS sources or your network connection.")

    print(f"Generating {fake_count} synthetic fake articles...")
    fake_articles = generate_fake_articles(fake_count, FAKE_PATTERNS)

    print(f"Saving {len(true_articles)} real and {len(fake_articles)} fake articles to {DATA_DIR}")
    pd.DataFrame(true_articles).to_csv(DATA_DIR / "True.csv", index=False)
    pd.DataFrame(fake_articles).to_csv(DATA_DIR / "Fake.csv", index=False)
    print("Nepali News Dataset ready!")


def parse_args():
    parser = argparse.ArgumentParser(description="Generate Nepali real and fake news CSV datasets.")
    parser.add_argument("--real-count", type=int, default=999, help="Number of real news articles to fetch.")
    parser.add_argument("--fake-count", type=int, default=999, help="Number of synthetic fake news articles to create.")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    generate_data(real_count=args.real_count, fake_count=args.fake_count)
