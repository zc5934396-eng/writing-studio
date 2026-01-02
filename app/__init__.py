# File: app/__init__.py

import os
import firebase_admin
from firebase_admin import credentials, firestore
from flask import Flask
from flask_login import LoginManager
from flask_talisman import Talisman
from midtransclient import Snap
from dotenv import load_dotenv

# Load Environment Variables
load_dotenv()

# --- 1. INISIALISASI GLOBAL ---
db = None
firestore_db = None
midtrans_snap = None
login_manager = LoginManager()

def create_app():
    global firestore_db, midtrans_snap

    app = Flask(__name__)
    
    # Konfigurasi App
    app.config['SECRET_KEY'] = os.getenv('FLASK_SECRET_KEY', 'rahasia-negara-123')
    app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # Max Upload 16MB

    # --- 2. SETUP FIREBASE (AUTO-DETECT) ---
    if not firebase_admin._apps:
        # Coba 1: Ambil dari .env
        cred_path = os.getenv('FIREBASE_CREDENTIALS')
        
        # Coba 2: Kalau .env kosong, cari file 'serviceAccountKey.json' di folder root
        if not cred_path:
            possible_path = os.path.join(os.getcwd(), 'serviceAccountKey.json')
            if os.path.exists(possible_path):
                cred_path = possible_path
                print(f"✅ Auto-detect Service Account: {cred_path}")

        # Eksekusi Login Firebase
        if cred_path and os.path.exists(cred_path):
            try:
                cred = credentials.Certificate(cred_path)
                firebase_admin.initialize_app(cred)
                print("🔥 Firebase Connected Successfully!")
            except Exception as e:
                print(f"❌ Firebase Auth Error: {e}")
        else:
            print("⚠️ Warning: Service Account Key tidak ditemukan. Mencoba Application Default Credentials...")
            firebase_admin.initialize_app()
    
    # Inisialisasi Client Firestore
    try:
        firestore_db = firestore.client()
    except Exception as e:
        print(f"❌ Gagal koneksi Firestore: {e}")

    # --- 3. SETUP MIDTRANS ---
    midtrans_snap = Snap(
        is_production=False, 
        server_key=os.getenv('MIDTRANS_SERVER_KEY'),
        client_key=os.getenv('MIDTRANS_CLIENT_KEY')
    )

    # --- 4. SETUP LOGIN MANAGER ---
    login_manager.init_app(app)
    login_manager.login_view = 'auth.login_page'
    login_manager.login_message = "Silakan login untuk mengakses halaman ini."

    from app.models import User 

    @login_manager.user_loader
    def load_user(user_id):
        if not firestore_db: return None
        try:
            doc = firestore_db.collection('users').document(user_id).get()
            if doc.exists:
                return User.from_firestore(doc)
        except Exception:
            return None
        return None

# KONFIGURASI CSP (CONTENT SECURITY POLICY)
    # Update ini mengizinkan: Plotly, Handsontable, Tailwind, dan API Google
    csp = {
        'default-src': [
            '\'self\'',
            'https://*.gstatic.com',
            'https://*.googleapis.com',
            'https://*.firebaseio.com',
        ],
        'script-src': [
            '\'self\'',
            '\'unsafe-inline\'',
            '\'unsafe-eval\'',
            'https://cdnjs.cloudflare.com',
            'https://cdn.jsdelivr.net',
            'https://unpkg.com',
            'https://www.googletagmanager.com',
            'https://app.sandbox.midtrans.com',
            'https://app.midtrans.com',
            'https://apis.google.com',
            'https://cdn.plot.ly',
            'https://cdn.tailwindcss.com',
            'https://www.gstatic.com',         # Penting untuk Firebase Script
            'https://*.firebaseio.com',
            'https://*.googleapis.com',
        ],
        'style-src': [
            '\'self\'',
            '\'unsafe-inline\'',
            'https://fonts.googleapis.com',
            'https://cdn.jsdelivr.net',
            'https://cdnjs.cloudflare.com',
            'https://unpkg.com',
        ],
        'font-src': [
            '\'self\'',
            'https://fonts.gstatic.com',
            'https://cdnjs.cloudflare.com',
            'data:',
        ],
        'connect-src': [
            '\'self\'',
            'https://secure.gravatar.com',
            'https://app.sandbox.midtrans.com',
            'https://app.midtrans.com',
            'https://*.googleapis.com',
            'https://*.firebaseio.com',
            'https://identitytoolkit.googleapis.com', # Auth
            'https://securetoken.googleapis.com',     # Auth
            'https://firestore.googleapis.com',       # Firestore
            'https://www.gstatic.com',                # [FIX UTAMA] Agar tidak error .js.map
        ],
        'img-src': [
            '\'self\'',
            'data:',
            'https:',
            'https://*.googleusercontent.com',        # Gambar profil Google
        ],
        'frame-src': [                                # Kadang dibutuhkan untuk Auth iframe
            '\'self\'',
            'https://*.firebaseapp.com',
            'https://app.midtrans.com',
            'https://app.sandbox.midtrans.com',
        ],
        'object-src': '\'none\'',
        'base-uri': '\'self\''
    }
    # PERBAIKAN PENTING:
    # 1. Menghapus 'content_security_policy_nonce_in' agar 'unsafe-inline' bekerja.
    # 2. Menambahkan 'permissions_policy' manual agar tidak muncul warning 'browsing-topics'.
    Talisman(app, 
             content_security_policy=csp, 
             force_https=False,
             permissions_policy={
                'geolocation': '()',
                'microphone': '()',
                'camera': '()'
             }) 

    # --- 6. REGISTER BLUEPRINTS ---
    from app.routes.main_routes import main_bp
    from app.routes.auth_routes import auth_bp
    from app.routes.assistant_routes import assistant_bp
    from app.routes.analysis_routes import analysis_bp
    from app.routes.payment_routes import payment_bp
    from app.routes.context_routes import context_bp

    app.register_blueprint(main_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(assistant_bp)
    app.register_blueprint(analysis_bp)
    app.register_blueprint(payment_bp)
    app.register_blueprint(context_bp)

    return app