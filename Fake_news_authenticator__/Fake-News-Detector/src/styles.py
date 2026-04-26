import streamlit as st

def apply_custom_styles():
    """Premium High-Visibility Dark Theme for TruthLens Nepal"""
    st.markdown("""
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700;800&display=swap');
        
        :root {
            --primary: #FF3E4D;       /* Vibrant Crimson */
            --primary-dark: #C60C30;
            --bg-dark: #0F1115;       /* Deep Midnight */
            --bg-card: #1A1D24;       /* Slate Charcoal */
            --bg-hover: #252A33;
            --text-main: #FFFFFF;
            --text-dim: #A0AEC0;
            --border: #2D3748;
            --accent-blue: #3182CE;
        }

        .stApp {
            background-color: var(--bg-dark);
            color: var(--text-main);
        }

        /* ===== PREMIUM DARK HEADER ===== */
        .header-hero {
            background: linear-gradient(135deg, #1A1D24 0%, #0F1115 100%);
            border-bottom: 3px solid var(--primary);
            padding: 50px 20px;
            text-align: center;
            margin-bottom: 40px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }

        .header-hero h1 {
            font-family: 'Outfit', sans-serif;
            font-size: 3.5rem;
            font-weight: 800;
            color: white;
            margin-bottom: 10px;
            letter-spacing: -1px;
        }

        .header-hero .subtitle {
            font-size: 1.2rem;
            color: var(--text-dim);
            max-width: 800px;
            margin: 0 auto;
            font-weight: 400;
        }

        /* ===== HIGH-VISIBILITY CARDS ===== */
        .news-card {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 28px;
            margin-bottom: 25px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .news-card:hover {
            transform: translateY(-5px);
            border-color: var(--primary);
            background: var(--bg-hover);
            box-shadow: 0 12px 30px rgba(255, 62, 77, 0.15);
        }

        .source-badge {
            background: rgba(255, 62, 77, 0.1);
            color: var(--primary);
            padding: 6px 16px;
            border-radius: 6px;
            font-size: 0.8rem;
            font-weight: 700;
            border: 1px solid rgba(255, 62, 77, 0.2);
            margin-bottom: 20px;
            display: inline-block;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .news-card h3 {
            color: white;
            font-size: 1.6rem;
            line-height: 1.4;
            margin-bottom: 15px;
        }

        .news-card p {
            color: var(--text-dim);
            font-size: 1.05rem;
            line-height: 1.6;
        }

        /* ===== VERDICT DESIGN (HIGH CONTRAST) ===== */
        .verdict-container {
            border-radius: 12px;
            padding: 30px;
            margin: 25px 0;
            border: 1px solid transparent;
            box-shadow: 0 10px 25px rgba(0,0,0,0.4);
        }

        .verdict-credible {
            background: rgba(40, 167, 69, 0.05);
            border: 1px solid #28A745;
            color: #28A745;
        }

        .verdict-uncredible {
            background: rgba(220, 53, 69, 0.05);
            border: 1px solid #DC3545;
            color: #DC3545;
        }

        .verdict-title {
            font-family: 'Outfit', sans-serif;
            font-size: 2.2rem;
            font-weight: 800;
            margin-bottom: 15px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .flagged-features {
            background: rgba(0, 0, 0, 0.2);
            padding: 20px;
            border-radius: 8px;
            margin-top: 20px;
            border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .flagged-features strong {
            color: white;
            display: block;
            margin-bottom: 10px;
            font-size: 1.1rem;
        }

        .flagged-features ul {
            margin: 0;
            padding-left: 20px;
            color: var(--text-dim);
        }

        .flagged-features li {
            margin-bottom: 8px;
        }

        /* ===== AUTHENTICATION (DARK MODE) ===== */
        [data-testid="stForm"] {
            background: var(--bg-card) !important;
            border: 1px solid var(--border) !important;
            border-radius: 16px !important;
            padding: 50px !important;
            box-shadow: 0 20px 50px rgba(0,0,0,0.6) !important;
        }

        .google-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            width: 100%;
            background: white;
            color: #1A1D24;
            padding: 14px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 700;
            margin-bottom: 25px;
            transition: transform 0.2s;
        }

        .google-btn:hover {
            transform: scale(1.02);
        }

        /* ===== STREAMLIT OVERRIDES ===== */
        [data-testid="stSidebar"] {
            background-color: #0F1115 !important;
            border-right: 1px solid var(--border);
        }

        .stTextArea textarea, .stTextInput input {
            background-color: #0F1115 !important;
            border: 1px solid var(--border) !important;
            color: white !important;
            border-radius: 8px !important;
        }

        .stButton > button {
            background: linear-gradient(135deg, #FF3E4D 0%, #C60C30 50%, #8E0922 100%) !important;
            color: white !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
            border-radius: 12px !important;
            padding: 16px 32px !important;
            font-weight: 800 !important;
            font-size: 1.1rem !important;
            width: 100%;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) !important;
            box-shadow: 0 6px 20px rgba(255, 62, 77, 0.4), inset 0 2px 4px rgba(255,255,255,0.2) !important;
            text-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }

        .stButton > button:hover {
            transform: scale(1.03) translateY(-4px) !important;
            box-shadow: 0 12px 35px rgba(255, 62, 77, 0.6), inset 0 2px 10px rgba(255,255,255,0.3) !important;
            filter: brightness(1.25) saturate(1.1);
        }

        .stButton > button:active {
            transform: scale(0.98) !important;
        }

        /* Navbar styles */
        .nav-link {
            color: var(--text-dim) !important;
        }
        .nav-link:hover {
            color: white !important;
        }

        /* ===== ADMIN STATS (DARK) ===== */
        .admin-stat-card {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 25px;
            text-align: center;
            transition: all 0.3s var(--ease);
        }

        .admin-stat-card:hover {
            border-color: var(--primary);
            transform: translateY(-5px);
            background: var(--bg-hover);
        }

        .stat-value {
            font-size: 2.5rem;
            font-weight: 800;
            color: white;
            margin-bottom: 5px;
        }

        .stat-label {
            color: var(--text-dim);
            font-size: 0.85rem;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
    </style>
    """, unsafe_allow_html=True)

def render_footer():
    """Premium Dark Footer"""
    st.markdown("""
        <div style="margin-top: 80px; padding: 40px; text-align: center; border-top: 1px solid #2d3748; background: #0F1115;">
            <p style="color: #718096; font-size: 0.9rem; letter-spacing: 1px;">
                TRUTHLENS NEPAL &copy; 2026 | FORENSIC VERIFICATION ENGINE
            </p>
            <div style="margin-top: 10px; color: #4A5568; font-size: 0.8rem;">
                Secure &bullet; Transparent &bullet; Reliable
            </div>
        </div>
    """, unsafe_allow_html=True)

def render_navbar():
    pass

def render_admin_dashboard(stats):
    pass
