import requests
import feedparser
import streamlit as st
from concurrent.futures import ThreadPoolExecutor
from .config import TRUSTED_SOURCES, NEWSDATA_API_KEY

@st.cache_data(ttl=600) # Cache for 10 minutes
def fetch_global_nepali_news():
    url = f"https://newsdata.io/api/1/news?apikey={NEWSDATA_API_KEY}&q=Nepal&language=ne,en"
    try:
        resp = requests.get(url, timeout=10)
        data = resp.json()
        if data.get("status") == "success":
            return [{"title": r["title"], "link": r["link"], "description": r.get("description", ""), "source": r["source_id"]} for r in data["results"]]
    except:
        pass
    return []

def fetch_rss_feed(source):
    try:
        resp = requests.get(source["rss"], timeout=8, headers={"User-Agent": "Mozilla/5.0"})
        feed = feedparser.parse(resp.content)
        return [{"title": e.title, "link": e.link, "description": e.get("summary", ""), "source": source["name"]} for e in feed.entries[:10]]
    except:
        return []

@st.cache_data(ttl=300) # Cache for 5 minutes
def fetch_news(refresh_token: int = 0):
    with ThreadPoolExecutor(max_workers=len(TRUSTED_SOURCES)) as executor:
        results = list(executor.map(fetch_rss_feed, TRUSTED_SOURCES))
    
    # Flatten and add global news
    all_news = [item for sublist in results for item in sublist]
    global_news = fetch_global_nepali_news()
    return all_news + global_news

def scrape_article_from_url(url):
    try:
        from bs4 import BeautifulSoup
        resp = requests.get(url, timeout=10, headers={"User-Agent": "Mozilla/5.0"})
        soup = BeautifulSoup(resp.content, 'html.parser')
        
        # Remove script and style elements
        for script_or_style in soup(["script", "style"]):
            script_or_style.decompose()
            
        # Get title
        title = soup.title.string if soup.title else "No Title Found"
        
        # Get text
        chunks = (phrase.strip() for line in soup.get_text().splitlines() for phrase in line.split("  "))
        text = '\n'.join(chunk for chunk in chunks if chunk)
        
        return title.strip(), text[:1000] # Return first 1000 chars of clean text
    except Exception as e:
        return f"Error: {e}", ""
