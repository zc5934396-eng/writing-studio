# File: app/routes/analysis_routes.py
# Deskripsi: Route handler untuk Data Analysis. 
# Status: Refactored (Clean Architecture & Dynamic Dispatch).

from flask import Blueprint, render_template, request, jsonify, send_file, url_for, Response, stream_with_context
from flask_login import login_required, current_user
import pandas as pd
import json
import logging

from app.services.analysis_service import AnalysisService
from app.utils.data_engine import SPSSDataset
from app.utils import general_utils, ai_utils
from app import firestore_db

analysis_bp = Blueprint('analysis', __name__)
logger = logging.getLogger(__name__)

# --- HALAMAN VIEW ---

@analysis_bp.route('/data-analysis')
@login_required
def data_analysis():
    return render_template('data_analysis.html')

# --- API: MANAJEMEN DATA (CRUD) ---

@analysis_bp.route('/api/project/smart-import', methods=['POST'])
@login_required
def smart_import_preview():
    if 'file' not in request.files: return jsonify({'error': 'No file uploaded'}), 400
    file = request.files['file']
    if file.filename == '': return jsonify({'error': 'No selected file'}), 400

    try:
        preview_result = SPSSDataset.smart_preview(file, file.filename)
        if preview_result['status'] == 'error':
            return jsonify({'error': preview_result['message']}), 500
        return jsonify(preview_result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@analysis_bp.route('/api/project/initialize', methods=['POST'])
@login_required
def initialize_project():
    try:
        # Validasi payload
        payload = request.json or {}
        data = payload.get('data') 
        headers = payload.get('headers')
        
        if not data:
            return jsonify({'error': 'No valid data provided'}), 400

        df = pd.DataFrame(data, columns=headers)
        dataset = SPSSDataset(df, user_id=str(current_user.id))
        success, msg = dataset.save()
        
        if success: return jsonify({'status': 'success', 'message': msg})
        else: return jsonify({'error': f'Gagal menyimpan: {msg}'}), 500
    except Exception as e: 
        return jsonify({'error': str(e)}), 500

@analysis_bp.route('/api/variable-view/get', methods=['GET'])
@login_required
def get_variable_view():
    ds = SPSSDataset.load(current_user.id)
    return jsonify({'variables': ds.get_variable_view_data() if ds else []})

@analysis_bp.route('/api/data-view/get', methods=['GET'])
@login_required
def get_data_view():
    ds = SPSSDataset.load(current_user.id)
    return jsonify(ds.get_data_view_data() if ds else {'error': 'No data'})

@analysis_bp.route('/api/data-view/update', methods=['POST'])
@login_required
def update_data_view():
    d = request.json; ds = SPSSDataset.load(current_user.id)
    if ds: ds.update_cell_data(d.get('row'), d.get('col'), d.get('value'))
    return jsonify({'status': 'success'})

@analysis_bp.route('/api/variable-view/update', methods=['POST'])
@login_required
def update_variable_view():
    d = request.json; ds = SPSSDataset.load(current_user.id)
    if ds: ds.update_variable(d.get('name'), d.get('field'), d.get('value'))
    return jsonify({'status': 'success'})

@analysis_bp.route('/api/project/reset', methods=['POST'])
@login_required
def reset_project():
    try:
        ds = SPSSDataset.load(current_user.id)
        if ds: ds.clear_all_data()
        return jsonify({'status': 'success'})
    except Exception as e: return jsonify({'error': str(e)}), 500

@analysis_bp.route('/api/project/export-data', methods=['GET'])
@login_required
def export_data_csv():
    try:
        ds = SPSSDataset.load(current_user.id)
        if not ds or ds.df.empty: return jsonify({'error': 'Data kosong.'}), 404
        success, msg = ds.save() # Auto-save before export
        if not success: return jsonify({'error': msg}), 500
        
        return send_file(
            ds.export_to_csv(), 
            mimetype='text/csv', 
            as_attachment=True, 
            download_name=f'OnThesis_Export_{ds.project_id}.csv'
        )
    except Exception as e: return jsonify({'error': str(e)}), 500


# --- API: DATA PREPARATION (Unified) ---

@analysis_bp.route('/api/data-preparation/<action_type>', methods=['POST'])
@login_required
def data_preparation_handler(action_type):
    """
    Menangani: missing-values, remove-duplicates, find-replace, search-data
    """
    try:
        params = request.json
        
        # Khusus Search Data (Read Only)
        if action_type == 'search-data':
            ds = SPSSDataset.load(current_user.id)
            if not ds: return jsonify({'status':'error','message':'Dataset not found'}),404
            results = ds.search_data(params.get('query'), params.get('target_columns'))
            return jsonify({'status':'success','results': results})
            
        # Khusus Smart Scan (Read Only)
        if action_type == 'smart-scan': # Note: method GET biasanya, tapi kalau masuk sini jadi POST is okay or separate
            ds = SPSSDataset.load(current_user.id)
            if not ds: return jsonify({'status':'error','message':'Dataset not found'}),404
            return jsonify({'status':'success','report': ds.scan_data_quality()})

        # Actions yang mengubah data (Write)
        # Mapping nama route ke internal logic key
        internal_action_map = {
            'missing-values': 'missing_values',
            'remove-duplicates': 'remove_duplicates',
            'find-replace': 'find_replace'
        }
        
        internal_key = internal_action_map.get(action_type)
        if not internal_key:
             return jsonify({'error': 'Invalid action'}), 400

        result = AnalysisService.perform_data_preparation(current_user.id, internal_key, params)
        return jsonify(result)

    except Exception as e:
        logger.error(f"Data Prep Route Error: {e}")
        return jsonify({'error': str(e)}), 500

# Fix Route khusus untuk GET smart-scan agar konsisten dengan frontend lama jika pakai GET
@analysis_bp.route('/api/data-preparation/smart-scan', methods=['GET'])
@login_required
def smart_data_scan_get():
    try:
        ds = SPSSDataset.load(current_user.id)
        if not ds: return jsonify({'status':'error','message':'Dataset not found'}),404
        return jsonify({'status':'success','report':ds.scan_data_quality()})
    except Exception as e:
         return jsonify({'error': str(e)}), 500


# --- API: ANALISIS STATISTIK (THE MASTER ROUTE) ---

@analysis_bp.route('/api/run-analysis/<analysis_type>', methods=['POST'])
@login_required
def run_analysis_endpoint(analysis_type):
    """
    Unified Endpoint untuk semua analisis statistik.
    Menggantikan 10+ route terpisah.
    """
    # 1. Cek Kuota (Khusus Free User)
    if not current_user.is_pro:
        try:
            is_allowed, msg = general_utils.check_and_update_pro_trial(
                firestore_db, 
                current_user.email, 
                'data_analysis'
            )
            if not is_allowed:
                return jsonify({"error": msg, "redirect": url_for('main.upgrade_page')}), 403
        except Exception as e:
            logger.error(f"Quota Check Error: {e}")

    # 2. Eksekusi via Service
    try:
        params = request.get_json() or {}
        
        # Mapping route endpoint (kebab-case) ke internal service keys jika beda
        # Tapi di Service kita sudah pakai keys yang sama dengan frontend request
        
        result = AnalysisService.execute_analysis(current_user, analysis_type, params)
        return jsonify({"success": True, "data": result}), 200

    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400
    except FileNotFoundError as fe:
        return jsonify({"error": str(fe)}), 404
    except Exception as e:
        return jsonify({"error": f"Gagal memproses analisis: {str(e)}"}), 500

# --- KOMPATIBILITAS LEGACY ROUTES (Agar Frontend JS tidak error 404) ---
# Kita redirect internal request ke Master Route
# Note: Frontend JS di 'analysis_v2.js' memanggil endpoint spesifik seperti /api/independent-ttest
# Dengan Flask, kita bisa me-route multiple URL ke satu function, ATAU
# kita biarkan frontend memanggil endpoint lama, tapi ditangani oleh Master Route di atas.
# CARANYA: Tambahkan URL rules manual di bawah atau ubah frontend.
# Solusi Paling Aman (Tanpa Ubah JS): Register URLS

ANALYSIS_TYPES = [
    'descriptive-analysis', 'normality', 'independent-ttest', 'paired-ttest',
    'oneway-anova', 'correlation-analysis', 'linear-regression', 'mann-whitney',
    'kruskal-wallis', 'wilcoxon', 'reliability', 'validity', 'chi-square'
]

for a_type in ANALYSIS_TYPES:
    # Kita daftarkan route lama agar mengarah ke endpoint baru
    analysis_bp.add_url_rule(
        f'/api/{a_type}', 
        endpoint=f'legacy_{a_type}', 
        view_func=run_analysis_endpoint, 
        methods=['POST'],
        defaults={'analysis_type': a_type}
    )


# --- API: LOG & HISTORY ---

@analysis_bp.route('/api/analysis-history/get', methods=['GET'])
@login_required
def get_analysis_history():
    ds = SPSSDataset.load(current_user.id)
    return jsonify({'history': ds.get_analysis_history() if ds else []})

@analysis_bp.route('/api/analysis-history/delete/<log_id>', methods=['DELETE'])
@login_required
def delete_analysis_log(log_id):
    ds = SPSSDataset.load(current_user.id)
    if ds: ds.delete_analysis_log(log_id); return jsonify({'status': 'success'})
    return jsonify({'error': 'Dataset not found'}), 404

@analysis_bp.route('/api/analysis-history/clear', methods=['DELETE'])
@login_required
def clear_analysis_history():
    ds = SPSSDataset.load(current_user.id)
    if ds: ds.clear_analysis_history(); return jsonify({'status': 'success'})
    return jsonify({'error': 'Dataset not found'}), 404

# --- API: AI & INTERPRETASI (Tetap dipertahankan) ---

@analysis_bp.route('/api/interpret-result', methods=['POST'])
@login_required
def interpret_result():
    try:
        data = request.get_json()
        stats_text = data.get('result_data') 
        if not stats_text: return jsonify({'error': 'Data kosong'}), 400
        
        # Panggil AI Utils
        interpretation = ai_utils.get_ai_interpretation(str(stats_text))
        return jsonify({'status': 'success', 'interpretation': interpretation})
    except Exception as e: return jsonify({'error': str(e)}), 500

@analysis_bp.route('/api/generate-chapter4-draft', methods=['POST'])
@login_required
def generate_chapter4_draft():
    if not current_user.is_pro:
        # Check quota specific for writing
        is_allowed, msg = general_utils.check_and_update_pro_trial(firestore_db, current_user.email, 'writing_assistant')
        if not is_allowed:
            return jsonify({"error": "Limit Habis. Upgrade PRO untuk fitur Bab 4."}), 403

    try:
        data = request.get_json()
        stats_result = data.get('result')
        analysis_type = data.get('type')
        
        ds = SPSSDataset.load(current_user.id)
        project_context = None
        # Logic ambil context (bisa dipindah ke Service jika perlu, tapi ok disini)
        if ds and ds.project_id and ds.project_id != 'default':
            try:
                doc = firestore_db.collection('projects').document(ds.project_id).get()
                if doc.exists:
                    p_data = doc.to_dict()
                    project_context = {
                        'title': p_data.get('title'),
                        'problem_statement': p_data.get('problem_statement'),
                        'methodology': p_data.get('methodology'),
                        'variables': p_data.get('variables'),
                        'theories': p_data.get('theories')
                    }
            except: pass

        input_data = {
            "stats_result": json.dumps(stats_result, indent=2),
            "analysis_type": analysis_type,
            "note": "Buatkan pembahasan Bab 4 lengkap."
        }
        
        selected_model = "gpt5" if current_user.is_pro else "fast" 
        draft_content = ai_utils.generate_academic_draft(
            user=current_user,
            task_type="discussion_chapter4",
            input_data=input_data,
            project_context=project_context,
            selected_model=selected_model,
            word_count="1000"
        )
        return jsonify({'status': 'success', 'content': draft_content})

    except Exception as e:
        logger.error(f"Chapter 4 Gen Error: {e}")
        return jsonify({'error': str(e)}), 500

@analysis_bp.route('/api/data-analyst/chat', methods=['POST'])
@login_required
def data_analyst_chat():
    try:
        data = request.get_json()
        message = data.get('message')
        selected_model = data.get('model', 'fast') 
        
        ds = SPSSDataset.load(current_user.id)
        if not ds or ds.df.empty:
            return jsonify({'error': 'Dataset belum dimuat.'}), 404

        # Context Building
        try:
            preview_text = ds.df.head(5).to_string(index=False)
            desc_text = ds.df.describe().to_string()
        except:
            preview_text, desc_text = "N/A", "N/A"

        dataset_context = {
            'total_rows': len(ds.df),
            'total_cols': len(ds.df.columns),
            'variables': ds.get_variable_view_data(),
            'summary_text': f"SAMPEL:\n{preview_text}\n\nSTATISTIK:\n{desc_text}"
        }

        def generate():
            for chunk in ai_utils.get_data_analyst_stream(message, dataset_context, selected_model, current_user.is_pro):
                yield chunk

        return Response(stream_with_context(generate()), mimetype='text/plain')
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@analysis_bp.route('/api/analysis/save-to-project', methods=['POST'])
@login_required
def save_analysis_to_project():
    """
    Menyimpan hasil JSON statistik ke dalam dokumen Proyek Skripsi.
    Agar bisa dibaca oleh Writing Assistant saat generate Bab 4.
    """
    try:
        data = request.get_json()
        project_id = data.get('projectId')
        analysis_result = data.get('result') # JSON Hasil Statistik
        analysis_type = data.get('type')     # Jenis Uji (misal: regression)

        if not project_id or not analysis_result:
            return jsonify({'error': 'Data tidak lengkap'}), 400

        # Validasi kepemilikan proyek
        doc_ref = firestore_db.collection('projects').document(project_id)
        doc = doc_ref.get()
        
        if not doc.exists or doc.to_dict().get('userId') != str(current_user.id):
            return jsonify({'error': 'Proyek tidak ditemukan atau akses ditolak'}), 403

        # Update field khusus di proyek
        doc_ref.update({
            'data_analysis_result': analysis_result,
            'data_analysis_type': analysis_type,
            'updated_at': firestore.SERVER_TIMESTAMP
        })

        return jsonify({'status': 'success', 'message': 'Data terhubung ke Writing Studio!'})

    except Exception as e:
        return jsonify({'error': str(e)}), 500