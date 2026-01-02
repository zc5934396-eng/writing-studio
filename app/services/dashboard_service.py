# File: app/services/dashboard_service.py
# Deskripsi: Menangani logika bisnis untuk Dashboard dan Maintenance data.

import logging
import datetime
from app import firestore_db
from firebase_admin import firestore

logger = logging.getLogger(__name__)

class DashboardService:
    """
    Service untuk menangani kebutuhan data Dashboard dan pemeliharaan integritas data.
    Memisahkan direct DB access dari Controller/Route.
    """

    @staticmethod
    def get_user_stats(user_id, is_pro_status):
        """
        Mengambil statistik proyek, referensi, dan grafik aktivitas 7 hari terakhir.
        """
        try:
            uid = str(user_id)

            # 1. Hitung Total Proyek & Referensi
            # Note: Untuk skala besar, gunakan Aggregation Queries Firestore. 
            # Untuk saat ini (skala <10k docs), stream() masih acceptable.
            projects = firestore_db.collection('projects').where('userId', '==', uid).stream()
            total_projects = len(list(projects))

            citations = firestore_db.collection('citations').where('userId', '==', uid).stream()
            total_references = len(list(citations))

            # 2. Grafik Aktivitas (7 Hari Terakhir)
            today = datetime.datetime.now()
            seven_days_ago = today - datetime.timedelta(days=7)

            logs = firestore_db.collection('activity_logs')\
                .where('userId', '==', uid)\
                .where('timestamp', '>=', seven_days_ago)\
                .stream()

            activity_map = {}
            for log in logs:
                data = log.to_dict()
                ts = data.get('timestamp')
                # Handle timestamp firestore vs datetime python
                if ts:
                    # Jika format Firestore Timestamp, convert ke datetime
                    if hasattr(ts, 'date'):
                        date_key = ts.strftime('%Y-%m-%d')
                    else:
                         # Fallback jika string (jarang terjadi jika skema konsisten)
                        continue
                        
                    activity_map[date_key] = activity_map.get(date_key, 0) + 1

            # Format Data untuk Chart.js
            chart_labels = []
            chart_data = []

            for i in range(7):
                d = seven_days_ago + datetime.timedelta(days=i+1)
                d_str = d.strftime('%Y-%m-%d')
                day_name = d.strftime('%a') # Mon, Tue, etc
                
                chart_labels.append(day_name)
                chart_data.append(activity_map.get(d_str, 0))

            return {
                'projects': total_projects,
                'references': total_references,
                'isPro': is_pro_status,
                'chart': {
                    'labels': chart_labels,
                    'data': chart_data
                }
            }
        except Exception as e:
            logger.error(f"Error in DashboardService.get_user_stats: {e}")
            raise e

    @staticmethod
    def cleanup_orphaned_citations(user_id):
        """
        Maintenance: Menghapus referensi yang proyek induknya sudah tidak ada.
        Menggunakan Batch Operation untuk efisiensi.
        """
        try:
            uid = str(user_id)
            
            # 1. Ambil whitelist Project IDs
            projects = firestore_db.collection('projects').where('userId', '==', uid).stream()
            valid_project_ids = {p.id for p in projects} # Set lookup O(1)
            
            # 2. Scan semua referensi user
            citations = firestore_db.collection('citations').where('userId', '==', uid).stream()
            
            batch = firestore_db.batch()
            batch_count = 0
            deleted_count = 0
            
            for ref in citations:
                ref_data = ref.to_dict()
                ref_pid = ref_data.get('projectId')
                
                # Jika PID tidak ada di whitelist, hapus
                if ref_pid not in valid_project_ids:
                    batch.delete(ref.reference)
                    deleted_count += 1
                    batch_count += 1
                    
                    # Firestore batch limit 500 ops
                    if batch_count >= 400:
                        batch.commit()
                        batch = firestore_db.batch()
                        batch_count = 0
            
            # Commit sisa batch
            if batch_count > 0:
                batch.commit()
                
            return {
                'deleted_count': deleted_count,
                'valid_projects_count': len(valid_project_ids)
            }
            
        except Exception as e:
            logger.error(f"Error in DashboardService.cleanup_orphaned_citations: {e}")
            raise e