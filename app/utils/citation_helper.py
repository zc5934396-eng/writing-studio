# File: app/utils/citation_helper.py

import datetime

def format_apa_7(ref):
    """
    Mengubah dict referensi menjadi string format APA 7th Edition.
    """
    # 1. AUTHOR: Last name, Initial.
    # Contoh input: "Smith, John Doe" -> "Smith, J. D."
    # Contoh input: "Budi Santoso" -> "Santoso, B."
    authors_raw = ref.get('author', 'Anonim')
    formatted_authors = authors_raw # Default fallback
    
    try:
        authors_list = authors_raw.split(',')
        cleaned_authors = []
        for auth in authors_list:
            parts = auth.strip().split(' ')
            if len(parts) > 1:
                last_name = parts[-1]
                initials = "".join([f"{p[0]}." for p in parts[:-1]])
                cleaned_authors.append(f"{last_name}, {initials}")
            else:
                cleaned_authors.append(auth.strip())
        
        if len(cleaned_authors) > 20: # Et al rule
            formatted_authors = f"{', '.join(cleaned_authors[:19])}, ... {cleaned_authors[-1]}"
        elif len(cleaned_authors) > 1:
            formatted_authors = f"{', '.join(cleaned_authors[:-1])}, & {cleaned_authors[-1]}"
        else:
            formatted_authors = cleaned_authors[0]
    except:
        pass # Fallback ke raw jika parsing gagal

    # 2. YEAR
    year = ref.get('year', 'n.d.')

    # 3. TITLE
    title = ref.get('title', 'Tanpa Judul')
    
    # 4. SOURCE (Journal/Publisher)
    source = ref.get('journal') or ref.get('publisher') or ref.get('source', '')
    
    # 5. URL/DOI
    doi = ref.get('doi', '')
    url = ref.get('url', '')
    link = ""
    if doi:
        link = f"https://doi.org/{doi}" if 'http' not in doi else doi
    elif url:
        link = url

    # RAKIT APA 7 STRING
    # Format: Author. (Year). Title. Source. Link.
    
    # Italicize Title or Source? 
    # Aturan simpel: Jika Jurnal, Nama Jurnal Italic. Jika Buku/Web, Judul Italic.
    # Kita asumsikan ini Artikel Jurnal dulu biar aman (umum di skripsi).
    
    citation_html = f"{formatted_authors} ({year}). {title}. <i>{source}</i>. {link}"
    
    # Versi Plain Text (untuk clipboard)
    citation_text = f"{formatted_authors} ({year}). {title}. {source}. {link}"

    return {
        "html": citation_html.strip(),
        "text": citation_text.strip()
    }

def generate_bibliography(references):
    """
    Mengurutkan referensi A-Z dan memformatnya.
    """
    # 1. Sort by Author Name
    sorted_refs = sorted(references, key=lambda x: x.get('author', '').lower())
    
    result_html = "<h3>DAFTAR PUSTAKA</h3><br/>"
    result_text = ""
    
    for ref in sorted_refs:
        fmt = format_apa_7(ref)
        result_html += f"<p class='mb-4 pl-8 -indent-8'>{fmt['html']}</p>" # CSS Hanging Indent
        result_text += f"{fmt['text']}\n\n"
        
    return result_html, result_text