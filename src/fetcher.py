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
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9,ne;q=0.8",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
        }
        resp = requests.get(url, timeout=15, headers=headers)
        resp.raise_for_status()

        soup = BeautifulSoup(resp.content, 'html.parser')
        for tag in soup(["script", "style", "nav", "footer", "header", "aside", "form", "noscript", "iframe"]):
            tag.decompose()

        title = soup.title.string.strip() if soup.title and soup.title.string else "No Title Found"

        def text_from_block(block):
            paragraphs = block.find_all('p')
            if paragraphs:
                return '\n\n'.join(p.get_text(separator=' ', strip=True) for p in paragraphs if p.get_text(strip=True))
            return block.get_text(separator='\n', strip=True)

        article_block = soup.find('article')
        if article_block and article_block.get_text(strip=True):
            content = text_from_block(article_block)
        else:
            selectors = [
                "div[id*='content']",
                "div[class*='content']",
                "div[class*='article']",
                "div[class*='story']",
                "main",
                "div[id*='article']",
                "div[class*='post']",
                "section[class*='content']",
                "section[class*='article']"
            ]
            content = ''
            for sel in selectors:
                block = soup.select_one(sel)
                if block:
                    text_block = text_from_block(block)
                    if len(text_block) > 300:
                        content = text_block
                        break
            if not content:
                content = soup.get_text(separator='\n', strip=True)

        lines = [line.strip() for line in content.splitlines() if line.strip()]
        text = '\n'.join(line for line in lines if len(line) > 20)

        return title, text
    except Exception as e:
        logger.error(f"Scrape error for {url}: {e}")
        return f"Error: {e}", ""
