# File: app/utils/general_utils.py
# Deskripsi: Kumpulan fungsi pembantu umum (API, File, Stats, & Firestore Logic).

import numpy as np
import json
import io
import base64
import requests
import time
import PyPDF2
import docx
from datetime import date, datetime
from firebase_admin import firestore
from scipy.stats import t
import matplotlib.pyplot as plt
import traceback

# ==========================================
# 1. API & NETWORK HELPERS
# ==========================================

def make_api_request_with_retry(url, headers, params=None, timeout=25, retries=3, backoff_factor=2):
    """
    Membuat request API dengan mekanisme coba ulang (retry) jika terjadi rate limit atau error koneksi.
    """
    for attempt in range(retries):
        try:
            response = requests.get(url, headers=headers, params=params, timeout=timeout)
            if response.status_code == 404:
                print(f"Sumber tidak ditemukan (404) di URL: {url}. Melewati.")
                return None
            response.raise_for_status()
            return response
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 429: # Rate limit
                if attempt < retries - 1:
                    delay = backoff_factor ** attempt
                    print(f"Rate limit terdeteksi. Mencoba lagi dalam {delay} detik...")
                    time.sleep(delay)
                else:
                    print("Gagal setelah beberapa kali percobaan. Melemparkan error.")
                    raise
            else:
                raise
        except requests.exceptions.RequestException as e:
            print(f"Error koneksi: {e}")
            if attempt < retries - 1:
                delay = backoff_factor ** attempt
                time.sleep(delay)
            else:
                raise
    return None

# ==========================================
# 2. DATA & FILE PROCESSING HELPERS
# ==========================================

def create_plot_as_base64(fig):
    """Mengubah objek figure Matplotlib menjadi string base64."""
    buf = io.BytesIO()
    fig.savefig(buf, format='png', bbox_inches='tight')
    plt.close(fig)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode('utf-8')

def sanitize_nan(data):
    """Mengubah nilai NaN/inf menjadi None agar kompatibel dengan JSON."""
    if isinstance(data, dict):
        return {k: sanitize_nan(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [sanitize_nan(i) for i in data]
    elif isinstance(data, float) and (np.isnan(data) or np.isinf(data)):
        return None
    return data

def read_pdf(file_stream):
    """Membaca teks dari file PDF."""
    try:
        reader = PyPDF2.PdfReader(file_stream)
        text = ""
        for page in reader.pages:
            text += page.extract_text() or ""
        return text
    except Exception as e:
        print(f"Error reading PDF: {e}")
        return ""

def read_docx(file_stream):
    """Membaca teks dari file DOCX."""
    try:
        doc = docx.Document(file_stream)
        text = "\n".join([para.text for para in doc.paragraphs])
        return text
    except Exception as e:
        print(f"Error reading DOCX: {e}")
        return ""

# ==========================================
# 3. STATISTICAL HELPERS
# ==========================================

def get_r_table(n, alpha=0.05):
    """Menghitung nilai r-tabel berdasarkan jumlah sampel (n) dan alpha."""
    df = n - 2
    if df <= 0: return float('nan')
    t_critical = t.ppf(1 - alpha / 2, df)
    return np.sqrt(t_critical**2 / (df + t_critical**2))

def format_float(value, precision=3):
    """Memformat float dengan presisi tertentu."""
    if value is None or not isinstance(value, (int, float, np.number)) or np.isnan(value) or np.isinf(value):
        return None
    return round(float(value), precision)

def format_p_value(p_value, precision=3):
    """Memformat p-value (misal: <0.001)."""
    if p_value is None or np.isnan(p_value): return None
    return "<0.001" if p_value < 0.001 else str(round(p_value, precision))

# ==========================================
# 4. FIRESTORE USER MANAGEMENT HELPERS
# ==========================================

def _get_firestore_user_by_email(firestore_client, email):
    """
    Mencari user di Firestore berdasarkan email.
    Jika tidak ketemu (misal data korup/terhapus), otomatis buat data baru (Auto-Repair).
    Mengembalikan: (user_ref, user_data)
    """
    try:
        users_ref = firestore_client.collection('users')
        # Query berdasarkan email
        query = users_ref.where('email', '==', email).limit(1).stream()
        results = list(query)
        
        if results:
            # User ketemu
            return results[0].reference, results[0].to_dict()
        else:
            # User tidak ketemu -> Buat baru otomatis (Self-Healing)
            print(f"⚠️ User {email} tidak ditemukan di Firestore. Membuat data baru otomatis...")
            new_data = {
                'email': email,
                'created_at': firestore.SERVER_TIMESTAMP,
                'is_Pro': False,
                'displayName': email.split('@')[0],
                'usage_limits': {
                    'paraphrase_count': 0, 'chat_count': 0, 'search_count': 0,
                    'writing_assistant_count': 0, 'data_analysis_count': 0, 'export_doc_count': 0,
                    'last_reset_date': date.today().isoformat(),
                    'citation_count': 0, 'generate_theory_count': 0
                }
            }
            # Buat dokumen baru dengan ID acak (karena kita tidak punya UID dari Auth di konteks ini)
            # Idealnya kita punya UID, tapi ini fallback jika hanya modal email.
            new_ref = users_ref.document()
            new_ref.set(new_data)
            return new_ref, new_data
            
    except Exception as e:
        print(f"❌ Error accessing Firestore for user {email}: {e}")
        traceback.print_exc()
        return None, None


def check_and_update_usage(firestore_client, user_email, feature_name):
    """
    Memeriksa dan memperbarui kuota penggunaan fitur gratis.
    Menggunakan Email sebagai kunci pencarian.
    """
    # --- LIMIT CONFIGURATION ---
    # Di mode produksi, angka ini harus diperkecil (misal: 5, 10, 15)
    FEATURE_LIMITS = {
        'paraphrase': 1000, 
        'chat': 1000, 
        'search': 1000, 
        'citation': 1000
    }
    
    limit = FEATURE_LIMITS.get(feature_name)
    if limit is None: return True, "OK" # Fitur tidak dilimit
    
    # Cari user
    user_ref, user_data = _get_firestore_user_by_email(firestore_client, user_email)
    if not user_ref: 
        return False, "Gagal terhubung ke database pengguna."
    
    # Cek status PRO
    if user_data.get('is_Pro', False):
        return True, "User is PRO"

    today_str = date.today().isoformat()
    usage_data = user_data.get('usage_limits', {})
    last_reset = usage_data.get('last_reset_date')
    
    # Reset harian jika tanggal beda
    if last_reset != today_str:
        # Simpan total citation karena itu lifetime limit (bukan harian)
        citation_total = usage_data.get('citation_count', 0)
        
        # Reset counter harian
        reset_update = {
            'usage_limits.paraphrase_count': 0,
            'usage_limits.chat_count': 0,
            'usage_limits.search_count': 0,
            'usage_limits.writing_assistant_count': 0,
            'usage_limits.data_analysis_count': 0,
            'usage_limits.export_doc_count': 0,
            'usage_limits.generate_theory_count': 0,
            'usage_limits.last_reset_date': today_str
        }
        user_ref.update(reset_update)
        
        # Update object lokal untuk pengecekan selanjutnya di request ini
        usage_data['paraphrase_count'] = 0
        usage_data['chat_count'] = 0
        # ... dst
    
    count_key = f"{feature_name}_count"
    current_count = usage_data.get(count_key, 0)
    
    if current_count >= limit:
        if feature_name == 'citation':
             return False, f"Anda telah mencapai batas total {limit} referensi untuk akun gratis."
        return False, f"Anda telah mencapai batas harian ({limit}x). Upgrade ke PRO untuk akses tanpa batas."
    
    # Atomic Increment
    user_ref.update({f'usage_limits.{count_key}': firestore.Increment(1)})
    return True, "OK"

def check_and_update_pro_trial(firestore_client, user_email, feature_name):
    """
    Memeriksa dan memperbarui kuota percobaan fitur PRO.
    Menggunakan Email sebagai kunci pencarian.
    """
    # Limit untuk fitur PRO (Free Trial)
    PRO_TRIAL_LIMITS = {
        'writing_assistant': 1000, 
        'data_analysis': 1000, 
        'export_doc': 1000, 
        'generate_theory': 1000
    }
    
    limit = PRO_TRIAL_LIMITS.get(feature_name)
    if limit is None: return True, "OK"
    
    # Cari user
    user_ref, user_data = _get_firestore_user_by_email(firestore_client, user_email)
    if not user_ref:
        return False, "Gagal terhubung ke database pengguna."
    
    # Jika PRO, bypass cek ini
    if user_data.get('is_Pro', False):
        return True, "User is PRO"
    
    usage_data = user_data.get('usage_limits', {})
    count_key = f"{feature_name}_count"
    current_count = usage_data.get(count_key, 0)
    
    if current_count >= limit:
        return False, "UPGRADE_REQUIRED"
        
    # Atomic Increment
    user_ref.update({f'usage_limits.{count_key}': firestore.Increment(1)})
    return True, "OK"

    # --- TAMBAHAN BARU: SISTEM LOGGING ---
def log_user_activity(firestore_client, user_id, activity_type, meta=None):
    """
    Mencatat aktivitas user untuk statistik dashboard.
    activity_type: 'writing', 'analysis', 'citation', 'project'
    """
    try:
        # Gunakan firestore.SERVER_TIMESTAMP untuk waktu server yang akurat
        # Pastikan import firestore ada di file ini atau pass nilainya
        from firebase_admin import firestore 
        
        doc_data = {
            'userId': str(user_id),
            'type': activity_type,
            'timestamp': firestore.SERVER_TIMESTAMP,
            'meta': meta or {}
        }
        # Simpan ke koleksi 'activity_logs'
        firestore_client.collection('activity_logs').add(doc_data)
    except Exception as e:
        print(f"Log Activity Error: {e}")