import pandas as pd
import requests
import feedparser
from pathlib import Path
import time

DATA_DIR = Path("data")
DATA_DIR.mkdir(exist_ok=True)

TRUE_SOURCES = [
    {"name": "Onlinekhabar", "rss": "https://www.onlinekhabar.com/feed"},
    {"name": "Setopati", "rss": "https://www.setopati.com/feed"},
    {"name": "Kathmandu Post", "rss": "https://kathmandupost.com/rss"},
    {"name": "Nagarik News", "rss": "https://nagariknews.com/feed"}
]

FAKE_PATTERNS = [
    "भर्खरै सार्वजनिक भयो बिष्फोटक समाचार! सबैले सेयर गरौं।",
    "यो भिडियो हेर्नुहोस, कसैले नदेखोस भनेर हटाइएको छ।",
    "नेपालमा फेरि अर्को ठूलो भूकम्प आउने खुलासा, सबै सचेत रहनुहोस।",
    "अमेरिकाबाट आयो यस्तो खबर, नेपालीहरुका लागि दुखद समाचार।",
    "एमसीसी पास भएपछि नेपालमा अमेरिकी सेना छिर्ने निश्चित, हेर्नुहोस प्रमाण।"
]

def generate_data():
    print("Cleaning up old data...")
    
    # 1. Generate TRUE news from live RSS feeds
    print("Fetching real news from Nepali sources...")
    true_articles = []
    for source in TRUE_SOURCES:
        try:
            print(f"  - Fetching from {source['name']}...")
            resp = requests.get(source["rss"], timeout=10, headers={"User-Agent": "Mozilla/5.0"})
            feed = feedparser.parse(resp.content)
            for entry in feed.entries:
                text = f"{entry.get('title', '')} {entry.get('summary', '')}"
                if text.strip():
                    true_articles.append({"text": text, "subject": "nepaliNews", "date": entry.get("published", "N/A")})
            time.sleep(1) # Be nice to servers
        except Exception as e:
            print(f"  - Error fetching {source['name']}: {e}")

    # 2. Generate FAKE news (synthetic but based on common Nepali misinformation)
    print("Generating fake news patterns...")
    fake_articles = []
    for i in range(len(true_articles) // 2): # Balanced-ish
        pattern = FAKE_PATTERNS[i % len(FAKE_PATTERNS)]
        # Mix in some real-ish sounding but fake topics
        fake_text = f"{pattern} नेपालको राजनीतिमा नयाँ मोड, {i} जना पक्राउ।"
        fake_articles.append({"text": fake_text, "subject": "misinformation", "date": "N/A"})

    # Convert to DataFrames
    true_df = pd.DataFrame(true_articles)
    fake_df = pd.DataFrame(fake_articles)

    # Save to CSV
    print(f"Saving {len(true_df)} real and {len(fake_df)} fake articles...")
    true_df.to_csv(DATA_DIR / "True.csv", index=False)
    fake_df.to_csv(DATA_DIR / "Fake.csv", index=False)
    
    print("Nepali News Dataset ready!")

if __name__ == "__main__":
    generate_data()
