# File: app/routes/main_routes.py
# Deskripsi: Route utama dashboard & profil. Refactored to use Service Layer.

import os
import logging
from flask import render_template, request, flash, redirect, url_for, jsonify
from flask_login import login_required, current_user
from firebase_admin import auth
import PyPDF2

from . import main_bp
from app import firestore_db
from app.utils import general_utils, search_utils, ai_utils
# Import Service Baru
from app.services.dashboard_service import DashboardService

logger = logging.getLogger(__name__)

# --- HALAMAN VIEW (HTML) ---

@main_bp.route('/')
def index():
    if current_user.is_authenticated:
        return redirect(url_for('main.dashboard'))
    return render_template('landing.html')

@main_bp.route('/dashboard')
@login_required
def dashboard():
    return render_template('dashboard.html')

@main_bp.route('/projects')
@login_required
def projects():
    return render_template('projects.html')

@main_bp.route('/citation-management')
@login_required
def citation_management():
    return render_template('citation_management.html')

@main_bp.route('/search-references')
@login_required
def search_references():
    return redirect(url_for('main.citation_management'))

@main_bp.route('/paraphrase-ai')
@login_required
def paraphrase_ai():
    return render_template('paraphrase_ai.html')

@main_bp.route('/chat-ai')
@login_required
def chat_ai():
    return render_template('chat_ai.html')

@main_bp.route('/upgrade')
@login_required
def upgrade_page():
    client_key = os.getenv('MIDTRANS_CLIENT_KEY')
    return render_template('upgrade.html', client_key=client_key)

# --- HALAMAN PROFIL ---

@main_bp.route('/profile', methods=['GET', 'POST'])
@login_required
def user_profile():
    if request.method == 'POST':
        try:
            new_name = request.form.get('name')
            if not new_name or len(new_name) < 3:
                flash('Nama tampilan harus memiliki setidaknya 3 karakter.', 'danger')
                return redirect(url_for('main.user_profile'))
            
            user_id = str(current_user.id)
            
            # Update Firestore & Auth (Bisa dipindah ke UserService nanti)
            firestore_db.collection('users').document(user_id).update({'displayName': new_name})
            auth.update_user(user_id, display_name=new_name)
            
            flash('Profil berhasil diperbarui!', 'success')
        except Exception as e:
            logger.error(f"Profile Update Error: {e}")
            flash(f'Gagal memperbarui profil: {e}', 'danger')
        return redirect(url_for('main.user_profile'))
    
    client_key = os.getenv('MIDTRANS_CLIENT_KEY')
    return render_template('user-profile.html', midtrans_client_key=client_key)


# --- API ENDPOINTS (REFACTORED) ---

@main_bp.route('/api/dashboard-stats', methods=['GET'])
@login_required
def dashboard_stats():
    """
    API Dashboard Stats.
    Logic dipindah ke DashboardService.
    """
    try:
        stats_data = DashboardService.get_user_stats(current_user.id, current_user.is_pro)
        
        return jsonify({
            'status': 'success',
            'stats': {
                'projects': stats_data['projects'],
                'references': stats_data['references'],
                'isPro': stats_data['isPro']
            },
            'chart': stats_data['chart']
        })

    except Exception as e:
        logger.error(f"Dashboard API Error: {e}")
        return jsonify({'error': str(e)}), 500

@main_bp.route('/api/maintenance/cleanup-orphans', methods=['POST'])
@login_required
def cleanup_orphans():
    """
    API Maintenance: Clean Orphaned Citations.
    Logic dipindah ke DashboardService.
    """
    try:
        result = DashboardService.cleanup_orphaned_citations(current_user.id)
        
        return jsonify({
            'status': 'success', 
            'message': f"Berhasil membersihkan {result['deleted_count']} referensi hantu.",
            'valid_projects': result['valid_projects_count']
        })

    except Exception as e:
        logger.error(f"Cleanup API Error: {e}")
        return jsonify({'error': str(e)}), 500

# --- API LAINNYA (Existing) ---

@main_bp.route('/api/get-user-projects', methods=['GET'])
@login_required
def get_user_projects():
    """API untuk mengambil daftar proyek riset milik user."""
    # TODO: Pindahkan ke ProjectService di iterasi berikutnya
    try:
        projects = []
        project_docs = firestore_db.collection('projects').where('userId', '==', str(current_user.id)).stream()
        
        for doc in project_docs:
            data = doc.to_dict()
            projects.append({
                'id': doc.id,
                'title': data.get('title', 'Proyek Tanpa Nama')
            })
        return jsonify(projects)
    except Exception as e:
        logger.error(f"Error fetching projects: {e}")
        return jsonify({"error": "Gagal mengambil data proyek."}), 500

@main_bp.route('/api/unified-search-references', methods=['POST'])
@login_required
def api_unified_search():
    if not request.is_json:
        return jsonify({"error": "Request harus berupa JSON"}), 400
        
    try:
        data = request.get_json()
        query = data.get('query')
        if not query: return jsonify({"error": "Query kosong"}), 400

        # CCTV Log
        general_utils.log_user_activity(firestore_db, current_user.id, 'search', {'query': query})

        results = search_utils.unified_search(
            query=query,
            sources=data.get('sources'),
            year=data.get('year')
        )
        return jsonify({"message": "Success", "results": results}), 200

    except Exception as e:
        logger.error(f"Search API Error: {e}")
        return jsonify({'error': str(e)}), 500


@main_bp.route('/api/analyze-document', methods=['POST'])
@login_required
def analyze_document():
    if 'document' not in request.files: return jsonify({'error': 'File required'}), 400
    file = request.files['document']
    
    try:
        # CCTV Log
        general_utils.log_user_activity(firestore_db, current_user.id, 'analysis', {'type': 'doc_extract'})

        # --- LOGIKA BARU (Simple Extract) ---
        # Kita baca langsung PDF-nya di sini tanpa bergantung pada ai_utils yang error
        
        pdf_reader = PyPDF2.PdfReader(file)
        full_text = ""
        
        # Limit 30 halaman biar cepat
        max_pages = min(len(pdf_reader.pages), 30)
        for i in range(max_pages):
            page_text = pdf_reader.pages[i].extract_text()
            if page_text:
                full_text += page_text + "\n"
        
        clean_text = full_text.strip()

        if not clean_text: 
            return jsonify({'error': 'File unreadable/scanned'}), 400

        # Return format yang diharapkan frontend
        metadata = {
            'title': file.filename,
            'author': 'Dokumen Upload',
            'year': '2024',
            'journal': 'PDF Reference',
            'abstract': clean_text[:500] + "...", # Preview
            'full_text': clean_text # Simpan full text jika perlu
        }

        return jsonify({'status': 'success', 'references': [metadata]})

    except Exception as e:
        logger.error(f"Doc Analysis Error: {e}")
        return jsonify({'error': str(e)}), 500
    
@main_bp.route('/.well-known/appspecific/com.chrome.devtools.json')
def chrome_devtools_silencer():
    return jsonify({}), 200
