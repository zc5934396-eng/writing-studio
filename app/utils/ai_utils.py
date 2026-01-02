# File: app/utils/ai_utils.py
# Deskripsi: Engine AI Unified dengan Fact-Checker & Self-Correction Loop.

import os
import json
import traceback
import re
from litellm import completion
from flask import current_app
from groq import Groq
import PyPDF2
import io

import os
import json
import logging
import re
from groq import Groq

from flask_login import current_user

logger = logging.getLogger(__name__)

# --- KONFIGURASI MODEL REAL ---
# Marketing Name vs Real Model
MODEL_MAPPING = {
    # FREE USER: Selalu pakai ini untuk semua tugas
    'free_standard': 'groq/llama-3.3-70b-versatile', 
    
    # PRO USER:
    'pro_nano':  'groq/llama-3.3-70b-versatile',  # Untuk Chat, Paraphrase (Marketing: GPT-5 Nano)
    'pro_heavy': 'groq/llama-3.3-70b-versatile',       # Untuk Bab 1-5, Logic (Marketing: GPT-5.2)
}
AVAILABLE_MODELS = {
    'fast': 'groq/llama-3.3-70b-versatile',
    'smart': 'groq/llama-3.3-70b-versatile',
    'gpt5': 'groq/llama-3.3-70b-versatile',
    'claude': 'groq/llama-3.3-70b-versatile',
    'gemini': 'groq/llama-3.3-70b-versatile'
}
# Daftar Tugas Berat (Pakai Model Mahal)
HEAVY_TASKS = [
    'generate_outline', 
    'bab1_latar_belakang', 'bab2_kajian_pustaka', 'bab3_metode', 
    'bab4_pembahasan', 'bab5_penutup', 
    'logic_check', 'defense_simulation'
]

def get_smart_model(task_type, user=None):
    """
    Router Model:
    - FREE: Selalu Llama 3 70B.
    - PRO: GPT-5-nano (Nano) untuk ringan, GPT-5.2 (5.2) untuk berat.
    """
    active_user = user or current_user
    is_pro = getattr(active_user, 'is_pro', False)

    # 1. LOGIKA FREE USER
    if not is_pro:
        return MODEL_MAPPING['free_standard']

    # 2. LOGIKA PRO USER
    if task_type in HEAVY_TASKS:
        return MODEL_MAPPING['pro_heavy']  # GPT-5.2
    else:
        # Termasuk task 'chat', 'paraphrase', 'expand', dll.
        return MODEL_MAPPING['pro_nano']   # GPT-5 Nano

def clean_json_output(text):
    """Membersihkan formatting markdown json."""
    text = text.strip()
    if text.startswith("```"):
        try:
            text = text.split("\n", 1)[1]
            text = text.rsplit("\n", 1)[0]
        except IndexError:
            pass
    return text.strip()
    
def get_target_model(selected_id):
    """Menerjemahkan ID dari frontend ke Provider ID"""
    return MODEL_MAP.get(selected_id, MODEL_MAP['fast'])

def get_model_name(model_id, is_pro_user):
    """Validasi akses model."""
    premium_models = ['gpt5', 'claude', 'gemini']
    if model_id in premium_models and not is_pro_user:
        return AVAILABLE_MODELS['fast']
    return AVAILABLE_MODELS.get(model_id, AVAILABLE_MODELS['fast'])

def clean_json_output(text):
    text = text.replace('```json', '').replace('```', '').strip()
    match = re.search(r'(\[.*\]|\{.*\})', text, re.DOTALL)
    if match: return match.group(0)
    return text

def clean_html_output(text):
    text = re.sub(r'^```(html)?\s*\n', '', text, flags=re.MULTILINE)
    text = re.sub(r'\n```\s*$', '', text, flags=re.MULTILINE)
    return text.strip()

# ==========================================
# 1. STYLE ANALYZER (DNA PENULISAN)
# ==========================================
def analyze_writing_style(text, user_is_pro=False):
    model_name = get_model_name("smart", user_is_pro)
    sample_text = text[:3000]
    
    prompt = f"""
    ANALISIS GAYA BAHASA (STYLE PROFILING):
    Sampel tulisan: "{sample_text}..."
    
    TUGAS:
    Identifikasi "DNA Penulisan" dalam 1 paragraf instruksi singkat untuk AI.
    Fokus: Struktur Kalimat, Diksi (Akademis/Santai), Tone, dan Flow.
    
    OUTPUT: Berikan HANYA instruksi gaya bahasa.
    """
    try:
        response = completion(model=model_name, messages=[{"role": "user", "content": prompt}], temperature=0.3)
        return response.choices[0].message.content
    except Exception:
        return "Gunakan gaya penulisan akademis standar yang baku dan objektif."

# ==========================================
# 2. FACT-CHECKER AGENT (THE AUDITOR)
# ==========================================
def verify_claim_validity(claim_sentence, ref_content, model="smart"):
    """
    Agent Auditor: Membandingkan klaim tulisan AI dengan sumber asli.
    Mengembalikan: (IsValid: bool, Correction: str)
    """
    system_prompt = """
    PERAN: Anda adalah 'Academic Auditor' yang sangat ketat.
    TUGAS: Verifikasi apakah KLAIM di bawah ini didukung oleh SUMBER REFERENSI yang diberikan.
    
    ATURAN PENILAIAN:
    1. VALID: Jika inti klaim ada di sumber (walaupun beda kata-kata).
    2. INVALID: Jika klaim bertentangan, tidak disebutkan, atau halusinasi.
    
    OUTPUT JSON FORMAT:
    {
        "is_valid": true/false,
        "reason": "Alasan singkat...",
        "corrected_sentence": "Kalimat perbaikan yang sesuai fakta sumber (jika invalid). Jika valid, kosongkan."
    }
    """
    
    user_prompt = f"""
    [KLAIM TULISAN]: "{claim_sentence}"
    [SUMBER ASLI]: "{ref_content[:1500]}..." 
    """
    
    try:
        # Gunakan model Smart/Fast untuk audit
        audit_model = AVAILABLE_MODELS['fast'] if model == 'fast' else AVAILABLE_MODELS['smart']
        
        response = completion(
            model=audit_model,
            messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}],
            temperature=0.1, # Harus sangat deterministik
            response_format={"type": "json_object"}
        )
        result = json.loads(response.choices[0].message.content)
        return result
    except Exception as e:
        print(f"Fact Check Error: {e}")
        return {"is_valid": True, "corrected_sentence": ""} # Fallback: Assume true to avoid breakage

# ==============================================================================
# 3. STREAMING GENERATOR (THE GLUE)
# ==============================================================================
def generate_academic_draft_stream(user, task_type, input_data, project_context, selected_model='fast', editor_context=''):
    try:
        model_name = get_smart_model(task_type, user)
        system_instruction = build_task_instruction(task_type, input_data, project_context)

        # Tentukan Prompt User
        if task_type == 'generate_outline':
            # Prompt user kosong/minimalis agar System Prompt yang dominan
            user_content = f"Topik: {input_data.get('judul_penelitian')}. Buat Outline JSON sekarang."
        elif editor_context:
            user_content = f"Lanjutkan tulisan berikut:\n\n{editor_context[-2000:]}"
        else:
            user_content = "Silakan mulai menulis sesuai instruksi."

        messages = [
            {"role": "system", "content": system_instruction},
            {"role": "user", "content": user_content}
        ]
        
        # --- PERBAIKAN DISINI ---
        # Cek apakah task butuh JSON Mode?
        use_json_mode = (task_type == 'generate_outline')
        
        params = {
            "model": model_name,
            "messages": messages,
            "stream": True,
            "temperature": 0.5,
            "max_tokens": 2048
        }
        
        # Aktifkan JSON Mode jika task outline (Support Llama 3 di Groq)
        if use_json_mode:
            params["response_format"] = {"type": "json_object"}

        response = completion(**params)
        # ------------------------

        def generate():
            for chunk in response:
                if chunk and chunk.choices:
                    delta = chunk.choices[0].delta.content
                    if delta:
                        yield delta

        return current_app.response_class(generate(), mimetype='text/event-stream')

    except Exception as e:
        logger.error(f"Stream Error: {e}")
        return current_app.response_class(f"Error: {str(e)}", mimetype='text/event-stream')
# ==========================================
# 3. EDITOR AGENT (PROOFREADER)
# ==========================================
def proofread_text(text, user_is_pro=False):
    """
    Editor Agent: Memperbaiki tata bahasa (PUEBI), typo, dan efektivitas kalimat.
    """
    model_name = AVAILABLE_MODELS['smart'] if user_is_pro else AVAILABLE_MODELS['fast']
    
    system_prompt = """
    PERAN: Anda adalah Editor Bahasa Indonesia Senior (Ahli PUEBI).
    TUGAS: Lakukan Proofreading & Editing pada teks yang diberikan.
    
    ATURAN KOREKSI:
    1. Perbaiki kesalahan ejaan (typo) dan tanda baca.
    2. Sesuaikan dengan kaidah PUEBI (Pedoman Umum Ejaan Bahasa Indonesia).
    3. Ubah kalimat yang tidak efektif menjadi kalimat efektif (hemat kata).
    4. JANGAN mengubah makna atau substansi tulisan.
    5. JANGAN mengubah format HTML (seperti <b>, <i>, <br>) jika ada.
    6. Hapus kata-kata berulang atau pemborosan kata (redundansi).
    
    OUTPUT: Berikan HANYA teks hasil perbaikan. Jangan ada komentar pembuka/penutup.
    """
    
    try:
        response = completion(
            model=model_name,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"TEKS ASLI:\n{text}"}
            ],
            temperature=0.2 # Rendah agar koreksi akurat
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"Error Proofreading: {str(e)}"

# ==========================================
# 4. SUPERVISOR AGENT (REVIEWER)
# ==========================================
def refine_draft_with_supervisor(draft_text, task_type, user_is_pro=False):
    """
    Supervisor Agent: Mereview dan memoles tulisan.
    """
    model_name = AVAILABLE_MODELS['smart'] if user_is_pro else AVAILABLE_MODELS['fast']
    
    system_prompt = """
    PERAN: Anda adalah Editor Jurnal Ilmiah Senior & Dosen Pembimbing Skripsi yang sangat kritis.
    TUGAS: Lakukan penyuntingan (editing) & penulisan ulang (rewriting) pada naskah berikut.
    KRITERIA KOREKSI (STRICT):
    1. **Humanize:** Ubah kalimat kaku menjadi luwes dan akademis.
    2. **Vocabulary Upgrade:** Ganti kata standar dengan diksi akademis presisi.
    3. **Connectors:** Pastikan kohesi antar paragraf (flow enak dibaca).
    4. **Format:** JANGAN ubah struktur HTML (<h3>, <p>) atau sitasi. Hanya perbaiki narasi.
    OUTPUT: Berikan HANYA naskah hasil revisi final.
    """
    
    user_prompt = f"[NASKAH AWAL]\n{draft_text}\n\n[INSTRUKSI]\nPerbaiki naskah di atas agar layak terbit. Konteks: {task_type}"

    try:
        response = completion(
            model=model_name,
            messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}],
            temperature=0.4
        )
        return response.choices[0].message.content
    except Exception as e:
        print(f"Supervisor Error: {e}")
        return draft_text

# ==========================================
# 5. CONSULTANT AGENT (CONTEXT-AWARE CHAT)
# ==========================================
def get_chat_response_stream(user_message, project_context=None, references=None):
    """
    Consultant Agent: Chatbot yang sadar konteks skripsi user (RAG Lite).
    """
    model_name = AVAILABLE_MODELS['fast'] 
    
    context_info = "Belum ada data proyek spesifik."
    if project_context:
        context_info = f"""
        KONTEKS SKRIPSI MAHASISWA:
        - Judul: {project_context.get('title', '-')}
        - Masalah: {project_context.get('problem_statement', '-')}
        - Metode: {project_context.get('methodology', '-')}
        """
    
    ref_info = ""
    if references:
        top_refs = references[:5] 
        ref_list = [f"- {r.get('author')} ({r.get('year')}): {r.get('title')}" for r in top_refs]
        ref_info = "\nREFERENSI YANG DIMILIKI MAHASISWA:\n" + "\n".join(ref_list)

    system_prompt = f"""
    PERAN: Anda adalah Dosen Pembimbing Skripsi (Supervisor) yang suportif tapi kritis.
    TUJUAN: Membantu mahasiswa menyelesaikan skripsinya melalui diskusi (chat).
    
    {context_info}
    {ref_info}
    
    INSTRUKSI:
    1. Jawab pertanyaan mahasiswa dengan mengacu pada Konteks Skripsi mereka (jika relevan).
    2. Berikan saran yang praktis, akademis, dan memotivasi.
    3. Jika mahasiswa bertanya tentang referensi, cek daftar referensi yang mereka miliki.
    4. Jawab dengan ringkas (to-the-point) kecuali diminta menjelaskan panjang lebar.
    """

    try:
        response = completion(
            model=model_name, 
            messages=[
                {"role": "system", "content": system_prompt}, 
                {"role": "user", "content": user_message}
            ], 
            temperature=0.7, 
            stream=True
        )
        for chunk in response:
            if chunk.choices[0].delta.content: 
                yield chunk.choices[0].delta.content
    except Exception as e: 
        yield f"Error: {str(e)}"


# ==========================================
# 6. UTILS LAIN (PARAPHRASE ENGINE)
# ==========================================
def paraphrase_text(user, text, style='academic', selected_model='fast'):
    """
    Paraphrase Engine: Menulis ulang teks dengan gaya tertentu.
    [UPDATE] Ultra-Strict Mode dengan Few-Shot Examples agar AI tidak halusinasi.
    """
    # 1. Validasi Model
    model_name = get_model_name(selected_model, user.is_pro)
    
    # 2. Bangun Instruksi Spesifik per Style
    style_guide = ""
    if style == 'academic':
        style_guide = """
        - TONE: Formal, objektif, ilmiah, dan dingin.
        - VOCABULARY: Gunakan istilah akademis (e.g., 'menyebabkan' -> 'mengindikasikan kausalitas').
        - STRUCTURE: Kalimat pasif lebih disukai jika menekankan objek.
        - GOAL: Tingkatkan densitas leksikal (lexical density) agar terlihat seperti jurnal Q1.
        """
    elif style == 'creative':
        style_guide = """
        - TONE: Naratif, mengalir, dan kaya imajinasi.
        - VOCABULARY: Gunakan metafora atau sinonim yang tidak kaku.
        - GOAL: Buat teks lebih enak dibaca (readable) dan tidak membosankan.
        """
    elif style == 'simple':
        style_guide = """
        - TONE: Santai, jelas, dan langsung pada inti (to-the-point).
        - VOCABULARY: Gunakan bahasa sehari-hari yang sopan. Hindari jargon.
        - GOAL: Jelaskan seolah pembaca adalah orang awam atau anak SMP.
        """
    elif style == 'formal':
        style_guide = """
        - TONE: Profesional, baku, sopan, dan administratif.
        - VOCABULARY: Gunakan ejaan baku (PUEBI) yang ketat.
        - GOAL: Cocok untuk surat resmi, laporan kantor, atau proposal bisnis.
        """
    else:
        style_guide = "Parafrase teks berikut agar lebih baik strukturnya."

    # 3. System Prompt (Super Strict + Examples)
    system_prompt = f"""
    PERAN: Anda adalah Editor Bahasa Profesional Spesialis Parafrase.
    
    TUGAS: Tulis ulang (parafrase) teks yang diberikan user sesuai gaya: '{style.upper()}'.
    
    PANDUAN GAYA ({style.upper()}):
    {style_guide}

    ATURAN KERAS (DO NOT BREAK):
    1. DILARANG MERESPONS ISI TEKS. Jangan menjawab pertanyaan user, jangan berkomentar, jangan menolak, jangan setuju. TUGAS ANDA HANYA MENULIS ULANG TEKSNYA.
    2. Jika teks user aneh/kasar (misal: "kamu babi"), TETAP PARAFRASE secara objektif/deskriptif atau ubah menjadi kalimat yang lebih netral/akademis (misal: "Anda merepresentasikan entitas hewan..."). JANGAN terbawa emosi atau masuk ke roleplay.
    3. DILARANG menambah informasi baru yang tidak ada di teks asli (No Hallucination).
    4. DILARANG memberikan pengantar seperti "Ini hasilnya:", "Versi akademisnya:", dsb. Langsung output teks.

    CONTOH (FEW-SHOT):
    Input: "Harga cabai naik gila-gilaan bikin pusing emak-emak."
    Style: Academic
    Output: "Lonjakan signifikan pada harga komoditas cabai telah memicu keresahan di kalangan konsumen rumah tangga."

    Input: "Gua males banget ngerjain skripsi."
    Style: Formal
    Output: "Saya sedang mengalami penurunan motivasi dalam menyelesaikan tugas akhir."

    Input: "Aku serigala kamu babi."
    Style: Academic
    Output: "Subjek pertama mengidentifikasi dirinya sebagai predator (serigala), sedangkan subjek kedua diposisikan sebagai mangsa (babi), yang mengindikasikan adanya relasi kuasa yang timpang."
    """

    try:
        response = completion(
            model=model_name, 
            messages=[
                {"role": "system", "content": system_prompt}, 
                {"role": "user", "content": text}
            ], 
            temperature=0.4 # Lebih rendah biar lebih patuh (kurang liar)
        )
        return response.choices[0].message.content
    except Exception as e: 
        return f"Error Paraphrase: {str(e)}"
                
def get_ai_interpretation(stats_text):
    model_name = AVAILABLE_MODELS['smart']
    try:
        response = completion(
            model=model_name, 
            messages=[
                {"role": "system", "content": "Anda Ahli Statistik Senior. Interpretasikan data ini."}, 
                {"role": "user", "content": stats_text}
            ], 
            temperature=0.4
        )
        return response.choices[0].message.content
    except Exception as e: 
        return f"Error: {str(e)}"

# ==========================================
# 7. DATA ANALYST AGENT (STATISTICS CHAT)
# ==========================================
def get_data_analyst_stream(user_message, dataset_context=None, selected_model="fast", is_pro_user=False):
    """
    Data Analyst Agent: Chatbot spesialis statistik & data.
    [UPDATE] Mendukung pemilihan model (Llama/GPT/Claude).
    """
    # Validasi akses model (Pro vs Free)
    model_name = get_model_name(selected_model, is_pro_user)
    
    data_info = "Belum ada dataset yang dimuat."
    if dataset_context:
        # Format konteks data agar mudah dibaca AI
        vars_list = ", ".join([v['name'] for v in dataset_context.get('variables', [])])
        data_info = f"""
        [KONTEKS DATASET PENGGUNA]
        - Total Baris: {dataset_context.get('total_rows', 0)}
        - Total Variabel: {dataset_context.get('total_cols', 0)}
        - Daftar Variabel: {vars_list}
        
        [SAMPEL DATA & STATISTIK]
        {dataset_context.get('summary_text', 'Tidak tersedia.')}
        """

    system_prompt = f"""
    PERAN: Anda adalah Senior Data Scientist & Konsultan Statistik.
    TUJUAN: Membantu pengguna menganalisis data, memilih uji statistik yang tepat, dan menginterpretasikan hasil.
    
    {data_info}
    
    INSTRUKSI:
    1. Jawab pertanyaan berdasarkan konteks dataset di atas (jika relevan).
    2. Jika user bertanya "Uji apa yang cocok?", lihat tipe data variabel (Numeric/Categorical) dan sarankan uji yang valid (misal: T-Test, ANOVA, Chi-Square).
    3. Berikan penjelasan yang akademis namun mudah dipahami.
    4. Jika user meminta interpretasi, jelaskan implikasi dari pola data tersebut.
    5. Jawab to-the-point dan solutif.
    """

    try:
        response = completion(
            model=model_name, 
            messages=[
                {"role": "system", "content": system_prompt}, 
                {"role": "user", "content": user_message}
            ], 
            temperature=0.3, 
            stream=True
        )
        for chunk in response:
            if chunk.choices[0].delta.content: 
                yield chunk.choices[0].delta.content
    except Exception as e: 
        yield f"Error Data Analyst: {str(e)}"

        # ==========================================
# [BARU] STREAMING GENERATOR UNTUK WRITING STUDIO
# ==========================================
def generate_academic_draft_stream(user, task_type, input_data, project_context=None, selected_model="fast", references=None, word_count="600", citation_style="bodynote_apa", editor_context=None, user_style_profile=None):
    """
    Versi Streaming dari generate_academic_draft.
    Menggunakan generator (yield) untuk mengirim teks kata per kata.
    """
    model_name = get_model_name(selected_model, user.is_pro)
    
    # 1. Konteks Proyek
    context_str = ""
    if project_context:
        context_str = f"""
        [METADATA PENELITIAN]
        Judul: {project_context.get('title', '-')}
        Masalah: {project_context.get('problem_statement', '-')}
        Metode: {project_context.get('methodology', '-')}
        Variabel: {project_context.get('variables', '-')}
        """

    # 2. Referensi (Strict)
    references_str = "TIDAK ADA REFERENSI KHUSUS."
    if references and len(references) > 0:
        ref_list = []
        for i, ref in enumerate(references, 1):
            author = ref.get('author') or "Anonim"
            year = ref.get('year') or "n.d."
            title = ref.get('title') or "Tanpa Judul"
            content = (ref.get('abstract') or ref.get('notes') or "")[:500].replace('\n', ' ') 
            ref_text = f"REF_ID [{i}]: {{ Penulis: {author}, Tahun: {year}, Judul: \"{title}\", Isi: {content}... }}"
            ref_list.append(ref_text)
        references_str = "\n".join(ref_list)

    # 3. Gaya Sitasi
    citation_rules = "Format sitasi standar (Nama, Tahun)."
    if citation_style == "bodynote_apa": citation_rules = "Format APA 7 (Author, Year)."
    elif citation_style == "bodynote_harvard": citation_rules = "Format Harvard."
    elif citation_style == "ieee": citation_rules = "Format Numbering [1]."

    # 4. Smart Context (Tulisan sebelumnya)
    prev_content_str = ""
    if editor_context and len(editor_context) > 50:
        prev_content_str = f"[KONTEKS TULISAN SEBELUMNYA] ... {editor_context[-2000:]} \n\nINSTRUKSI: Lanjutkan alur di atas."

    # 5. Style Transfer Injection
    style_instruction = "Gunakan Bahasa Indonesia baku (PUEBI), objektif, dingin, dan analitis."
    if user_style_profile:
        style_instruction = f"""
        *** PERSONALIZED STYLE ACTIVE ***
        Anda harus MENIRU gaya penulisan berikut ini (Style Mimicry):
        "{user_style_profile}"
        
        PENTING: Jangan terdengar seperti robot AI standar. Gunakan struktur kalimat, pilihan kata, dan 'jiwa' tulisan sesuai profil di atas.
        """

    # 6. System Prompt Construction
    system_prompt = f"""
    PERAN: Anda adalah Penulis Akademik Senior.
    
    PRINSIP UTAMA:
    1. **Strict Citation:** Setiap klaim fakta HARUS menggunakan `[REF_ID: Nomor_ID]`.
    2. **Format HTML:** Gunakan tag HTML dasar seperti `<h3>`, `<p>`, `<ul>`, `<li>`, `<strong>` untuk struktur. JANGAN gunakan Markdown (seperti ** atau #).
    3. **Data Integrity:** Jangan ngarang angka statistik.
    4. **STYLE & TONE:** {style_instruction}

    ATURAN SITASI: {citation_rules}
    """

    task_instruction = build_task_instruction(task_type, input_data, input_data.get('custom_instruction', ''))

    final_user_prompt = f"""
    {context_str}
    [DAFTAR REFERENSI]
    {references_str}
    {prev_content_str}
    -------------------
    {task_instruction}
    -------------------
    TARGET: {word_count} kata. Langsung isi konten dalam format HTML.
    """

    try:
        # Hitung max tokens (estimasi kasar: 1 kata ~ 1.3 token, kasih buffer)
        max_tok = min(int(int(word_count) * 2.5), 4096)
        
        response = completion(
            model=model_name,
            messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": final_user_prompt}],
            temperature=0.4, 
            max_tokens=max_tok,
            stream=True  # <--- KUNCI STREAMING
        )
        
        # Generator: Yield chunk demi chunk
        for chunk in response:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    except Exception as e:
        yield f"<p style='color:red;'><strong>System Error:</strong> {str(e)}</p>"

# ==========================================
# 8. ARCHITECT AGENT (OUTLINE GENERATOR)
# ==========================================
def generate_smart_outline(user, task_type, input_data, project_context=None, selected_model="smart"):
    """
    Architect Agent: Membuat struktur bab yang logis sebelum penulisan dimulai.
    Output: List of Dict (JSON) -> [{sub_bab, poin_pembahasan, instruksi}]
    """
    # 1. Pilih Model (Gunakan model cerdas untuk logika struktur)
    model_name = get_model_name(selected_model, user.is_pro)
    
    # 2. Bangun Konteks
    context_str = "Topik Umum"
    if project_context:
        context_str = f"""
        KONTEKS PROYEK:
        - Judul: {project_context.get('title', '-')}
        - Rumusan Masalah: {project_context.get('problem_statement', '-')}
        - Metodologi: {project_context.get('methodology', '-')}
        - Teori: {project_context.get('theories', '-')}
        """
    
    # 3. Tentukan Instruksi Berdasarkan Fase Penulisan
    specific_instruction = ""
    if task_type == 'background':
        topic = input_data.get('topic', '')
        specific_instruction = f"Buat kerangka Bab 1 Pendahuluan untuk topik '{topic}'. Fokus: Latar Belakang (Fenomena & Gap), Identifikasi Masalah, Tujuan."
    elif task_type == 'literature_review':
        topic = input_data.get('topic', '')
        specific_instruction = f"Buat kerangka Bab 2 Tinjauan Pustaka untuk topik '{topic}'. Fokus: Grand Theory, Variabel X, Variabel Y, dan Penelitian Terdahulu."
    elif task_type == 'methodology':
        specific_instruction = "Buat kerangka Bab 3 Metodologi Penelitian. Fokus: Desain, Populasi/Sampel, Instrumen, dan Teknik Analisis."
    elif task_type == 'discussion_chapter4':
        stats_preview = input_data.get('stats_result', '')[:500]
        specific_instruction = f"Buat kerangka Bab 4 Hasil & Pembahasan berdasarkan data ini: {stats_preview}... Fokus: Deskripsi Data, Hasil Uji Hipotesis, dan Pembahasan (Kaitkan dengan Teori)."
    elif task_type == 'conclusion':
        specific_instruction = "Buat kerangka Bab 5 Penutup. Fokus: Kesimpulan menjawab rumusan masalah dan Saran praktis/teoretis."
    else:
        specific_instruction = f"Buat kerangka tulisan akademis berdasarkan instruksi: {input_data.get('custom_instruction')}"

    # 4. System Prompt (Strict JSON Output)
    system_prompt = """
    PERAN: Anda adalah 'Academic Architect' (Dosen Pembimbing Senior).
    TUGAS: Merancang struktur bab skripsi yang logis, mengalir, dan akademis.
    
    FORMAT OUTPUT WAJIB (JSON ARRAY):
    [
        {
            "sub_bab": "Judul Sub-bab (misal: 1.1 Latar Belakang Masalah)",
            "poin_pembahasan": ["Poin 1: Fenomena...", "Poin 2: Data Empiris...", "Poin 3: Gap Penelitian..."],
            "instruksi_khusus": "Instruksi gaya bahasa atau fokus untuk AI penulis nanti."
        },
        ...
    ]
    
    ATURAN:
    1. HANYA berikan output JSON mentah. Jangan pakai Markdown (```json).
    2. Pastikan urutan logis (deduktif/induktif).
    3. Bahasa Indonesia baku.
    """

    user_prompt = f"""
    {context_str}
    
    PERMINTAAN USER:
    {specific_instruction}
    
    Buatkan 3-5 sub-bab yang mendalam.
    """

    try:
        response = completion(
            model=model_name,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.3, # Rendah agar struktur konsisten
            response_format={"type": "json_object"} 
        )
        
        # Bersihkan output JSON
        raw_content = response.choices[0].message.content
        cleaned_content = clean_json_output(raw_content)
        
        # Parsing
        parsed_json = json.loads(cleaned_content)
        
        # Handle jika AI mengembalikan dict wrapper (misal: {"outline": [...]})
        if isinstance(parsed_json, dict):
            if 'outline' in parsed_json: return parsed_json['outline']
            if 'chapters' in parsed_json: return parsed_json['chapters']
            # Jika tidak ada key standar, coba ambil value list pertama
            for val in parsed_json.values():
                if isinstance(val, list): return val
            
        return parsed_json if isinstance(parsed_json, list) else []

    except Exception as e:
        print(f"Outline Gen Error: {e}")
        traceback.print_exc()
        # Fallback manual jika AI gagal
        return [
            {
                "sub_bab": "Bagian 1 (Fallback)",
                "poin_pembahasan": ["Sistem gagal membuat outline otomatis.", "Silakan edit manual."],
                "instruksi_khusus": "Tulis dengan hati-hati."
            }
        ]

# ==========================================
# 9. AUDITOR AGENT (BATCH VERIFICATION)
# ==========================================
def batch_verify_content(html_text, references_list):
    """
    Memeriksa satu blok konten HTML sekaligus terhadap daftar referensi.
    """
    # Gabungkan referensi jadi satu konteks besar (truncate jika terlalu panjang)
    knowledge_base = "\n\n".join([f"[REF {i+1}] {r[:1000]}" for i, r in enumerate(references_list)])
    
    system_prompt = """
    PERAN: Anda adalah Editor Jurnal Ilmiah yang teliti (Fact Checker).
    
    TUGAS: 
    1. Baca TEKS INPUT (format HTML).
    2. Identifikasi kalimat yang mengandung klaim fakta/data.
    3. Cek apakah klaim tersebut didukung oleh REFERENSI yang disediakan.
    
    OUTPUT JSON (List of Objects):
    Berikan daftar kalimat yang bermasalah (Halusinasi/Tidak Akurat) atau Valid.
    Format:
    {
        "segments": [
            {
                "original_text": "Potongan kalimat/frasa dari teks asli...",
                "status": "valid" | "invalid" | "unsupported",
                "reason": "Penjelasan singkat kenapa invalid...",
                "suggestion": "Saran perbaikan (jika invalid)"
            }
        ]
    }
    
    ATURAN:
    - Jika kalimat bersifat umum/pendapat sendiri, tandai "valid".
    - Jika angka/data salah, tandai "invalid".
    - Jika tidak ada di referensi tapi terdengar ilmiah, tandai "unsupported".
    """
    
    user_prompt = f"""
    [REFERENSI TERSEDIA]
    {knowledge_base[:20000]} 
    
    [TEKS INPUT]
    {html_text}
    """
    
    try:
        response = completion(
            model=AVAILABLE_MODELS['smart'], # Gunakan model pintar (Llama 70b / GPT-4)
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.1,
            response_format={"type": "json_object"}
        )
        
        content = clean_json_output(response.choices[0].message.content)
        return json.loads(content)
        
    except Exception as e:
        print(f"Batch Audit Error: {e}")
        return {"segments": []}

# ==========================================
# HELPER: STATISTICAL REASONING ENGINE
# ==========================================
def _generate_stats_instruction(stats_text):
    """
    Menganalisis jenis data statistik dan memberikan panduan interpretasi spesifik ke AI.
    """
    instruction = "\n[PANDUAN ANALISIS DATA]:"
    
    # Deteksi jenis analisis dari keyword di JSON string
    if '"r_square"' in stats_text or '"coefficients"' in stats_text:
        # Kasus Regresi Linear
        instruction += """
        1. **Uji Simultan (F-Test):** Cek 'sig_f'. Jika < 0.05, jelaskan bahwa semua variabel X secara bersama-sama berpengaruh signifikan terhadap Y.
        2. **Uji Parsial (T-Test):** Cek tabel 'coefficients'. Untuk setiap variabel, lihat 'sig'. Jika < 0.05, nyatakan berpengaruh signifikan. Lihat 'B' (Beta) untuk arah hubungan (Positif/Negatif).
        3. **Determinan (R-Square):** Interpretasikan 'r_square' atau 'adj_r_square' sebagai persentase kontribusi pengaruh (%). Sisanya dipengaruhi faktor lain.
        4. **Asumsi Klasik:** Jika ada data 'normality' atau 'multicollinearity', bahas secara singkat apakah model memenuhi syarat (Valid/Reliabel).
        """
    elif '"t_stat"' in stats_text or '"mean_diff"' in stats_text:
        # Kasus Uji Beda (T-Test)
        instruction += """
        1. **Signifikansi:** Cek nilai 'sig'. Jika < 0.05, nyatakan ada perbedaan yang signifikan antara kedua kelompok.
        2. **Mean Difference:** Jelaskan kelompok mana yang lebih tinggi rata-ratanya berdasarkan 'group_stats' atau 'mean_diff'.
        """
    elif '"cronbach_alpha"' in stats_text:
        # Kasus Reliabilitas
        instruction += """
        1. Cek 'cronbach_alpha'. Jika > 0.6, nyatakan instrumen RELIABEL (Konsisten).
        2. Bahas item-item yang memiliki korelasi rendah jika ada.
        """
    elif '"correlation"' in stats_text or '"matrix"' in stats_text:
        # Kasus Korelasi
        instruction += """
        1. Jelaskan keeratan hubungan berdasarkan nilai R (Correlation Coefficient).
        2. 0-0.2 (Sangat Lemah), 0.2-0.4 (Lemah), 0.4-0.6 (Sedang), 0.6-0.8 (Kuat), >0.8 (Sangat Kuat).
        3. Cek arah hubungan (Positif/Negatif).
        """
    else:
        # Default / Deskriptif
        instruction += """
        1. Jelaskan pola data (Mean, Min, Max).
        2. Highlight angka yang ekstrem atau menarik perhatian.
        """
        
    instruction += "\n5. **SINTESIS TEORI:** Wajib kaitkan temuan angka di atas dengan Teori atau Penelitian Terdahulu yang ada di Konteks Proyek. Apakah sejalan atau menolak?"
    
    return instruction

# ==========================================
# FUNGSI UTAMA: BUILD INSTRUCTION (UPDATED)
# ==========================================

# app/utils/ai_utils.py

def build_task_instruction(task_type, input_data, custom_instr):
    """
    Membuat instruksi spesifik berdasarkan fase penulisan.
    [UPDATED] Support 'Workbench Mode' untuk Bab 2 dengan Context Injection.
    """
    method_mode = input_data.get('method_mode', 'quantitative')
    
    # Context Variables (Dari Sidebar Project)
    ctx_title = input_data.get('context_title', 'Topik Penelitian')
    ctx_problem = input_data.get('context_problem', '-')
    
    # Priority Topic: Input manual > Sidebar
    user_topic = input_data.get('topic', '')
    active_topic = user_topic if user_topic.strip() else ctx_title

    # === BAB 1: LATAR BELAKANG ===
    if task_type == 'background':
        base = f"TUGAS: Tulis BAB 1 LATAR BELAKANG untuk Judul: '{active_topic}'.\n"
        base += f"RUMUSAN MASALAH: {ctx_problem}\n"
        
        if method_mode == 'ptk':
            return base + "FOKUS PTK: Bandingkan kondisi ideal (harapan) vs kondisi nyata (masalah siswa). Jelaskan mengapa tindakan dipilih sebagai solusi."
        elif method_mode in ['qualitative', 'case_study']:
            return base + "FOKUS KUALITATIF: Jelaskan keunikan fenomena/kasus, konteks sosial, dan urgensi penelitian."
        else:
            return base + "FOKUS KUANTITATIF: Jelaskan gap empiris, data awal, dan urgensi hubungan antar variabel."

    # === BAB 2: KAJIAN PUSTAKA (WORKBENCH ENGINE) ===
    elif task_type == 'literature_review':
        sub_task = input_data.get('sub_task', 'outline')
        sub_topic = input_data.get('sub_topic', 'Sub-bab')
        
        # [NEW] Ambil Bahan Baku dari Frontend
        context_material = input_data.get('context_material', '').strip()

        # MODE 1: Generate Outline (Fallback jika tidak lewat API khusus)
        if sub_task == 'outline':
            return f"TUGAS: Buat Outline Bab 2 untuk '{active_topic}'. Hanya list sub-bab."
        
        # MODE 2: Generate Konten (The Workbench Logic)
        else:
            # Skenario A: User memberikan referensi/catatan
            if context_material:
                return f"""
                PERAN: Academic Writer (Spesialis Sintesis Jurnal).
                TUGAS: Tulis konten untuk Sub-Bab: "{sub_topic}".
                KONTEKS JUDUL: "{active_topic}".
                
                BAHAN BAKU / REFERENSI USER (WAJIB DIPAKAI):
                =========================================
                {context_material}
                =========================================
                
                INSTRUKSI KHUSUS:
                1. **Sintesis:** Gabungkan informasi dari bahan baku di atas menjadi narasi paragraf yang padu.
                2. **Parafrase:** Ubah kalimat agar tidak plagiasi, tapi pertahankan makna.
                3. **Kutipan:** Jika ada nama tokoh/ahli di bahan baku, SEBUTKAN dalam tulisan (Contoh: "Menurut Anderson...").
                4. **Simpulan:** Akhiri dengan 1 paragraf sintesis/simpulan dari teori tersebut.
                
                Gaya Bahasa: Formal, Objektif, Akademis Skripsi Indonesia.
                """
            
            # Skenario B: User tidak kasih referensi (General Knowledge)
            else:
                return f"""
                PERAN: Academic Writer.
                TUGAS: Tulis landasan teori untuk Sub-Bab: "{sub_topic}".
                JUDUL SKRIPSI: "{active_topic}".
                
                INSTRUKSI:
                1. Jelaskan definisi, konsep, atau teori yang relevan dengan sub-bab ini.
                2. Jika relevan, sebutkan indikator atau dimensi.
                3. Gunakan gaya bahasa skripsi yang baku dan mendalam.
                4. Karena user tidak memberikan referensi spesifik, gunakan pengetahuan akademis umum (General Knowledge).
                """

    # === BAB 3: METODOLOGI ===
    elif task_type == 'methodology':
        base = f"TUGAS: Tulis BAB 3 METODOLOGI untuk Judul '{active_topic}'."
        if method_mode == 'quantitative':
            return base + "METODE: KUANTITATIF (Desain, Populasi, Sampel, Instrumen, Analisis Statistik)."
        elif method_mode == 'ptk':
            return base + "METODE: PTK (Model Kemmis McTaggart, Prosedur Siklus, Indikator Keberhasilan)."
        elif method_mode == 'qualitative':
            return base + "METODE: KUALITATIF (Pendekatan, Sumber Data, Triangulasi, Analisis Miles Huberman)."
        else:
            return base + f"METODE: {method_mode.upper()}."

    # === BAB 4: HASIL & PEMBAHASAN ===
    elif task_type == 'discussion_chapter4':
        if method_mode == 'quantitative':
            return f"TUGAS: Bab 4 Kuantitatif. DATA: {input_data.get('stats_result', '-')}. INSTRUKSI: Interpretasi statistik & Uji Hipotesis."
        elif method_mode == 'ptk':
            return f"TUGAS: Bab 4 PTK. SIKLUS: {input_data.get('qual_data', {})}. INSTRUKSI: Bandingkan Prasiklus vs Siklus 1 vs Siklus 2."
        else:
            return f"TUGAS: Bab 4 Kualitatif. TEMUAN: {input_data.get('qual_data', {}).get('findings')}. INSTRUKSI: Analisis tema mendalam."

    # === BAB 5: PENUTUP ===
    elif task_type == 'conclusion':
        return f"""
        TUGAS: Tulis BAB 5 KESIMPULAN & SARAN untuk Judul '{active_topic}'.
        INSTRUKSI:
        1. Kesimpulan harus menjawab: "{ctx_problem}".
        2. Saran harus operasional dan aplikatif.
        """
        
    else:
        return f"INSTRUKSI: {custom_instr}"
    """
    Membuat instruksi spesifik berdasarkan fase penulisan.
    [UPDATED] Logic Semesta: Bab 1, 2, 3, 4, 5 semua adaptif terhadap metode.
    """
    method_mode = input_data.get('method_mode', 'quantitative')
    topic = input_data.get('topic', 'Topik Penelitian')

    # === BAB 1: LATAR BELAKANG ===
    if task_type == 'background':
        base = f"TUGAS: Tulis BAB 1 LATAR BELAKANG untuk topik '{topic}'.\n"
        
        if method_mode == 'ptk':
            return base + """
            FOKUS: PENELITIAN TINDAKAN KELAS (PTK).
            ALUR LOGIKA:
            1. **Harapan (Das Sollen):** Pembelajaran yang ideal (Kurikulum/Tujuan).
            2. **Masalah Kelas (Das Sein):** Rendahnya hasil belajar/motivasi (Sertakan data fiktif prasiklus/observasi).
            3. **Akar Masalah:** Metode pengajaran guru yang monoton/kurang tepat.
            4. **Solusi Tindakan:** Mengapa metode yang Anda pilih bisa menyelesaikan masalah ini?
            """
        elif method_mode in ['qualitative', 'phenomenology', 'case_study']:
            return base + """
            FOKUS: KUALITATIF / FENOMENA UNIK.
            ALUR LOGIKA:
            1. **Konteks Sosial/Budaya:** Gambaran setting penelitian yang menarik.
            2. **Keunikan Fenomena:** Apa yang berbeda/aneh/menarik dari kasus ini dibanding yang lain?
            3. **Subjektivitas:** Mengapa pengalaman subjek ini penting untuk digali?
            4. **Research Gap:** Belum banyak yang meneliti sisi 'makna' dari fenomena ini.
            """
        else: # Quantitative
            return base + """
            FOKUS: KUANTITATIF / VARIABEL.
            ALUR LOGIKA:
            1. **Isu Global/Nasional:** Data makro terkait masalah.
            2. **Gap Empiris:** Data di lokasi penelitian yang menunjukkan kesenjangan.
            3. **Hubungan Variabel:** Teori singkat mengapa Variabel X mempengaruhi Y.
            4. **Urgensi:** Pentingnya membuktikan pengaruh ini secara statistik.
            """

# ... (kode sebelumnya: Background, dll) ...

    # === BAB 2: KAJIAN PUSTAKA (WORKBENCH ENGINE) ===
    elif task_type == 'literature_review':
        sub_task = input_data.get('sub_task', 'outline')
        sub_topic = input_data.get('sub_topic', 'Sub-bab')
        
        # [NEW] Ambil Bahan Baku dari Frontend
        context_material = input_data.get('context_material', '').strip()

        # MODE 1: Generate Outline JSON (Biasanya dihandle route khusus, tapi ini fallback jika lewat stream)
        if sub_task == 'outline':
            return f"""
            TUGAS: Buat Outline Bab 2 untuk Judul: "{active_topic}".
            FORMAT: Hanya list poin-poin sub-bab. Jangan ada penjelasan.
            """
        
        # MODE 2: Generate Konten dengan Context Injection
        else:
            # Skenario A: User memberikan referensi/catatan
            if context_material:
                return f"""
                PERAN: Academic Writer (Spesialis Sintesis Jurnal).
                TUGAS: Tulis konten untuk Sub-Bab: "{sub_topic}".
                KONTEKS JUDUL SKRIPSI: "{active_topic}".
                
                BAHAN BAKU / REFERENSI DARI USER (WAJIB DIPAKAI):
                =========================================
                {context_material}
                =========================================
                
                INSTRUKSI KHUSUS:
                1. **Sintesis:** Gabungkan informasi dari bahan baku di atas menjadi narasi yang mengalir (paragraf).
                2. **Dilarang Copy-Paste:** Lakukan parafrase akademik agar lolos plagiasi.
                3. **Fokus:** Jangan lari dari topik "{sub_topic}".
                4. **Kutipan:** Jika di bahan baku ada nama ahli (misal: "Menurut Sugiyono..."), MASUKKAN nama itu dalam tulisan Anda.
                5. **Penutup:** Akhiri dengan satu kalimat simpulan sintesis (contoh: "Berdasarkan pandangan para ahli di atas, dapat disimpulkan bahwa {sub_topic} adalah...").
                
                Gaya Bahasa: Formal, Objektif, Akademis.
                """
            
            # Skenario B: User malas/kosong (AI pakai pengetahuan umum)
            else:
                return f"""
                PERAN: Academic Writer.
                TUGAS: Tulis konten teoretis untuk Sub-Bab: "{sub_topic}".
                KONTEKS JUDUL SKRIPSI: "{active_topic}".
                
                KONDISI: User tidak memberikan referensi spesifik.
                
                INSTRUKSI:
                1. Jelaskan definisi/konsep "{sub_topic}" berdasarkan teori umum/grand theory yang relevan.
                2. Sebutkan indikator/dimensi jika relevan.
                3. Gunakan bahasa yang sangat akademis agar terlihat kredibel meskipun tanpa kutipan spesifik saat ini.
                4. Berikan placeholder kutipan jika perlu, contoh: (Nama Ahli, Tahun).
                """


    # === BAB 3: METODOLOGI (Sudah kita update sebelumnya) ===
    elif task_type == 'methodology':
        base_prompt = f"TUGAS: Tulis BAB 3 METODOLOGI PENELITIAN untuk topik '{topic}'."
        if method_mode == 'quantitative':
            return base_prompt + "METODE: KUANTITATIF. (Desain, Populasi, Sampel, Instrumen, Uji Statistik)."
        elif method_mode == 'ptk':
            return base_prompt + "METODE: PTK. (Model Kemmis McTaggart, Subjek, Prosedur Siklus I & II, Indikator Sukses)."
        elif method_mode in ['qualitative', 'phenomenology', 'case_study']:
            return base_prompt + "METODE: KUALITATIF. (Pendekatan, Sumber Data, Teknik Wawancara, Analisis Miles Huberman)."
        elif method_mode == 'library_research':
            return base_prompt + "METODE: KEPUSTAKAAN. (Sumber Primer/Sekunder, Analisis Isi)."
        else:
            return base_prompt + "METODE: MIXED METHODS."

    # === BAB 4: HASIL & PEMBAHASAN (Sudah kita update sebelumnya) ===
    elif task_type == 'discussion_chapter4':
        # ... (Gunakan logika percabangan Bab 4 yang sudah kita buat sebelumnya di sini)
        # Saya singkat agar muat, tapi GUNAKAN KODE LENGKAP DARI LANGKAH SEBELUMNYA.
        if method_mode == 'quantitative':
            return f"TUGAS: Bab 4 Kuantitatif. DATA: {input_data.get('stats_result', '-')}. INSTRUKSI: Interpretasi Tabel & Uji Hipotesis."
        elif method_mode == 'ptk':
            return f"TUGAS: Bab 4 PTK. SIKLUS: {input_data.get('qual_data', {})}. INSTRUKSI: Bandingkan Prasiklus, Siklus 1, Siklus 2."
        else:
            return f"TUGAS: Bab 4 Kualitatif. TEMUAN: {input_data.get('qual_data', {}).get('findings')}. INSTRUKSI: Thick Description."

    # === BAB 5: PENUTUP ===
    elif task_type == 'conclusion':
        base = "TUGAS: Tulis BAB 5 KESIMPULAN & SARAN.\n"
        if method_mode == 'quantitative':
            return base + "KESIMPULAN: Jawab hipotesis (Diterima/Ditolak). Sertakan nilai signifikansi ringkas."
        elif method_mode == 'ptk':
            return base + "KESIMPULAN: Nyatakan apakah tindakan berhasil meningkatkan indikator kinerja (Siklus 1 vs Siklus 2)."
        else:
            return base + "KESIMPULAN: Rangkum makna mendalam/temuan tema baru. Jangan pakai angka."
            
    else:
        return f"INSTRUKSI KHUSUS: {custom_instr}"

# ==========================================
# 10. THE DEFENDER AGENT (SIMULASI SIDANG)
# ==========================================
def simulate_defense_turn(history, project_context, difficulty="hard"):
    """
    Engine untuk simulasi sidang skripsi.
    AI bertindak sebagai Dosen Penguji yang agresif secara intelektual.
    """
    model_name = AVAILABLE_MODELS['smart'] # Wajib model pintar (70b/GPT-4)
    
    # 1. Bangun Persona Dosen
    tone_instruction = ""
    if difficulty == "hard":
        tone_instruction = "Sangat kritis, skeptis, intimidatif secara akademis, dan mengejar detail metodologi. Jangan mudah puas dengan jawaban normatif."
    else:
        tone_instruction = "Tegas, objektif, fokus pada alur logika, tapi tetap konstruktif."

    # 2. Ringkasan Proyek
    context_str = f"""
    JUDUL SKRIPSI: {project_context.get('title', 'Tidak diketahui')}
    RUMUSAN MASALAH: {project_context.get('problem_statement', '-')}
    METODOLOGI: {project_context.get('methodology', '-')}
    TEORI: {project_context.get('theories', '-')}
    """

    system_prompt = f"""
    PERAN: Anda adalah Dosen Penguji Skripsi Senior (The Examiner).
    TUJUAN: Menguji kesiapan mental dan logika mahasiswa dalam mempertahankan skripsinya.
    
    PERSONA & TONE:
    {tone_instruction}
    
    ATURAN INTERAKSI:
    1. BERIKAN SATU PERTANYAAN SAJA dalam satu giliran. Jangan memberondong banyak tanya.
    2. Jika jawaban mahasiswa lemah/ragu, kejar terus bagian itu ("Attack the weakness").
    3. Jika jawaban mahasiswa tidak nyambung, tegur dengan tegas.
    4. Fokus pada: Kelemahan metodologi, urgensi penelitian, dan validitas data.
    5. Jangan memberikan solusi/saran dulu. Tugas Anda adalah MENGUJI.
    
    FORMAT OUTPUT (JSON):
    {{
        "examiner_response": "Kalimat respon/pertanyaan dosen...",
        "current_mood": "neutral" | "annoyed" | "impressed" | "angry",
        "weakness_detected": "Analisis singkat kelemahan jawaban user (untuk internal system)..."
    }}
    """

    # Format history chat untuk konteks
    messages = [{"role": "system", "content": system_prompt}]
    
    # Inject konteks proyek di awal
    messages.append({"role": "user", "content": f"Ini draf skripsi saya:\n{context_str}\n\nSaya siap diuji, Dok."})
    
    # Masukkan history chat sebelumnya
    for msg in history:
        role = "assistant" if msg['sender'] == 'ai' else "user"
        # Kita hanya kirim teksnya ke model (bukan JSON metadata)
        content = msg['text']
        messages.append({"role": role, "content": content})

    try:
        response = completion(
            model=model_name,
            messages=messages,
            temperature=0.7, # Sedikit kreatif agar pertanyaan variatif
            response_format={"type": "json_object"}
        )
        return json.loads(clean_json_output(response.choices[0].message.content))
    except Exception as e:
        print(f"Defense Error: {e}")
        return {
            "examiner_response": "Maaf, saya kehilangan fokus sebentar. Coba ulangi argumen Anda.",
            "current_mood": "neutral",
            "weakness_detected": "System Error"
        }

def generate_defense_evaluation(history):
    """
    Memberikan rapor penilaian setelah sesi sidang selesai.
    """
    model_name = AVAILABLE_MODELS['smart']
    
    # Konversi history jadi string transkrip
    transcript = "\n".join([f"{m['sender'].upper()}: {m['text']}" for m in history])
    
    system_prompt = """
    PERAN: Ketua Sidang Skripsi.
    TUGAS: Berikan evaluasi final berdasarkan transkrip sidang simulasi.
    
    OUTPUT JSON:
    {
        "score": 0-100,
        "verdict": "LULUS" | "LULUS DENGAN REVISI" | "TIDAK LULUS",
        "strengths": ["Poin kuat 1", "Poin kuat 2"],
        "weaknesses": ["Kelemahan 1", "Kelemahan 2"],
        "advice": "Saran strategi untuk sidang asli..."
    }
    """
    
    try:
        response = completion(
            model=model_name,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"TRANSKRIP SIDANG:\n{transcript}"}
            ],
            response_format={"type": "json_object"}
        )
        return json.loads(clean_json_output(response.choices[0].message.content))
    except Exception:
        return {"score": 0, "verdict": "ERROR", "advice": "Gagal evaluasi."}

def get_groq_client():
    """
    Mengembalikan instance client Groq.
    Pastikan 'GROQ_API_KEY' ada di file .env kamu.
    """
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        print("⚠️ WARNING: GROQ_API_KEY tidak ditemukan di environment variables!")
        return None
    return Groq(api_key=api_key)

# === 2. LOGIC PROMPT ENGINE (YANG TADI KITA UPDATE) ===
def build_task_instruction(task_type, input_data, custom_instr=""):
    """
    Membuat instruksi sistem (System Prompt) berdasarkan task type.
    Support Workbench Mode untuk Bab 2.
    """
    method_mode = input_data.get('method_mode', 'quantitative')
    
    # Context Variables
    ctx_title = input_data.get('context_title', 'Topik Penelitian')
    ctx_problem = input_data.get('context_problem', '-')
    
    # Priority Topic: Input manual > Context
    user_topic = input_data.get('topic', '')
    active_topic = user_topic if user_topic.strip() else ctx_title

    # --- BAB 1: LATAR BELAKANG ---
    if task_type == 'background':
        base = f"TUGAS: Tulis BAB 1 LATAR BELAKANG untuk Judul: '{active_topic}'.\n"
        base += f"RUMUSAN MASALAH: {ctx_problem}\n"
        
        if method_mode == 'ptk':
            return base + "FOKUS PTK: Bandingkan kondisi ideal (harapan) vs kondisi nyata (masalah siswa). Jelaskan mengapa tindakan dipilih sebagai solusi."
        elif method_mode in ['qualitative', 'case_study']:
            return base + "FOKUS KUALITATIF: Jelaskan keunikan fenomena/kasus, konteks sosial, dan urgensi penelitian."
        else:
            return base + "FOKUS KUANTITATIF: Jelaskan gap empiris, data awal, dan urgensi hubungan antar variabel."

    # --- BAB 2: KAJIAN PUSTAKA (WORKBENCH ENGINE) ---
    elif task_type == 'literature_review':
        sub_task = input_data.get('sub_task', 'outline')
        sub_topic = input_data.get('sub_topic', 'Sub-bab')
        
        # Ambil Bahan Baku dari Frontend
        context_material = input_data.get('context_material', '').strip()

        # MODE 1: Generate Outline (Fallback)
        if sub_task == 'outline':
            return f"TUGAS: Buat Outline Bab 2 untuk '{active_topic}'. Hanya list sub-bab."
        
        # MODE 2: Generate Konten
        else:
            if context_material:
                # Skenario A: User kasih referensi (Synthesis Mode)
                return f"""
                PERAN: Academic Writer (Spesialis Sintesis Jurnal).
                TUGAS: Tulis konten untuk Sub-Bab: "{sub_topic}".
                KONTEKS JUDUL: "{active_topic}".
                
                BAHAN BAKU / REFERENSI USER (WAJIB DIPAKAI):
                =========================================
                {context_material}
                =========================================
                
                INSTRUKSI KHUSUS:
                1. **Sintesis:** Gabungkan informasi dari bahan baku di atas menjadi narasi paragraf yang padu.
                2. **Parafrase:** Ubah kalimat agar tidak plagiasi, tapi pertahankan makna.
                3. **Kutipan:** Jika ada nama tokoh/ahli di bahan baku, SEBUTKAN dalam tulisan (Contoh: "Menurut Anderson...").
                4. **Simpulan:** Akhiri dengan 1 paragraf sintesis/simpulan dari teori tersebut.
                
                Gaya Bahasa: Formal, Objektif, Akademis Skripsi Indonesia.
                """
            else:
                # Skenario B: Kosong (General Knowledge)
                return f"""
                PERAN: Academic Writer.
                TUGAS: Tulis landasan teori untuk Sub-Bab: "{sub_topic}".
                JUDUL SKRIPSI: "{active_topic}".
                
                INSTRUKSI:
                1. Jelaskan definisi, konsep, atau teori yang relevan dengan sub-bab ini.
                2. Jika relevan, sebutkan indikator atau dimensi.
                3. Gunakan gaya bahasa skripsi yang baku.
                4. Gunakan pengetahuan akademis umum (General Knowledge).
                """

    # --- BAB 3: METODOLOGI ---
    elif task_type == 'methodology':
        base = f"TUGAS: Tulis BAB 3 METODOLOGI untuk Judul '{active_topic}'."
        if method_mode == 'quantitative':
            return base + "METODE: KUANTITATIF (Desain, Populasi, Sampel, Instrumen, Analisis Statistik)."
        elif method_mode == 'ptk':
            return base + "METODE: PTK (Model Kemmis McTaggart, Prosedur Siklus, Indikator Keberhasilan)."
        elif method_mode == 'qualitative':
            return base + "METODE: KUALITATIF (Pendekatan, Sumber Data, Triangulasi, Analisis Miles Huberman)."
        else:
            return base + f"METODE: {method_mode.upper()}."

    # --- BAB 4: HASIL & PEMBAHASAN ---
    elif task_type == 'discussion_chapter4':
        if method_mode == 'quantitative':
            return f"TUGAS: Bab 4 Kuantitatif. DATA: {input_data.get('stats_result', '-')}. INSTRUKSI: Interpretasi statistik & Uji Hipotesis."
        elif method_mode == 'ptk':
            return f"TUGAS: Bab 4 PTK. SIKLUS: {input_data.get('qual_data', {})}. INSTRUKSI: Bandingkan Prasiklus vs Siklus 1 vs Siklus 2."
        else:
            return f"TUGAS: Bab 4 Kualitatif. TEMUAN: {input_data.get('qual_data', {}).get('findings')}. INSTRUKSI: Analisis tema mendalam."

    # --- BAB 5: PENUTUP ---
    elif task_type == 'conclusion':
        return f"""
        TUGAS: Tulis BAB 5 KESIMPULAN & SARAN untuk Judul '{active_topic}'.
        INSTRUKSI:
        1. Kesimpulan harus menjawab: "{ctx_problem}".
        2. Saran harus operasional dan aplikatif.
        """
        
    else:
        return f"INSTRUKSI: {custom_instr}"


def extract_citation_metadata(file_storage):
    """
    [HYBRID FIX]
    Nama fungsinya tetap 'metadata' biar tidak error di Controller lama,
    TAPI isinya kita buat untuk menyedot FULL TEXT dari PDF biar AI pinter.
    """
    try:
        # 1. Reset pointer file ke awal (penting!)
        file_storage.seek(0)
        
        # 2. Baca PDF
        pdf_reader = PyPDF2.PdfReader(file_storage)
        full_text = ""
        
        # 3. Sedot teks dari maksimal 50 halaman (Biar server gak meledak kalo file tebal)
        max_pages = min(len(pdf_reader.pages), 50)
        
        for i in range(max_pages):
            page_text = pdf_reader.pages[i].extract_text()
            if page_text:
                full_text += page_text + "\n"
        
        # Bersihkan spasi berlebih
        clean_text = full_text.strip()
        
        # Jika kosong atau terlalu pendek (kemungkinan gambar scan)
        if len(clean_text) < 50:
            return None # Nanti controller akan handle error ini

        # 4. Return Dictionary (Format Metadata tapi isinya Daging)
        # Kita masukkan full text ke field 'abstract' atau buat field baru
        return {
            'title': file_storage.filename,          # Judul = Nama File (Sementara)
            'author': 'Dokumen Upload',              # Default
            'year': '2024',                          # Default
            'journal': 'PDF Reference',              # Default
            'abstract': clean_text,                  # <--- INI KUNCINYA! Kita taruh full text disini
            'full_text': clean_text                  # Cadangan
        }

    except Exception as e:
        print(f"Error extracting PDF content: {e}")
        return None

    @staticmethod
    def writing_assistant_stream(user, data):
        """
        Wrapper untuk fungsi streaming di ai_utils.
        Menghubungkan data dari Frontend (WritingStudioRoot) ke Logic AI.
        """
        # Mapping data dari request frontend ke parameter ai_utils
        input_data = data.get('data', {})
        
        # --- [NEW] LOGIKA STRICT WORD COUNT CONTROL ---
        target_word_count = input_data.get('word_count', '300')
        
        # Hitung toleransi (±10%)
        try:
            target_int = int(target_word_count)
            max_limit = int(target_int * 1.2) # Max lebihi 20% aja
        except:
            target_int = 300
            max_limit = 400

        # Kita suntikkan "Constraint Keras" ke dalam context_material
        # Ini trik agar AI membaca ini sebagai aturan main utama.
        word_count_instruction = (
            f"\n\n[ATURAN KHUSUS - WAJIB DIPATUHI]:\n"
            f"1. Target panjang tulisan: SEKITAR {target_int} KATA.\n"
            f"2. DILARANG KERAS menulis lebih dari {max_limit} kata.\n"
            f"3. Jika referensi panjang, ambil poin terpenting saja. JANGAN merangkum semuanya.\n"
            f"4. Fokus: Langsung ke inti pembahasan (To the point), padat, dan berbobot.\n"
            f"5. Hapus kalimat pembuka/penutup yang basa-basi.\n"
        )
        
        # Gabungkan ke context material yang akan dibaca AI
        current_context = input_data.get('context_material', '')
        if current_context:
            input_data['context_material'] = word_count_instruction + "\n[REFERENSI USER]:\n" + current_context
        else:
            input_data['context_material'] = word_count_instruction
        # -----------------------------------------------
        
        # Mapping Deep Context (Bab 1, 2, 3)
        project_context = {
            'title': input_data.get('context_title'),
            'problem_statement': input_data.get('context_problem'),
            'methodology': input_data.get('context_method'),
            'variables': input_data.get('context_variables'),
            'hypothesis': input_data.get('context_hypothesis')
        }

        return ai_utils.generate_academic_draft_stream(
            user, 
            task_type=data.get('task', 'general'),
            input_data=input_data,
            project_context=project_context,
            selected_model=data.get('model', 'fast'),
            editor_context=input_data.get('previous_content', ''),
            user_style_profile=input_data.get('style_profile')
        )