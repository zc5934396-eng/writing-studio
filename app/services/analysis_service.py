# File: app/services/analysis_service.py

import logging
import traceback
import re
from typing import Dict, Any, List, Optional, Union

from app import firestore_db
from app.utils import stats_utils, general_utils
from app.utils.data_engine import SPSSDataset

logger = logging.getLogger(__name__)

class AnalysisService:
    """
    Service terpusat untuk segala jenis analisis data:
    1. Analisis Statistik (SPSS-like) -> Descriptive, T-Test, ANOVA, Regression, dll.
    2. Data Preparation -> Cleaning, Missing Value, Find-Replace.
    3. Analisis Teks -> Readability Score, Tone Analysis (untuk fitur Style DNA).
    """

    # Mapping string request ke fungsi di stats_utils
    ANALYSIS_MAP = {
        'descriptive-analysis': stats_utils.run_descriptive_analysis,
        'normality': stats_utils.run_normality_test,
        'independent-ttest': stats_utils.run_independent_ttest,
        'paired-ttest': stats_utils.run_paired_ttest,
        'oneway-anova': stats_utils.run_oneway_anova,
        'correlation-analysis': stats_utils.run_correlation,
        'linear-regression': stats_utils.run_linear_regression,
        'mann-whitney': stats_utils.run_mann_whitney,
        'kruskal-wallis': stats_utils.run_kruskal_wallis,
        'wilcoxon': stats_utils.run_wilcoxon,
        'reliability': stats_utils.run_reliability_analysis,
        'validity': stats_utils.run_validity_analysis,
        'chi-square': stats_utils.run_chi_square
    }

    # ==========================================
    # 1. ANALISIS STATISTIK (CORE)
    # ==========================================
    @staticmethod
    def execute_analysis(user, analysis_type: str, params: dict) -> Dict[str, Any]:
        """
        Menjalankan analisis statistik berdasarkan tipe yang diminta.
        Otomatis menyimpan log ke history dataset.
        """
        # 1. Validasi Tipe Analisis
        func_to_run = AnalysisService.ANALYSIS_MAP.get(analysis_type)
        if not func_to_run:
            raise ValueError(f"Analisis '{analysis_type}' belum didukung oleh sistem.")

        # 2. Load Dataset User
        dataset = SPSSDataset.load(user.id)
        if not dataset or dataset.df.empty:
            raise FileNotFoundError("Dataset kosong. Harap upload atau import data terlebih dahulu.")

        try:
            # 3. Eksekusi Fungsi Statistik (dari stats_utils)
            result = func_to_run(dataset, **params)
            
            # 4. [AI Enrichment] Tambahkan narasi otomatis agar mudah dibaca user/AI
            result = AnalysisService._enrich_with_ai_context(result, analysis_type)
            
            # 5. Simpan Log ke History Dataset (Penting untuk AnalysisTab)
            if hasattr(dataset, 'add_analysis_log'):
                dataset.add_analysis_log(analysis_type, result, params)
                logger.info(f"Analysis Log Saved: {analysis_type} for user {user.id}")
            
            # 6. Log Aktivitas User (Audit Trail)
            general_utils.log_user_activity(
                firestore_db, 
                user.id, 
                'analysis', 
                {'type': analysis_type}
            )

            return result

        except Exception as e:
            logger.error(f"Error executing {analysis_type}: {str(e)}")
            logger.error(traceback.format_exc())
            raise e

    # ==========================================
    # 2. DATA PREPARATION & CLEANING
    # ==========================================
    @staticmethod
    def perform_data_preparation(user_id: str, action_type: str, params: dict) -> Dict[str, str]:
        """
        Menangani operasi cleaning: Missing Values, Remove Duplicates, Find & Replace.
        """
        dataset = SPSSDataset.load(user_id)
        if not dataset:
            raise FileNotFoundError("Dataset tidak ditemukan.")

        success, message = False, "Aksi tidak dikenali."

        try:
            if action_type == 'missing_values':
                success, message = dataset.handle_missing_values(
                    params.get('action'), params.get('target_columns')
                )
            elif action_type == 'remove_duplicates':
                success, message = dataset.remove_duplicates(params.get('target_columns'))
            elif action_type == 'find_replace':
                success, message = dataset.find_and_replace(
                    params.get('find'), params.get('replace'), 
                    params.get('target_columns'), params.get('exact_match', False)
                )
            else:
                raise ValueError(f"Unknown preparation action: {action_type}")
            
            return {'status': 'success' if success else 'error', 'message': message}
            
        except Exception as e:
            logger.error(f"Data Prep Error: {e}")
            raise e

    # ==========================================
    # 3. TEKS ANALISIS (STYLE DNA & METRICS)
    # ==========================================
    @staticmethod
    def analyze_text_comprehensive(text: str) -> Dict[str, Any]:
        """
        Menganalisis kualitas teks: Readability, Tone, dan Struktur.
        Digunakan untuk fitur 'Style DNA' atau 'Document Check'.
        """
        if not text or len(text.strip()) < 5:
            return {
                "status": "empty",
                "message": "Teks terlalu pendek untuk dianalisis."
            }

        # Analisis Metrik Dasar
        word_count = len(re.findall(r'\w+', text))
        readability = AnalysisService._calculate_readability(text)
        tone_data = AnalysisService._analyze_tone(text)

        # Basic Suggestions Logic
        suggestions = []
        sentences = re.split(r'[.!?]+', text)
        long_sentences = [s for s in sentences if len(s.split()) > 35] # Standar akademis biasanya max 25-30
        
        if long_sentences:
            suggestions.append({
                "type": "clarity",
                "severity": "medium",
                "text": f"Ditemukan {len(long_sentences)} kalimat yang sangat panjang (>35 kata).",
                "context": long_sentences[0].strip()[:60] + "..."
            })
        
        if tone_data['formality'] < 40 and word_count > 100:
             suggestions.append({
                "type": "tone",
                "severity": "info",
                "text": "Gaya penulisan terdeteksi santai. Untuk skripsi, gunakan bahasa yang lebih baku/formal.",
                "context": "Skor Formalitas: Rendah"
            })

        return {
            "status": "success",
            "meta": {
                "word_count": word_count,
                "estimated_read_time": f"{max(1, word_count // 200)} menit"
            },
            "metrics": {
                "readability": readability,
                "tone": tone_data,
                "structure": {"paragraph_count": text.count('\n\n') + 1}
            },
            "suggestions": suggestions
        }

    @staticmethod
    def _calculate_readability(text: str) -> Dict[str, Any]:
        """Menghitung skor keterbacaan (Algorithm Simple Flesch Proxy)."""
        if not text: return {"score": 0, "level": "N/A"}
        
        sentences = [s for s in re.split(r'[.!?]+', text) if s.strip()]
        words = re.findall(r'\w+', text)
        
        num_sentences = len(sentences) or 1
        num_words = len(words) or 1
        avg_wps = num_words / num_sentences # Words per Sentence
        
        # Formula sederhana: 100 - (AvgWordsPerSentence * 1.5)
        # Makin panjang kalimat, makin rendah skor (makin sulit)
        score = max(0, min(100, 100 - (avg_wps * 1.5)))
        
        level = "Sulit Dipahami"
        if score > 80: level = "Sangat Mudah"
        elif score > 60: level = "Mudah"
        elif score > 40: level = "Sedang (Standar)"
        elif score > 20: level = "Agak Sulit"
        
        return {"score": round(score, 1), "level": level}

    @staticmethod
    def _analyze_tone(text: str) -> Dict[str, float]:
        """Analisis tone sederhana berbasis keyword matching."""
        text_lower = text.lower()
        
        # Keyword indikator (bisa diperluas atau diganti AI di masa depan)
        formal_indicators = ['oleh karena itu', 'namun', 'selanjutnya', 'berdasarkan', 'signifikan', 'analisis', 'penelitian']
        casual_indicators = ['gimana', 'nggak', 'bikin', 'kayak', 'banget', 'sih', 'dong']
        
        formal_count = sum(1 for w in formal_indicators if w in text_lower)
        casual_count = sum(1 for w in casual_indicators if w in text_lower)
        
        total_markers = formal_count + casual_count or 1
        
        # Skor Formalitas (0 - 100)
        # Jika tidak ada marker, default ke 70 (asumsi netral cenderung formal)
        if formal_count == 0 and casual_count == 0:
            formality_score = 70.0 
        else:
            formality_score = (formal_count / total_markers) * 100

        return {
            "formality": round(formality_score, 1),
            "positivity": 75.0 # Placeholder (bisa integrasi library SentimentAnalysis jika perlu)
        }

    # ==========================================
    # 4. HELPER: AI NARRATIVE ENRICHMENT
    # ==========================================
    @staticmethod
    def _enrich_with_ai_context(result: Union[Dict, List], analysis_type: str) -> Dict[str, Any]:
        """
        Menerjemahkan hasil statistik mentah menjadi 'Hint Narasi' yang mudah dipahami AI Writer.
        Menambahkan key 'ai_narrative_summary' ke dalam result.
        """
        # Normalisasi input list (misal hasil normality test yg berupa array)
        if isinstance(result, list):
            result = {'details': result}
        
        # Safety check: pastikan result adalah dict agar bisa di-inject
        if not isinstance(result, dict):
            return result 

        try:
            narrative_hints = []
            
            # Helper aman ambil nilai signifikansi
            def get_sig(data):
                return data.get('sig') or data.get('sig_2tailed') or data.get('p_value') or data.get('significance')

            # --- LOGIC PER TIPE ANALISIS ---

            if analysis_type == 'correlation-analysis':
                matrix = result.get('matrix', result)
                max_r, pair = 0, ""
                if isinstance(matrix, dict):
                    for v1, row in matrix.items():
                        if not isinstance(row, dict): continue
                        for v2, cell in row.items():
                            if v1 == v2: continue
                            r_val = abs(float(cell.get('r', 0)))
                            if r_val > max_r:
                                max_r, pair = r_val, f"{v1} & {v2}"
                    if max_r > 0:
                        strength = "Sangat Kuat" if max_r > 0.8 else "Kuat" if max_r > 0.6 else "Sedang"
                        narrative_hints.append(f"Korelasi terkuat: {pair} (r={max_r:.3f}, {strength}).")

            elif analysis_type in ['oneway-anova', 'kruskal-wallis']:
                sig = get_sig(result)
                f_val = result.get('f_value') or result.get('H_stat')
                if sig is not None:
                    status = "Signifikan" if float(sig) < 0.05 else "Tidak Signifikan"
                    narrative_hints.append(f"Uji Beda {status} (Sig={float(sig):.3f}).")

            elif analysis_type == 'descriptive-analysis':
                # Cari variabel dengan mean tertinggi/terendah
                stats_items = {k: v for k, v in result.items() if isinstance(v, dict) and 'stats' in v}
                if stats_items:
                    sorted_vars = sorted(stats_items.items(), key=lambda x: x[1]['stats'].get('mean', 0), reverse=True)
                    top = sorted_vars[0]
                    narrative_hints.append(f"Variabel dengan rata-rata tertinggi adalah {top[0]} (Mean={top[1]['stats'].get('mean', 0):.2f}).")

            elif analysis_type == 'linear-regression':
                r_sq = result.get('r_square')
                sig_f = result.get('sig_f')
                if r_sq:
                    narrative_hints.append(f"Kemampuan model (R-Square): {float(r_sq)*100:.1f}%.")
                if sig_f:
                    status = "Berpengaruh Signifikan" if float(sig_f) < 0.05 else "Tidak Berpengaruh"
                    narrative_hints.append(f"Uji Simultan: {status} (Sig. F={float(sig_f):.3f}).")

            elif analysis_type == 'reliability':
                alpha = result.get('cronbach_alpha')
                if alpha:
                    status = "Reliabel" if float(alpha) > 0.6 else "Tidak Reliabel"
                    narrative_hints.append(f"Cronbach Alpha = {float(alpha):.3f} ({status}).")

            # --- GENERIC FALLBACK (T-Test, etc) ---
            if not narrative_hints:
                sig = get_sig(result)
                # Coba cari di details (untuk list results)
                if sig is None and 'details' in result and isinstance(result['details'], list) and result['details']:
                    sig = get_sig(result['details'][0])
                
                if sig is not None:
                    s_val = float(sig)
                    res_text = "Hipotesis Diterima" if s_val < 0.05 else "Hipotesis Ditolak"
                    narrative_hints.append(f"Hasil Uji: {res_text} (Sig. {s_val:.3f}).")

            # Finalisasi Summary
            summary_text = " ".join(narrative_hints) if narrative_hints else "Analisis berhasil dijalankan."
            result['ai_narrative_summary'] = summary_text
            
            return result

        except Exception as e:
            logger.warning(f"Failed to generate AI narrative: {e}")
            # Kembalikan result asli jika error, jangan sampai crash seluruh flow
            if isinstance(result, dict):
                result['ai_narrative_summary'] = "Ringkasan otomatis tidak tersedia."
            return result