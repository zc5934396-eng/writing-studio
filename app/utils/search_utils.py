# File: app/utils/search_utils.py
# Deskripsi: Kumpulan fungsi untuk mencari referensi dari database akademik.
# VERSI UPGRADE: Memperbaiki parsing kata kunci (keywords) dan menambahkan User-Agent.

import os
import re
import requests
from concurrent.futures import ThreadPoolExecutor

from .general_utils import make_api_request_with_retry

def _parse_keywords(keywords_string):
    """Memecah string "a, b, c" menjadi query "a" OR "b" OR "c"."""
    keywords = [k.strip() for k in keywords_string.split(',') if k.strip()]
    # Bungkus setiap keyword dengan tanda kutip ganda untuk pencarian frasa
    quoted_keywords = [f'"{k}"' for k in keywords]
    return " OR ".join(quoted_keywords)

def search_core(keywords, year=None):
    """Mencari referensi dari CORE API."""
    print(f"Mencari di CORE dengan keywords: {keywords}")
    core_api_key = os.getenv('CORE_API_KEY')
    if not core_api_key: 
        print("Peringatan: CORE_API_KEY tidak ditemukan.")
        return []

    # PERBAIKAN: Ubah "a, b" menjadi "a" OR "b"
    parsed_query = _parse_keywords(keywords)
    query_parts = [f'title:({parsed_query}) OR abstract:({parsed_query})']
    
    if year:
        query_parts.append(f"yearPublished:>={year}")

    core_query = " AND ".join(query_parts)
    core_url = f"https://api.core.ac.uk/v3/search/works"
    params = {'q': core_query, 'limit': 10}
    headers = {"Authorization": f"Bearer {core_api_key}"}

    response = make_api_request_with_retry(core_url, headers=headers, params=params)
    if not response: return []
    
    results = []
    for item in response.json().get('results', []):
        authors = ", ".join([author['name'] for author in item.get('authors', [])])
        results.append({
            "id": f"core_{item.get('id')}",
            "title": item.get('title', 'N/A'),
            "author": authors,
            "year": item.get('yearPublished'),
            "journal": item.get('publisher'),
            "abstract": item.get('abstract', 'Abstrak tidak tersedia.'),
            "pdfUrl": item.get('downloadUrl'),
            "doi": item.get('doi')
        })
    return results

def search_crossref(keywords, year=None):
    """Mencari referensi dari Crossref API."""
    print(f"Mencari di Crossref dengan keywords: {keywords}")
    base_url = 'https://api.crossref.org/works'
    # PERBAIKAN: Crossref menangani string koma dengan baik, jadi kita biarkan.
    params = {'query.bibliographic': keywords, 'rows': 10, 'sort': 'relevance'}
    if year:
        params['filter'] = f'from-pub-date:{year}-01-01'

    headers = {'User-Agent': 'OnThesisApp/1.0 (mailto:dev@onthesis.app)'}
    response = make_api_request_with_retry(base_url, headers=headers, params=params)
    if not response: return []

    results = []
    for item in response.json().get('message', {}).get('items', []):
        authors_list = item.get('author', [])
        authors = ", ".join([f"{author.get('family', '')}, {author.get('given', '')[0]}." for author in authors_list if author.get('family') and author.get('given')])
        pub_year = item.get('issued', {}).get('date-parts', [[None]])[0][0]
        
        pdf_link = next((link['URL'] for link in item.get('link', []) if link.get('content-type') == 'application/pdf'), None)

        results.append({
            "id": f"crossref_{item.get('DOI')}",
            "title": item.get('title', ['N/A'])[0],
            "author": authors,
            "year": pub_year,
            "journal": item.get('container-title', ['N/A'])[0],
            "abstract": item.get('abstract', 'Abstrak tidak tersedia.').lstrip('<jats:p>').rstrip('</jats:p>'),
            "pdfUrl": pdf_link,
            "doi": item.get('DOI')
        })
    return results

def search_openalex(keywords, year=None):
    """Mencari referensi dari OpenAlex API."""
    print(f"Mencari di OpenAlex dengan keywords: {keywords}")
    base_url = "https://api.openalex.org/works"
    filters = [f"default.search:{keywords}"]
    if year:
        filters.append(f"publication_year:>={year}")
        
    params = {'filter': ",".join(filters), 'per-page': 10}
    # PERBAIKAN: Menambahkan email (User-Agent) untuk menghindari 403 Forbidden
    headers = {'User-Agent': 'support@onthesis.app'} # Ganti dengan email Anda
    
    response = make_api_request_with_retry(base_url, headers=headers, params=params)
    if not response: return []

    results = []
    for item in response.json().get('results', []):
        authors = [author['author']['display_name'] for author in item.get('authorships', [])]
        
        abstract = ""
        if item.get('abstract_inverted_index'):
            inv_index = item['abstract_inverted_index']
            word_positions = []
            for word, positions in inv_index.items():
                for pos in positions:
                    word_positions.append((pos, word))
            abstract = ' '.join([word for pos, word in sorted(word_positions)])

        results.append({
            "id": item.get('id'),
            "title": item.get('display_name', 'N/A'),
            "author": ", ".join(authors),
            "year": item.get('publication_year'),
            "journal": item.get('primary_location', {}).get('source', {}).get('display_name'),
            "abstract": abstract or 'Abstrak tidak tersedia.',
            "pdfUrl": item.get('primary_location', {}).get('pdf_url'),
            "doi": item.get('doi', '').replace('https://doi.org/', '')
        })
    return results

def search_doaj(keywords, year=None):
    """Mencari referensi dari DOAJ API."""
    print(f"Mencari di DOAJ dengan keywords: {keywords}")
    
    # PERBAIKAN: Ubah "a, b" menjadi (bibjson.title:"a" OR bibjson.title:"b" OR bibjson.abstract:"a" ...)
    keywords_list = [k.strip() for k in keywords.split(',') if k.strip()]
    title_queries = [f'bibjson.title:"{k}"' for k in keywords_list]
    abstract_queries = [f'bibjson.abstract:"{k}"' for k in keywords_list]
    
    query_parts = [f"({' OR '.join(title_queries)})", f"({' OR '.join(abstract_queries)})"]
    
    if year:
        query_parts.append(f'bibjson.year:[{year} TO *]')
        
    search_query = f"({' OR '.join(query_parts)})"
    if year:
        search_query += f' AND bibjson.year:[{year} TO *]'

    base_url = f"https://doaj.org/api/v2/search/articles/"
    # Gunakan params, jangan masukkan query ke URL secara manual
    params = {'query': search_query, 'pageSize': 10}
    
    response = make_api_request_with_retry(base_url, headers={}, params=params)
    if not response: return []

    results = []
    for item in response.json().get('results', []):
        bibjson = item.get('bibjson', {})
        authors = [author['name'] for author in bibjson.get('author', [])]
        pdf_link = next((link['url'] for link in bibjson.get('link', []) if link.get('type') == 'fulltext'), None)
        
        results.append({
            "id": f"doaj_{item.get('id')}",
            "title": bibjson.get('title', 'N/A'),
            "author": ", ".join(authors),
            "year": bibjson.get('year'),
            "journal": bibjson.get('journal', {}).get('title'),
            "abstract": bibjson.get('abstract', 'Abstrak tidak tersedia.'),
            "pdfUrl": pdf_link,
            "doi": next((identifier['id'] for identifier in bibjson.get('identifier', []) if identifier.get('type') == 'doi'), None)
        })
    return results

def search_eric(keywords, year=None):
    """Mencari referensi dari ERIC API."""
    print(f"Mencari di ERIC dengan keywords: {keywords}")
    base_url = "https://api.ies.ed.gov/eric/"
    
    # PERBAIKAN: Ganti koma dengan "AND" agar lebih solid
    search_term = keywords.replace(",", " AND ")
    
    if year:
        search_term += f"&publicationdate_from={year}"
        
    params = {'search': search_term, 'rows': 10, 'format': 'json'}
    response = make_api_request_with_retry(base_url, headers={}, params=params)
    if not response: return []

    results = []
    for item in response.json().get('response', {}).get('docs', []):
        results.append({
            "id": f"eric_{item.get('id')}",
            "title": item.get('title', 'N/A'),
            "author": ", ".join(item.get('author', [])),
            "year": item.get('publicationdateyear'),
            "journal": item.get('source'),
            "abstract": item.get('description', 'Abstrak tidak tersedia.'),
            "pdfUrl": item.get('url') if 'pdf' in item.get('url', '') else None,
            "doi": None
        })
    return results

def search_pubmed(keywords, year=None):
    """Mencari referensi dari PubMed API."""
    print(f"Mencari di PubMed dengan keywords: {keywords}")
    api_key = os.getenv("PUBMED_API_KEY")
    if not api_key: 
        print("Peringatan: PUBMED_API_KEY tidak ditemukan.")
        return []
    
    # PERBAIKAN: Ganti koma dengan "AND"
    term = keywords.replace(",", " AND ")
    
    if year:
        term += f" AND (\"{year}\"[Date - Publication] : \"3000\"[Date - Publication])"

    base_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/"
    search_url = f"{base_url}esearch.fcgi"
    params = {'db': 'pubmed', 'term': term, 'retmax': 10, 'retmode': 'json', 'api_key': api_key}
    search_response = make_api_request_with_retry(search_url, headers={}, params=params)
    if not search_response: return []

    ids = search_response.json().get('esearchresult', {}).get('idlist', [])
    if not ids: return []

    summary_url = f"{base_url}esummary.fcgi"
    params = {'db': 'pubmed', 'id': ",".join(ids), 'retmode': 'json', 'api_key': api_key}
    summary_response = make_api_request_with_retry(summary_url, headers={}, params=params)
    if not summary_response: return []

    results = []
    for uid, data in summary_response.json().get('result', {}).items():
        if uid == 'uids': continue

        authors = [author['name'] for author in data.get('authors', [])]
        doi = next((articleid['value'] for articleid in data.get('articleids', []) if articleid.get('idtype') == 'doi'), None)

        results.append({
            "id": f"pubmed_{uid}",
            "title": data.get('title', 'N/A'),
            "author": ", ".join(authors),
            "year": data.get('pubdate', '').split(' ')[0],
            "journal": data.get('source'),
            "abstract": "Abstrak tidak tersedia dari API ringkasan PubMed. Perlu diakses via DOI.",
            "pdfUrl": None,
            "doi": doi
        })
    return results

def unified_search(sources, query, year):
    """Menjalankan pencarian terpadu ke berbagai sumber secara paralel."""
    all_references = []
    search_functions = {
        'core': search_core,
        'crossref': search_crossref,
        'openalex': search_openalex,
        'doaj': search_doaj,
        'eric': search_eric,
        'pubmed': search_pubmed,
    }

    with ThreadPoolExecutor(max_workers=len(sources)) as executor:
        future_to_source = {
            executor.submit(search_functions[source], query, year): source 
            for source in sources if source in search_functions
        }
        for future in future_to_source:
            source = future_to_source[future]
            try:
                result_data = future.result()
                if result_data:
                    all_references.extend(result_data)
            except Exception as exc:
                print(f'{source} generated an exception: {exc}')

    # Dedup references based on title and DOI
    unique_references = []
    seen_identifiers = set()
    for ref in all_references:
        # Create a unique identifier for each reference
        title_norm = re.sub(r'\W+', '', (ref.get('title') or '').lower())
        identifier = ref.get('doi') or title_norm[:50] # Use DOI if available, else normalized title
        
        if identifier and identifier not in seen_identifiers:
            unique_references.append(ref)
            seen_identifiers.add(identifier)
            
    return unique_references