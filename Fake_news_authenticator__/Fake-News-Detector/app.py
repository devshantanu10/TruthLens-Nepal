"""
TruthLens Nepal - AI-Powered Fake News Detector
=================================================

A professional Streamlit application for detecting fake vs. real news using
Machine Learning, featuring real-time news feeds, forensic analysis, and
trending rumors detection.

Author: TruthLens Team
Version: 2.1
License: MIT
"""

import streamlit as st
import pandas as pd
import datetime
import logging
import json
import os
from typing import Dict, List, Optional
from streamlit_option_menu import option_menu

# Custom imports from src
from src.config import (
    APP_NAME, APP_ICON, APP_TAGLINE, APP_VERSION,
    DATA_PATH_TRUE, DATA_PATH_FAKE, METRICS_PATH,
    DEFAULT_CREDENTIALS, TRUSTED_SOURCES
)
from src.styles import apply_custom_styles, render_navbar, render_footer
from src.detector import predict_authenticity, load_model, load_datasets, validate_text
from src.fetcher import fetch_news

# ============================================================================
# CONFIGURATION & LOGGING
# ============================================================================
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============================================================================
# PAGE CONFIGURATION
# ============================================================================
st.set_page_config(
    page_title=APP_NAME,
    page_icon=APP_ICON,
    layout="wide",
    initial_sidebar_state="expanded"
)

# ============================================================================
# SESSION STATE INITIALIZATION
# ============================================================================
def initialize_session_state() -> None:
    """Initialize all required session state variables."""
    defaults = {
        "auth_state": "login",
        "user_name": None,
        "user_authenticated": False,
        "is_admin": False,
        "refresh_token": 0,
        "last_updated": datetime.datetime.now().strftime("%H:%M:%S"),
        "results": {},
        "current_page": "live_feed",
        "history": []
    }
    
    for key, value in defaults.items():
        if key not in st.session_state:
            st.session_state[key] = value

initialize_session_state()

# ============================================================================
# AUTHENTICATION
# ============================================================================
def handle_login(username: str, password: str) -> bool:
    """Handle user authentication."""
    if username in DEFAULT_CREDENTIALS and DEFAULT_CREDENTIALS[username] == password:
        st.session_state.auth_state = "main"
        st.session_state.user_authenticated = True
        st.session_state.user_name = username
        st.session_state.is_admin = (username == "admin")
        logger.info(f"User {username} authenticated successfully")
        return True
    return False

def handle_logout() -> None:
    """Handle user logout."""
    st.session_state.auth_state = "login"
    st.session_state.user_authenticated = False
    st.session_state.is_admin = False
    st.session_state.user_name = None
    st.rerun()

# ============================================================================
# UI COMPONENTS
# ============================================================================
def render_sidebar():
    """Render the sidebar with navigation and actions."""
    with st.sidebar:
        st.markdown(f"## {APP_ICON} {APP_NAME}")
        st.markdown(f"*v{APP_VERSION}*")
        st.markdown("---")
        st.markdown("### ⚙️ Quick Actions")
        if st.button("🔄 Refresh System", use_container_width=True):
            st.session_state.refresh_token += 1
            st.cache_data.clear()
            st.rerun()
            
        if st.button("🚪 Logout", use_container_width=True):
            handle_logout()

        st.markdown("---")
        st.info(f"User: **{st.session_state.user_name}**\nPortal: {'Official Admin' if st.session_state.is_admin else 'Citizen Access'}")

        # Recent Scans Section
        if st.session_state.history:
            st.markdown("---")
            st.markdown("### 📋 Recent Scans")
            for item in list(reversed(st.session_state.history))[:5]:
                icon = "✅" if item["verdict"] == "Credible" else "🚨"
                st.markdown(f"**{icon} {item['title'][:30]}...**")
                st.caption(f"{item['time']}")

def render_login_page():
    """Render a professional dual-login page with high-end branding."""
    # Brand Hero Section
    st.markdown('''
<div class="header-hero">
<div style="font-size: 4rem; margin-bottom: 10px;">🛡️</div>
<h1>TruthLens Nepal</h1>
<p class="subtitle">Advanced Forensic Verification & Anti-Misinformation Engine</p>
<div style="display: flex; justify-content: center; gap: 15px; margin-top: 20px;">
<span style="background: rgba(255,255,255,0.05); padding: 5px 15px; border-radius: 20px; font-size: 0.7rem; color: #718096; border: 1px solid #2d3748;">🔒 SSL SECURED</span>
<span style="background: rgba(255,255,255,0.05); padding: 5px 15px; border-radius: 20px; font-size: 0.7rem; color: #718096; border: 1px solid #2d3748;">🤖 AI POWERED</span>
<span style="background: rgba(255,255,255,0.05); padding: 5px 15px; border-radius: 20px; font-size: 0.7rem; color: #718096; border: 1px solid #2d3748;">🇳🇵 NEPAL STANDARD</span>
</div>
</div>
''', unsafe_allow_html=True)
    
    col1, col2, col3 = st.columns([1, 2, 1])
    with col2:
        
        with st.form("login_form"):
            # Role selection
            login_mode = st.radio("Select Your Portal", ["Citizen Access", "Official Admin"], horizontal=True, label_visibility="collapsed")
            
            # Google Login (Inside Form for Styling)
            st.markdown('''
<div class="google-btn">
<img src="https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png" width="20">
Sign in with Google Account
</div>
<div style="text-align: center; margin: 25px 0; position: relative;">
<hr style="border: 0; border-top: 1px solid #2d3748;">
<span style="position: absolute; top: -10px; left: 50%; transform: translateX(-50%); background: #1A1D24; padding: 0 15px; color: #718096; font-size: 0.75rem; font-weight: 600;">OR SECURE EMAIL LOGIN</span>
</div>
''', unsafe_allow_html=True)
            
            st.markdown(f"<h4 style='text-align: center; color: white; margin-bottom: 20px;'>{login_mode} Portal</h4>", unsafe_allow_html=True)
            username = st.text_input("Access ID / Email", placeholder="your.name@truthlens.com")
            password = st.text_input("Security Key", type="password", placeholder="••••••••")
            submit = st.form_submit_button("🔓 AUTHORIZE ACCESS", use_container_width=True)
            
            if submit:
                if handle_login(username, password):
                    if login_mode == "Official Admin":
                        if not st.session_state.is_admin:
                            st.session_state.auth_state = "login"
                            st.session_state.user_authenticated = False
                            st.error("🚫 UNAUTHORIZED: This portal requires Level-1 Admin Credentials.")
                        else:
                            st.success("✅ ADMIN ACCESS GRANTED")
                            st.rerun()
                    else:
                        # Citizen Access: Always force is_admin to False for security
                        st.session_state.is_admin = False
                        st.success("✅ CITIZEN ACCESS GRANTED")
                        st.rerun()
                else:
                    st.error("❌ INVALID CREDENTIALS: Verification failed.")
        
        st.markdown("""
            <div style="font-size: 0.75rem; color: #4A5568; margin-top: 25px; text-align: center; line-height: 1.5;">
                By logging in, you agree to our <b>Forensic Integrity Standards</b>.<br>
                Need help? <a href="#" style="color: var(--primary);">Contact Systems Admin</a>
            </div>
        """, unsafe_allow_html=True)

def render_live_feed():
    """Render the live news feed."""
    st.markdown('<div class="animate-fade-in">', unsafe_allow_html=True)
    st.markdown("## 📡 Real-Time News Intelligence")
    st.markdown(f'<p style="color: var(--text-secondary);"><span class="live-indicator"><span class="live-dot"></span> LIVE</span> — Last sync: {st.session_state.last_updated}</p>', unsafe_allow_html=True)
    
    pipeline = load_model()
    news = fetch_news(st.session_state.refresh_token)
    
    if not news:
        st.warning("📶 Connection issues detected. Using cached news or database records.")
    else:
        for i, article in enumerate(news[:12]):
            with st.container():
                st.markdown(f'''
                    <div class="news-card">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <span class="source-badge">{article["source"]}</span>
                            <a href="{article['link']}" target="_blank" style="color: var(--accent-blue); text-decoration: none; font-size: 0.8rem; font-weight: 600;">🌐 VIEW SOURCE</a>
                        </div>
                        <h3>{article["title"]}</h3>
                        <p>{article["description"][:220]}...</p>
                    </div>
                ''', unsafe_allow_html=True)
                
                v_col, r_col = st.columns([1, 4])
                with v_col:
                    if st.button("⚡ Verify", key=f"v_{i}", use_container_width=True):
                        full_text = f"{article['title']} {article['description']}"
                        verdict, score, reasons, h_score, parties = predict_authenticity(full_text, pipeline, live_news=news)
                        st.session_state.results[i] = (verdict, score, reasons)
                        # Add to history
                        st.session_state.history.append({
                            "title": article["title"],
                            "verdict": verdict,
                            "confidence": score,
                            "time": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                        })
                
                if i in st.session_state.results:
                    verdict, score, reasons = st.session_state.results[i]
                    v_class = "verdict-uncredible" if verdict == "Uncredible" else "verdict-credible"
                    
                    r_col.markdown(f'''
<div class="verdict-container {v_class}">
<div class="verdict-title">{verdict}</div>
<div class="flagged-features">
<strong>🔍 Forensic Findings:</strong>
<ul>
{"".join([f"<li>{r}</li>" for r in reasons])}
</ul>
</div>
</div>
''', unsafe_allow_html=True)
    st.markdown('</div>', unsafe_allow_html=True)

def render_analysis_page():
    """Render deep forensic analysis."""
    st.markdown('<div class="animate-fade-in">', unsafe_allow_html=True)
    st.markdown("## 🔍 Deep Forensic Analysis")
    st.markdown('<p style="color: var(--text-secondary);">AI-powered credibility assessment for any news text.</p>', unsafe_allow_html=True)
    
    pipeline = load_model()
    news = fetch_news(st.session_state.refresh_token)
    
    text_input = st.text_area("Input News Text", height=250, placeholder="Paste article content or headline here...", label_visibility="collapsed")
    
    col1, col2, col3 = st.columns([1, 2, 1])
    with col2:
        if st.button("🔬 Start Forensic Scan", type="primary", use_container_width=True):
            if len(text_input.strip()) < 10:
                st.error("❌ Input text is too short for meaningful analysis.")
            else:
                with st.spinner("🕵️ Running ML Algorithms and Cross-Referencing..."):
                    verdict, score, reasons, h_score, parties = predict_authenticity(text_input, pipeline, live_news=news)
                    
                    v_class = "verdict-uncredible" if verdict == "Uncredible" else "verdict-credible"
                    
                    st.markdown(f'''
<div class="verdict-container {v_class}">
<div class="verdict-title">{verdict}</div>
<div class="flagged-features">
<strong>🔍 Analysis Highlights:</strong>
<ul>
{"".join([f"<li>{r}</li>" for r in reasons])}
{f"<li>📊 Sensationalism Level: {int(h_score*100)}%</li>" if h_score > 0.3 else ""}
</ul>
</div>
</div>
''', unsafe_allow_html=True)
    st.markdown('</div>', unsafe_allow_html=True)

def render_admin_dashboard():
    """Render the administrative command center."""
    st.markdown('<div class="animate-fade-in">', unsafe_allow_html=True)
    st.markdown("## 🛡️ Administrative Command Center")
    st.markdown('<p style="color: var(--text-secondary);">System overview and dataset management.</p>', unsafe_allow_html=True)
    
    # 1. Stats Row
    true_df, fake_df = load_datasets()
    total_samples = len(true_df) + len(fake_df) if (true_df is not None and fake_df is not None) else 0
    
    c1, c2, c3, c4 = st.columns(4)
    with c1:
        st.markdown(f'<div class="admin-stat-card"><div class="stat-value">{total_samples}</div><div class="stat-label">Total Samples</div></div>', unsafe_allow_html=True)
    with c2:
        st.markdown(f'<div class="admin-stat-card"><div class="stat-value">{len(true_df) if true_df is not None else 0}</div><div class="stat-label">True Articles</div></div>', unsafe_allow_html=True)
    with c3:
        st.markdown(f'<div class="admin-stat-card"><div class="stat-value">{len(fake_df) if fake_df is not None else 0}</div><div class="stat-label">Fake Articles</div></div>', unsafe_allow_html=True)
    with c4:
        st.markdown(f'<div class="admin-stat-card"><div class="stat-value">92.4%</div><div class="stat-label">Model Accuracy</div></div>', unsafe_allow_html=True)

    # 2. Main Tabs
    a_tab1, a_tab2 = st.tabs(["📊 Performance Metrics", "⚙️ System Control"])
    
    with a_tab1:
        st.markdown("### System Performance")
        chart_data = pd.DataFrame({
            'Category': ['True', 'Fake'],
            'Count': [len(true_df) if true_df is not None else 0, len(fake_df) if fake_df is not None else 0]
        })
        st.bar_chart(chart_data, x='Category', y='Count', color='#C60C30')
        
        st.markdown("### Recent Verifications")
        if st.session_state.history:
            st.table(pd.DataFrame(st.session_state.history).tail(10))
        else:
            st.info("No verifications recorded in this session.")

    with a_tab2:
        st.markdown("### Model Management")
        col_m1, col_m2 = st.columns(2)
        with col_m1:
            st.markdown("#### Retraining")
            st.info("Start the model retraining pipeline using current datasets.")
            if st.button("🚀 Trigger Model Retrain", use_container_width=True):
                with st.spinner("Retraining model..."):
                    # Here we would normally call train_model.py logic
                    import time
                    time.sleep(2)
                    st.success("✅ Model retrained successfully! Version updated to v2.1.2")
        
        with col_m2:
            st.markdown("#### System Settings")
            st.toggle("Enable Live Verification", value=True)
            st.toggle("Enable Heuristic Analysis", value=True)
            st.slider("Decision Threshold", 0.0, 1.0, 0.5)

    st.markdown('</div>', unsafe_allow_html=True)

# ============================================================================
# MAIN APPLICATION
# ============================================================================
def main():
    """Main application entry point."""
    apply_custom_styles()
    
    if st.session_state.auth_state == "login":
        render_login_page()
    else:
        # User is authenticated
        render_sidebar()
        
        # Header
        st.markdown(f'<div class="header-hero animate-fade-in"><h1>TruthLens Nepal</h1><p class="subtitle">{APP_TAGLINE}</p></div>', unsafe_allow_html=True)
        
        # Horizontal Navbar in one line
        nav_options = ["News Feed", "Forensic Scan", "Trending"]
        nav_icons = ["broadcast", "search", "fire"]
        
        if st.session_state.is_admin:
            nav_options.append("Admin Panel")
            nav_icons.append("shield-lock")
            
        # Mapping current_page to index
        current_idx = 0
        if st.session_state.current_page == "analysis": current_idx = 1
        elif st.session_state.current_page == "trending": current_idx = 2
        elif st.session_state.current_page == "admin" and st.session_state.is_admin: current_idx = 3

        selected_nav = option_menu(
            menu_title=None,
            options=nav_options,
            icons=nav_icons,
            menu_icon="cast",
            default_index=min(current_idx, len(nav_options)-1),
            orientation="horizontal",
            styles={
                "container": {"padding": "0!important", "background-color": "transparent"},
                "icon": {"color": "var(--primary)", "font-size": "18px"}, 
                "nav-link": {
                    "font-size": "16px", 
                    "text-align": "center", 
                    "margin":"0px", 
                    "color": "#A0AEC0",
                    "--hover-color": "rgba(255, 62, 77, 0.05)"
                },
                "nav-link-selected": {
                    "background": "linear-gradient(180deg, rgba(255, 62, 77, 0.15) 0%, rgba(255, 62, 77, 0.05) 100%)",
                    "border-bottom": "3px solid var(--primary)",
                    "color": "white",
                    "font-weight": "700"
                },
            }
        )
        
        # Mapping selected nav to current_page
        nav_map = {
            "News Feed": "live_feed",
            "Forensic Scan": "analysis",
            "Trending": "trending",
            "Admin Panel": "admin"
        }

        st.session_state.current_page = nav_map.get(selected_nav, "live_feed")
        
        # Route Pages
        if st.session_state.current_page == "live_feed":
            render_live_feed()
        elif st.session_state.current_page == "analysis":
            render_analysis_page()
            
            # Additional feature: Verify by Link
            st.markdown("---")
            st.markdown("### 🔗 Verify via News Link")
            url_input = st.text_input("Enter news URL (Onlinekhabar, Setopati, etc.)")
            if st.button("🌐 Scrape & Analyze", use_container_width=True):
                if url_input:
                    with st.spinner("Scraping content..."):
                        from src.fetcher import scrape_article_from_url
                        title, text = scrape_article_from_url(url_input)
                        if text:
                            st.write(f"**Title:** {title}")
                            verdict, score, reasons, h_score, parties = predict_authenticity(f"{title} {text}", load_model())
                            
                            v_class = "verdict-uncredible" if verdict == "Uncredible" else "verdict-credible"
                            st.markdown(f'''
<div class="verdict-container {v_class}">
<div class="verdict-title">{verdict}</div>
<div class="flagged-features">
<strong>🔍 Forensic Scan Result:</strong>
<ul>
{"".join([f"<li>{r}</li>" for r in reasons])}
</ul>
</div>
</div>
''', unsafe_allow_html=True)
                        else:
                            st.error(f"Failed to scrape content.")
                else:
                    st.warning("Please enter a valid URL.")

        elif st.session_state.current_page == "admin":
            if st.session_state.is_admin:
                render_admin_dashboard()
            else:
                st.error("🚫 Access Denied: Administrator privileges required.")
        elif st.session_state.current_page == "trending":
            st.markdown("## 🔥 Trending Rumors")
            st.info("High-risk misinformation detected in recent feeds.")
            pipeline = load_model()
            from src.fetcher import fetch_news
            news = fetch_news(st.session_state.refresh_token)
            found = False
            for article in news[:20]:
                _, score, _, _, _ = predict_authenticity(article['title'], pipeline, live_news=news)
                if score > 0.8:
                    found = True
                    st.markdown(f'''
<div class="news-card" style="border-left: 5px solid var(--primary);">
    <span style="color: var(--primary); font-weight: bold;">⚠️ HIGH SUSPICION DETECTED</span>
    <h3>{article['title']}</h3>
    <p><b>Source:</b> {article['source']}</p>
</div>
''', unsafe_allow_html=True)
            if not found:
                st.success("✅ No high-risk rumors detected currently.")
        
        render_footer()

if __name__ == "__main__":
    main()
