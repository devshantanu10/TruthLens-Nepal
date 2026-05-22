import requests
import feedparser
import logging
from concurrent.futures import ThreadPoolExecutor
from .config import TRUSTED_SOURCES, NEWSDATA_API_KEY
from typing import List, Dict
import random

# Configure logging
logger = logging.getLogger(__name__)

def fetch_global_nepali_news():
    """Fetch international news related to Nepal."""
    url = f"https://newsdata.io/api/1/news?apikey={NEWSDATA_API_KEY}&q=Nepal&language=ne,en"
    try:
        resp = requests.get(url, timeout=10)
        data = resp.json()
        if data.get("status") == "success":
            return [{
                "title": r["title"], 
                "link": r["link"], 
                "description": r.get("description", ""), 
                "source": r["source_id"],
                "category": "Global"
            } for r in data["results"]]
    except Exception as e:
        logger.warning(f"Global news fetch failed: {e}")
    return []

def fetch_rss_feed(source):
    """Fetch and parse a single RSS feed."""
    try:
        resp = requests.get(source["rss"], timeout=8, headers={"User-Agent": "Mozilla/5.0"})
        feed = feedparser.parse(resp.content)
        return [{
            "title": e.title, 
            "link": e.link, 
            "description": e.get("summary", "")[:300], 
            "source": source["name"],
            "category": source["category"]
        } for e in feed.entries[:10]] # Increased to 10 per source
    except Exception as e:
        logger.error(f"Error fetching RSS from {source['name']}: {e}")
        return []

def fetch_news(refresh_token: str = "0"):
    """
    Fetch news from multiple sources and categories with deduplication and shuffle.
    Each unique refresh_token guarantees a fresh network fetch (no memoization).
    """
    logger.info(f"Fetching fresh news (Token: {refresh_token})")
    
    # Fetch RSS feeds in parallel
    with ThreadPoolExecutor(max_workers=len(TRUSTED_SOURCES)) as executor:
        results = list(executor.map(fetch_rss_feed, TRUSTED_SOURCES))
    
    # Flatten results
    local_news = [item for sublist in results for item in sublist]
    
    # Fetch global news
    global_news = fetch_global_nepali_news()
    
    # Combine all
    total_pool = local_news + global_news
    
    # --- DEDUPLICATION ---
    # Remove articles with identical or very similar titles
    unique_news = []
    seen_titles = set()
    
    for item in total_pool:
        # Simple normalization for comparison
        norm_title = item['title'].strip().lower()
        if norm_title not in seen_titles:
            unique_news.append(item)
            seen_titles.add(norm_title)
            
    # --- SHUFFLE & VARIETY ---
    # Use the refresh_token as a seed if we want deterministic variety,
    # otherwise just shuffle randomly for maximum freshness.
    random.shuffle(unique_news)
    
    return unique_news

def scrape_article_from_url(url):
    """Scrape full text content from a news URL."""
    try:
        from bs4 import BeautifulSoup
        resp = requests.get(url, timeout=10, headers={"User-Agent": "Mozilla/5.0"})
        soup = BeautifulSoup(resp.content, 'html.parser')
        
        # Remove junk
        for script_or_style in soup(["script", "style", "nav", "footer", "header"]):
            script_or_style.decompose()
            
        # Get title
        title = soup.title.string if soup.title else "No Title Found"
        
        # Get body text
        chunks = (phrase.strip() for line in soup.get_text().splitlines() for phrase in line.split("  "))
        text = '\n'.join(chunk for chunk in chunks if chunk and len(chunk) > 20)
        
        return title.strip(), text[:1500] # Return more context (1500 chars)
    except Exception as e:
        logger.error(f"Scrape error for {url}: {e}")
        return f"Error: {e}", ""
