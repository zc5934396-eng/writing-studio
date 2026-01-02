# File: app/routes/auth_routes.py
# Deskripsi: Menangani autentikasi dengan pattern yang lebih bersih dan aman.

from flask import Blueprint, render_template, redirect, url_for, request, jsonify
from flask_login import login_user, logout_user, login_required, current_user
from app.models import User
from app import firestore_db
import firebase_admin.auth as auth
from firebase_admin import firestore
import logging

auth_bp = Blueprint('auth', __name__)
logger = logging.getLogger(__name__)

@auth_bp.route('/login', methods=['GET'])
def login_page():
    if current_user.is_authenticated:
        return redirect(url_for('main.dashboard'))
    return render_template('login.html')

@auth_bp.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('auth.login_page'))

# --- SERVICE METHODS (Helper Internal) ---
def _get_or_create_user(uid, email, photo_url, display_name):
    """
    Logika bisnis untuk mengambil user atau membuatnya jika belum ada.
    Mengembalikan tuple: (User Object, is_new_user)
    """
    user_ref = firestore_db.collection('users').document(uid)
    user_doc = user_ref.get()
    
    if not user_doc.exists:
        # --- Create New User ---
        new_user_data = {
            'email': email,
            'created_at': firestore.SERVER_TIMESTAMP,
            'is_pro': False,
            'isPro': False, # Legacy compatibility
            'photoURL': photo_url,
            'displayName': display_name or email.split('@')[0],
            'usage_limits': {}
        }
        user_ref.set(new_user_data)
        logger.info(f"User baru dibuat: {email}")
        
        # Fetch ulang agar mendapatkan object User yang valid
        return User.from_firestore(user_ref.get()), True
    else:
        # --- Existing User ---
        # Cek apakah perlu update profil (sinkronisasi dari Google)
        current_data = user_doc.to_dict()
        updates = {}
        
        if photo_url and current_data.get('photoURL') != photo_url:
            updates['photoURL'] = photo_url
        if display_name and not current_data.get('displayName'):
            updates['displayName'] = display_name
            
        if updates:
            user_ref.update(updates)
            
        return User.from_firestore(user_doc), False

# --- API ENDPOINTS ---
@auth_bp.route('/api/verify-email-token', methods=['POST'])
def verify_email_token():
    try:
        if not firestore_db:
            logger.critical("Koneksi Firestore tidak tersedia.")
            return jsonify({'error': 'Layanan database tidak tersedia.'}), 503

        data = request.json
        id_token = data.get('token')
        
        if not id_token:
            return jsonify({'error': 'Token otentikasi diperlukan'}), 400

        # 1. Verifikasi Token Firebase
        try:
            decoded_token = auth.verify_id_token(id_token)
            uid = decoded_token['uid']
            email = decoded_token['email']
            photo_url = decoded_token.get('picture')
            display_name = decoded_token.get('name')
        except ValueError:
            return jsonify({'error': 'Format token tidak valid.'}), 400
        except Exception as e:
            logger.warning(f"Token Verification Failed: {e}")
            return jsonify({'error': 'Sesi login kadaluarsa atau tidak valid.'}), 401
        
        # 2. Handle User Creation/Retrieval via Service Method
        user_obj, _ = _get_or_create_user(uid, email, photo_url, display_name)
        
        if not user_obj:
            return jsonify({'error': 'Gagal memproses data pengguna.'}), 500

        # 3. Flask Login Session
        login_user(user_obj, remember=True)
        
        return jsonify({
            'status': 'success', 
            'redirect_url': url_for('main.dashboard'),
            'message': f'Login berhasil. Halo, {user_obj.username}!'
        })

    except Exception as e:
        logger.error(f"Unhandled Auth Error: {e}", exc_info=True)
        return jsonify({'error': "Terjadi kesalahan internal server."}), 500