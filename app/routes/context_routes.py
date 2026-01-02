import os
import logging
import datetime
from flask import Blueprint, request, jsonify, current_app
from flask_login import login_required, current_user
from werkzeug.utils import secure_filename
from firebase_admin import firestore

# Import Internal App
from app import firestore_db
from app.services.rag_service import LiteContextEngine

context_bp = Blueprint('context', __name__)
rag_engine = LiteContextEngine()
logger = logging.getLogger(__name__)

# =========================================================
# BAGIAN 1: RAG / REFERENCE UPLOAD (LESTARI)
# =========================================================

ALLOWED_EXTENSIONS = {'pdf'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@context_bp.route('/api/upload-reference', methods=['POST'])
@login_required
def upload_reference():
    if 'file' not in request.files: return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    user_id = str(current_user.id)
    
    if file.filename == '' or not allowed_file(file.filename):
        return jsonify({'error': 'Invalid file'}), 400
        
    filename = secure_filename(file.filename)
    upload_folder = os.path.join(current_app.instance_path, 'uploads')
    if not os.path.exists(upload_folder): os.makedirs(upload_folder)
        
    file_path = os.path.join(upload_folder, filename)
    file.save(file_path)
    
    doc_id = str(hash(filename)) 
    try:
        result = rag_engine.process_document(file_path, doc_id, user_id)
        return jsonify({'message': 'File processed', 'details': result})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# =========================================================
# BAGIAN 2: SCALABLE PROJECT CONTEXT (FIXED)
# =========================================================
@context_bp.route('/api/project-context/<project_id>', methods=['GET'])
@login_required
def get_project_context(project_id):
    try:
        doc_ref = firestore_db.collection('projects').document(project_id)
        doc = doc_ref.get()

        if not doc.exists:
            return jsonify({'status': 'error', 'message': 'Project not found'}), 404

        data = doc.to_dict()
        if data.get('userId') != str(current_user.id):
            return jsonify({'status': 'error', 'message': 'Unauthorized'}), 403

        # 1. AMBIL SEMUA CHAPTER
        chapters_ref = doc_ref.collection('chapters').stream()
        
        raw_chapters = []
        for ch in chapters_ref:
            d = ch.to_dict()
            raw_chapters.append({
                'id': ch.id, # Ini DocumentSnapshot, jadi .id BISA
                'title': d.get('title', 'Untitled'),
                'original_index': d.get('index', 99)
            })

        # 2. LOGIKA SORTING PINTAR
        def get_sort_weight(chapter):
            # Pakai .get() biar aman kalau key title gak ada (walau default sudah ada)
            title = chapter.get('title', '').lower()
            if 'pendahuluan' in title: return 0
            if 'pustaka' in title or 'landasan' in title: return 1
            if 'metode' in title: return 2
            if 'hasil' in title or 'pembahasan' in title: return 3
            if 'penutup' in title or 'kesimpulan' in title: return 4
            return 99

        raw_chapters.sort(key=get_sort_weight)

        # 3. RE-INDEXING (BUG FIX DISINI)
        chapters_structure = []
        for new_index, ch in enumerate(raw_chapters):
            chapters_structure.append({
                'id': ch['id'], # [FIX] Pakai kurung siku karena 'ch' adalah dictionary
                'title': ch['title'],
                'index': new_index 
            })

        # Logic Migrasi Legacy
        if not chapters_structure and 'content' in data:
            chapters_structure.append({'id': 'chapter_1', 'title': 'Draft Utama', 'is_legacy': True})

        # 4. AMBIL REFERENSI
        refs_query = firestore_db.collection('citations')\
            .where('projectId', '==', project_id)\
            .stream()
            
        references_list = []
        for r in refs_query:
            r_data = r.to_dict()
            r_data['id'] = r.id
            if 'created_at' in r_data:
                ts = r_data['created_at']
                r_data['created_at'] = ts.isoformat() if hasattr(ts, 'isoformat') else str(ts)
            references_list.append(r_data)
        
        references_list.sort(key=lambda x: x.get('created_at', ''), reverse=True)

        # 5. RESPONSE
        response_data = {
            'id': doc.id,
            'title': data.get('title', 'Untitled Project'),
            'student_name': data.get('student_name', ''), 
            'university': data.get('university', ''),
            'degree_level': data.get('degree_level', 'S1'),
            
            # Konteks
            'problem_statement': data.get('problem_statement', ''),
            'research_objectives': data.get('research_objectives', ''),
            'significance': data.get('significance', ''),
            'theoretical_framework': data.get('theoretical_framework', ''),
            'variables_indicators': data.get('variables_indicators', ''),
            'methodology': data.get('methodology', 'quantitative'),
            'population_sample': data.get('population_sample', ''),
            'data_analysis': data.get('data_analysis', ''),
            
            'chapters_structure': chapters_structure,
            'references': references_list,
            'updatedAt': data.get('updatedAt', '')
        }
        return jsonify(response_data), 200

    except Exception as e:
        import traceback
        traceback.print_exc() 
        return jsonify({'status': 'error', 'message': str(e)}), 500
                
@context_bp.route('/api/project/<project_id>/chapter/<chapter_id>', methods=['GET'])
@login_required
def get_chapter_content(project_id, chapter_id):
    """Mengambil isi konten spesifik per bab."""
    try:
        proj_ref = firestore_db.collection('projects').document(project_id)
        proj = proj_ref.get()
        if not proj.exists or proj.to_dict().get('userId') != str(current_user.id):
             return jsonify({'error': 'Unauthorized'}), 403

        if chapter_id == 'legacy_content':
            return jsonify({'content': proj.to_dict().get('content', '')})

        chap_doc = proj_ref.collection('chapters').document(chapter_id).get()
        content = ""
        if chap_doc.exists:
            content = chap_doc.to_dict().get('content', '')
        
        return jsonify({'content': content})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@context_bp.route('/api/project/<project_id>/chapter/save', methods=['POST'])
@login_required
def save_chapter_content(project_id):
    try:
        payload = request.get_json()
        chap_id = payload.get('chapterId', 'chapter_1')
        
        # Persiapan Data Update
        update_data = {
            'content': payload.get('content', ''), 
            'updated_at': firestore.SERVER_TIMESTAMP,
            'index': payload.get('index', 0)
        }
        
        # [FIX] Hanya update judul jika dikirim frontend dan BUKAN default jelek
        new_title = payload.get('title')
        if new_title and new_title not in ['Bab Tanpa Judul', '']:
            update_data['title'] = new_title

        firestore_db.collection('projects').document(project_id)\
            .collection('chapters').document(chap_id)\
            .set(update_data, merge=True) # merge=True agar field lain aman

        firestore_db.collection('projects').document(project_id)\
            .update({'updated_at': firestore.SERVER_TIMESTAMP})
            
        return jsonify({'status': 'success'}), 200
    except Exception as e: return jsonify({'error': str(e)}), 500

@context_bp.route('/api/project-update/<project_id>', methods=['POST'])
@login_required
def update_project_meta(project_id):
    """
    Update Metadata Global (Judul, Penulis, Variabel) - BUKAN KONTEN BAB.
    """
    try:
        payload = request.get_json()
        print(f"[CONTEXT UPDATE] Payload: {payload}")

        # 1. Bersihkan Payload untuk DB (Tambahkan Timestamp)
        db_payload = payload.copy()
        db_payload['updatedAt'] = firestore.SERVER_TIMESTAMP

        # 2. Update Firestore (Pakai SET MERGE biar aman)
        doc_ref = firestore_db.collection('projects').document(project_id)
        doc_ref.set(db_payload, merge=True)

        # 3. FIX SENTINEL ERROR: Ganti Timestamp dengan String untuk Response JSON
        response_payload = payload.copy()
        response_payload['updatedAt'] = datetime.datetime.now().isoformat()

        return jsonify({'status': 'success', 'data': response_payload}), 200

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': str(e)}), 500

# =========================================================
# BAGIAN 3: MANAJEMEN REFERENSI (TAMBAHAN WAJIB)
# =========================================================

@context_bp.route('/api/project/<project_id>/references/add', methods=['POST'])
@login_required
def add_project_reference(project_id):
    """
    Menyimpan referensi baru ke koleksi 'citations'.
    PENTING: Ini pasangan dari logika GET referensi tadi.
    """
    try:
        payload = request.get_json()
        
        # Validasi sederhana
        if not payload or 'title' not in payload:
            return jsonify({'status': 'error', 'message': 'Invalid reference data'}), 400

        # Persiapan data untuk Firestore
        ref_data = {
            'projectId': project_id,
            'userId': str(current_user.id),
            'title': payload.get('title', 'No Title'),
            'authors': payload.get('authors', 'Unknown'),
            'year': payload.get('year', ''),
            'journal': payload.get('journal', ''),
            'doi': payload.get('doi', ''),
            'url': payload.get('url', ''),
            'type': payload.get('type', 'journal'),
            'created_at': firestore.SERVER_TIMESTAMP
        }

        # Simpan ke koleksi 'citations'
        doc_ref = firestore_db.collection('citations').add(ref_data)
        
        # Return ID dokumen yang baru dibuat
        # (doc_ref[1] adalah referensi dokumennya)
        new_id = doc_ref[1].id
        
        return jsonify({
            'status': 'success', 
            'message': 'Reference saved',
            'id': new_id
        }), 200

    except Exception as e:
        logger.error(f"Error adding reference: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500