# app/services/rag_service.py

import os
import json
import logging
import re
import numpy as np
from typing import List, Dict

# Library PDF
try:
    from pypdf import PdfReader
except ImportError:
    logging.warning("Library pypdf belum terinstall. Install dengan 'pip install pypdf'")

# --- [UPGRADE] Semantic Core ---
try:
    from sentence_transformers import SentenceTransformer
    # Load model kecil tapi powerful (all-MiniLM-L6-v2)
    # Model ini akan didownload otomatis saat pertama kali run (~80MB)
    embedder = SentenceTransformer('all-MiniLM-L6-v2')
    HAS_SEMANTIC = True
    logging.info("✅ Semantic Engine (Sentence-Transformers) Berhasil Dimuat.")
except ImportError:
    embedder = None
    HAS_SEMANTIC = False
    logging.warning("⚠️ Sentence-Transformers tidak ditemukan. Mode Semantic non-aktif. Install dengan 'pip install sentence-transformers'")

class LiteContextEngine:
    """
    Versi 'Pro' untuk RAG Engine.
    Menggunakan Hybrid Search:
    1. Semantic Search (Vektor) -> Memahami makna (Dampak Finansial ≈ Kerugian Ekonomi).
    2. Fallback ke Keyword Matching jika model gagal load.
    """
    
    def __init__(self, storage_path="instance/vector_store"):
        self.storage_path = storage_path
        if not os.path.exists(self.storage_path):
            os.makedirs(self.storage_path)

    def _get_embedding(self, text: str):
        """Mengubah teks menjadi vektor angka (List of Floats)."""
        if HAS_SEMANTIC and embedder:
            # Generate embedding (384 dimensi)
            return embedder.encode(text, convert_to_numpy=True).tolist()
        return []

    def _cosine_similarity(self, vec_a, vec_b):
        """Menghitung kemiripan sudut antara dua vektor."""
        if not vec_a or not vec_b:
            return 0.0
        
        a = np.array(vec_a)
        b = np.array(vec_b)
        
        # Rumus Cosine Similarity: (A . B) / (||A|| * ||B||)
        dot_product = np.dot(a, b)
        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)
        
        if norm_a == 0 or norm_b == 0:
            return 0.0
            
        return dot_product / (norm_a * norm_b)

    def process_document(self, file_path: str, doc_id: str, user_id: str):
        """
        Membaca PDF, memecahnya jadi chunks, DAN menghitung vektornya.
        """
        try:
            reader = PdfReader(file_path)
            chunks = []
            
            # 1. Ekstrak Teks per Halaman
            full_text = ""
            for page in reader.pages:
                text = page.extract_text()
                if text:
                    full_text += text + "\n"
            
            # 2. Smart Chunking (Per Paragraph / Newlines)
            # Memecah berdasarkan double enter agar konteks per paragraf terjaga
            raw_parts = re.split(r'\n\s*\n', full_text)
            
            for part in raw_parts:
                cleaned_text = part.strip()
                # Filter chunk yang terlalu pendek (sampah header/footer)
                if len(cleaned_text) > 50: 
                    
                    # [CORE UPGRADE] Hitung Vektor di sini!
                    vector = self._get_embedding(cleaned_text)
                    
                    chunks.append({
                        "content": cleaned_text,
                        "vector": vector, # Simpan vektor ke JSON
                        "source": os.path.basename(file_path),
                        "doc_id": doc_id,
                        "user_id": user_id
                    })

            # 3. Simpan ke JSON (Sebagai "Vector Database" sederhana)
            storage_file = os.path.join(self.storage_path, f"{user_id}_{doc_id}.json")
            with open(storage_file, 'w', encoding='utf-8') as f:
                json.dump(chunks, f)
            
            return {"status": "success", "chunks_count": len(chunks)}

        except Exception as e:
            logging.error(f"Error processing document: {e}")
            return {"status": "error", "message": str(e)}

    def search_context(self, query: str, user_id: str, k: int = 4) -> List[Dict]:
        """
        Mencari potongan teks paling relevan menggunakan Semantic Search.
        """
        try:
            # 1. Load semua file JSON user
            all_chunks = []
            user_files = [f for f in os.listdir(self.storage_path) if f.startswith(f"{user_id}_")]
            
            if not user_files:
                return []
            
            for filename in user_files:
                try:
                    with open(os.path.join(self.storage_path, filename), 'r') as f:
                        file_chunks = json.load(f)
                        all_chunks.extend(file_chunks)
                except Exception as load_err:
                    logging.error(f"Gagal load chunk {filename}: {load_err}")
                    continue

            if not all_chunks:
                return []

            scored_chunks = []

            # --- MODE 1: SEMANTIC SEARCH (Priority) ---
            if HAS_SEMANTIC and embedder:
                query_vector = self._get_embedding(query)
                
                for chunk in all_chunks:
                    # Pastikan chunk punya vektor (support backward compatibility file lama)
                    if 'vector' in chunk and chunk['vector']:
                        score = self._cosine_similarity(query_vector, chunk['vector'])
                        # Threshold relevansi (0.25 biasanya cukup untuk semantic)
                        if score > 0.25:
                            scored_chunks.append((score, chunk))
                    else:
                        # Fallback jika file lama belum divektorisasi
                        pass 

            # --- MODE 2: KEYWORD FALLBACK (Jika Semantic gagal/kosong) ---
            # Jika hasil semantic sedikit, kita bisa mix dengan keyword match sederhana
            if len(scored_chunks) < k:
                query_words = set(query.lower().split())
                for chunk in all_chunks:
                    # Cek overlap kata
                    chunk_words = set(chunk['content'].lower().split())
                    intersect = query_words.intersection(chunk_words)
                    score = len(intersect) / len(query_words) if query_words else 0
                    
                    # Tambahkan jika relevan dan belum ada di list
                    if score > 0.1:
                        # Cek duplikasi konten agar tidak dobel
                        if not any(c['content'] == chunk['content'] for s, c in scored_chunks):
                            scored_chunks.append((score * 0.5, chunk)) # Penalty score untuk keyword match

            # 3. Urutkan & Ambil Top-K
            scored_chunks.sort(key=lambda x: x[0], reverse=True)
            
            # Return hanya kontennya saja (bersihkan field vector biar ringan dikirim balik)
            results = []
            for score, chunk in scored_chunks[:k]:
                clean_chunk = chunk.copy()
                if 'vector' in clean_chunk: 
                    del clean_chunk['vector'] # Hapus vektor sebelum return
                results.append(clean_chunk)
                
            return results

        except Exception as e:
            logging.error(f"Error searching context: {e}")
            return []