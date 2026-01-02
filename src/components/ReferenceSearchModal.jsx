import React, { useState, useEffect, useRef } from 'react';
import { 
    X, Search, Globe, Plus, Check, Loader2, 
    Filter, BookOpen, PenTool, Upload, Database, 
    AlertCircle, FileQuestion, ExternalLink, Calendar, User
} from 'lucide-react';

export default function ReferenceSearchModal({ isOpen, onClose, onReferenceAdded }) {
    const [activeTab, setActiveTab] = useState('search'); 
    
    // STATE SEARCH
    const [query, setQuery] = useState('');
    const [yearFilter, setYearFilter] = useState('');
    const [selectedSources, setSelectedSources] = useState(['crossref', 'doaj', 'openalex', 'semanticscholar', 'pubmed']);
    const [searchResults, setSearchResults] = useState([]);
    
    // UI State
    const [isSearching, setIsSearching] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);

    // FILTER OPTIONS
    const SOURCES = [
        { id: 'crossref', label: 'Crossref', color: 'text-orange-400 border-orange-500/30 bg-orange-500/10' },
        { id: 'doaj', label: 'DOAJ', color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
        { id: 'openalex', label: 'OpenAlex', color: 'text-blue-400 border-blue-500/30 bg-blue-500/10' },
        { id: 'semanticscholar', label: 'Semantic', color: 'text-indigo-400 border-indigo-500/30 bg-indigo-500/10' },
        { id: 'pubmed', label: 'PubMed', color: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10' }
    ];

    // STATE MANUAL & UPLOAD
    const [manualForm, setManualForm] = useState({ title: '', author: '', year: '', journal: '', doi: '' });
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            // Optional: Reset query if needed
        }
    }, [isOpen]);

    if (!isOpen) return null;

    // --- SEARCH LOGIC ---
    const handleSearch = async () => {
        if (!query.trim()) return;
        setIsSearching(true);
        setHasSearched(true);
        setSearchResults([]); 

        const payload = { 
            query: query.trim(), 
            sources: selectedSources.length > 0 ? selectedSources : ['crossref', 'doaj', 'openalex'], 
            year: yearFilter ? String(yearFilter) : "" 
        };

        try {
            const res = await fetch('/api/unified-search-references', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            
            if (data.results && Array.isArray(data.results)) {
                setSearchResults(data.results);
            } else {
                setSearchResults([]);
            }
        } catch (err) {
            console.error("Fetch Error:", err);
        } finally {
            setIsSearching(false);
        }
    };

    const toggleSource = (id) => {
        setSelectedSources(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
    };

    // --- RENDER HELPER: BADGE SUMBER (FIXED CRASH) ---
    const getSourceBadge = (sourceName) => {
        // SAFETY CHECK: Jika sourceName kosong/undefined, beri default
        if (!sourceName) {
            return (
                <span className="text-[9px] px-2 py-0.5 rounded border font-bold uppercase tracking-wider text-slate-400 border-slate-700 bg-slate-800">
                    UNKNOWN
                </span>
            );
        }

        const lowerName = sourceName.toString().toLowerCase(); // Pastikan string dan lowercase
        
        const src = SOURCES.find(s => s.id === lowerName) || 
                   SOURCES.find(s => s.label.toLowerCase() === lowerName);
        
        const styleClass = src ? src.color : 'text-slate-400 border-slate-700 bg-slate-800';
        
        return (
            <span className={`text-[9px] px-2 py-0.5 rounded border font-bold uppercase tracking-wider ${styleClass}`}>
                {sourceName}
            </span>
        );
    };

    // --- MANUAL HANDLERS ---
    const handleManualSubmit = () => {
        if (!manualForm.title) return alert("Judul wajib diisi.");
        onReferenceAdded({ ...manualForm, source: 'Manual' });
        alert("Disimpan!");
        setManualForm({ title: '', author: '', year: '', journal: '', doi: '' });
    };

    // --- UPLOAD HANDLERS ---
    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setIsUploading(true);
        const formData = new FormData();
        formData.append('document', file); 

        try {
            const res = await fetch('/api/extract-pdf-simple', { method: 'POST', body: formData });
            const data = await res.json();
            if (data.status === 'success') {
                const newRef = {
                    title: file.name.replace('.pdf', ''),
                    author: 'Extracted PDF',
                    year: new Date().getFullYear().toString(),
                    source: 'PDF Upload',
                    abstract: (data.data.content || "").substring(0, 200) + "..."
                };
                onReferenceAdded(newRef);
                alert("Berhasil!");
                setActiveTab('search'); 
            } else {
                alert("Gagal proses PDF.");
            }
        } catch { alert("Error upload."); } finally { setIsUploading(false); }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-[#131418] w-full max-w-5xl h-[90vh] rounded-3xl border border-[#2A2D36] shadow-2xl flex flex-col overflow-hidden font-sans selection:bg-[#6C5DD3]/30">
                
                {/* 1. HEADER PRESISI */}
                <div className="px-6 py-4 border-b border-[#2A2D36] bg-[#181A20] flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[#6C5DD3]/10 flex items-center justify-center border border-[#6C5DD3]/20">
                            <Database className="text-[#6C5DD3]" size={16}/>
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-white tracking-wide">Research Knowledge Base</h2>
                            <p className="text-[10px] text-slate-500">Pusat pencarian referensi akademik global</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-[#2A2D36] text-slate-400 hover:text-white transition-all">
                        <X size={18}/>
                    </button>
                </div>

                {/* 2. NAVIGATION TABS */}
                <div className="flex px-6 border-b border-[#2A2D36] bg-[#181A20] gap-8 shrink-0">
                    {[
                        { id: 'search', label: 'Cari Online', icon: Globe },
                        { id: 'manual', label: 'Input Manual', icon: PenTool },
                        { id: 'upload', label: 'Upload PDF', icon: Upload }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 py-4 text-[11px] font-bold uppercase tracking-wider border-b-[2px] transition-all ${
                                activeTab === tab.id 
                                ? 'border-[#6C5DD3] text-[#6C5DD3]' 
                                : 'border-transparent text-slate-500 hover:text-slate-300'
                            }`}
                        >
                            <tab.icon size={14} strokeWidth={2.5}/> {tab.label}
                        </button>
                    ))}
                </div>

                {/* 3. CONTENT AREA */}
                <div className="flex-1 overflow-hidden bg-[#0D0E12] relative">
                    
                    {/* === VIEW: SEARCH === */}
                    {activeTab === 'search' && (
                        <div className="h-full flex flex-col">
                            
                            {/* Search Controls */}
                            <div className="p-6 border-b border-[#2A2D36] bg-[#131418] space-y-5 shrink-0">
                                <div className="flex gap-3">
                                    <div className="relative flex-1 group">
                                        <Search className="absolute left-4 top-3.5 text-slate-500 group-focus-within:text-[#6C5DD3] transition-colors" size={18}/>
                                        <input 
                                            type="text" 
                                            className="w-full bg-[#0D0E12] border border-[#2A2D36] rounded-xl pl-12 pr-4 py-3 text-sm text-white focus:border-[#6C5DD3] focus:ring-1 focus:ring-[#6C5DD3] outline-none placeholder:text-slate-600 transition-all shadow-inner"
                                            placeholder="Masukkan topik riset, judul jurnal, atau DOI..."
                                            value={query}
                                            onChange={(e) => setQuery(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                            autoFocus
                                        />
                                    </div>
                                    <button 
                                        onClick={handleSearch}
                                        disabled={isSearching}
                                        className="px-8 bg-[#6C5DD3] hover:bg-[#5a4cb8] text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2 disabled:opacity-50 shadow-lg shadow-[#6C5DD3]/20 hover:shadow-[#6C5DD3]/40 active:scale-95"
                                    >
                                        {isSearching ? <Loader2 className="animate-spin" size={16}/> : 'Cari'}
                                    </button>
                                </div>

                                <div className="flex flex-wrap items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                                            <Filter size={10}/> Sumber:
                                        </span>
                                        <div className="flex gap-2">
                                            {SOURCES.map(src => (
                                                <button
                                                    key={src.id}
                                                    onClick={() => toggleSource(src.id)}
                                                    className={`px-2.5 py-1 rounded-[6px] text-[10px] font-bold border transition-all ${
                                                        selectedSources.includes(src.id)
                                                        ? src.color
                                                        : 'bg-transparent text-slate-600 border-[#2A2D36] hover:border-slate-500'
                                                    }`}
                                                >
                                                    {src.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold text-slate-500 uppercase">Tahun Min:</span>
                                        <select 
                                            value={yearFilter}
                                            onChange={(e) => setYearFilter(e.target.value)}
                                            className="bg-[#0D0E12] border border-[#2A2D36] text-[11px] text-white rounded-lg px-3 py-1 outline-none cursor-pointer hover:border-[#6C5DD3] focus:border-[#6C5DD3]"
                                        >
                                            <option value="">Semua Tahun</option>
                                            {Array.from({length: 20}, (_, i) => new Date().getFullYear() - i).map(y => (
                                                <option key={y} value={y}>{y}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Results List - PRECISE RENDERING */}
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
                                {isSearching ? (
                                    <div className="flex flex-col items-center justify-center h-full text-slate-500 space-y-4">
                                        <div className="relative">
                                            <div className="w-12 h-12 border-4 border-[#2A2D36] rounded-full"></div>
                                            <div className="w-12 h-12 border-4 border-[#6C5DD3] border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
                                        </div>
                                        <p className="text-xs font-mono tracking-widest text-[#6C5DD3]">SEARCHING DATABASE...</p>
                                    </div>
                                ) : searchResults.length > 0 ? (
                                    searchResults.map((item, idx) => (
                                        <div 
                                            key={idx} 
                                            className="group bg-[#181A20] border border-[#2A2D36] rounded-xl p-5 hover:border-[#6C5DD3] hover:shadow-[0_4px_20px_rgba(108,93,211,0.1)] transition-all duration-300 relative flex flex-col gap-3"
                                            style={{animation: `fadeIn 0.3s ease-out forwards`, animationDelay: `${idx * 50}ms`, opacity: 0}}
                                        >
                                            {/* Top Row: Title & Source */}
                                            <div className="flex justify-between items-start gap-4">
                                                <h4 className="text-[15px] font-semibold text-white leading-snug group-hover:text-[#6C5DD3] transition-colors line-clamp-2">
                                                    {item.title || "Dokumen Tanpa Judul"}
                                                </h4>
                                                <div className="shrink-0 pt-0.5">
                                                    {getSourceBadge(item.source)}
                                                </div>
                                            </div>

                                            {/* Meta Row: Author, Year, Journal */}
                                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-slate-400">
                                                <div className="flex items-center gap-1.5">
                                                    <User size={12} className="text-[#6C5DD3]"/>
                                                    <span className="font-medium text-slate-300">{item.author || "Penulis Tidak Diketahui"}</span>
                                                </div>
                                                <div className="w-1 h-1 rounded-full bg-slate-600"></div>
                                                <div className="flex items-center gap-1.5">
                                                    <Calendar size={12} className="text-slate-500"/>
                                                    <span className="font-mono text-slate-300">
                                                        {item.year && item.year !== 'n.d.' ? item.year : 'Tahun N/A'}
                                                    </span>
                                                </div>
                                                {item.journal && (
                                                    <>
                                                        <div className="w-1 h-1 rounded-full bg-slate-600"></div>
                                                        <span className="italic text-slate-500 truncate max-w-[200px]">{item.journal}</span>
                                                    </>
                                                )}
                                            </div>

                                            {/* Abstract Section (Smart Fallback) */}
                                            <div className="mt-1">
                                                {item.abstract && item.abstract !== 'None' && item.abstract.length > 10 ? (
                                                    <p className="text-[12px] text-slate-400 leading-relaxed line-clamp-3 pl-3 border-l-2 border-[#2A2D36] group-hover:border-[#6C5DD3]/50 transition-colors">
                                                        {item.abstract}
                                                    </p>
                                                ) : (
                                                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#131418] border border-[#2A2D36] border-dashed">
                                                        <FileQuestion size={14} className="text-slate-600"/>
                                                        <span className="text-[10px] text-slate-500 italic">Preview abstrak tidak tersedia di database sumber.</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Actions Footer */}
                                            <div className="flex items-center justify-between pt-3 border-t border-[#2A2D36]/50 mt-1">
                                                <div className="flex gap-2">
                                                    {item.doi && (
                                                        <a href={`https://doi.org/${item.doi}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-[#6C5DD3] transition-colors">
                                                            <ExternalLink size={10}/> DOI: {item.doi}
                                                        </a>
                                                    )}
                                                </div>
                                                <button 
                                                    onClick={() => onReferenceAdded(item)}
                                                    className="flex items-center gap-2 px-4 py-2 bg-[#2A2D36] hover:bg-[#6C5DD3] text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all shadow-md hover:shadow-lg active:scale-95"
                                                >
                                                    <Plus size={12} strokeWidth={3}/> Tambahkan
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                ) : hasSearched ? (
                                    <div className="flex flex-col items-center justify-center h-full text-slate-500">
                                        <div className="bg-[#181A20] p-4 rounded-full mb-3 border border-[#2A2D36]">
                                            <AlertCircle size={24} className="text-slate-600"/>
                                        </div>
                                        <p className="text-sm font-medium">Tidak ditemukan hasil untuk "{query}"</p>
                                        <p className="text-xs mt-1 text-slate-600">Coba ubah kata kunci atau hilangkan filter tahun.</p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-slate-600 opacity-40">
                                        <Globe size={64} strokeWidth={1} className="mb-4 text-[#2A2D36]"/>
                                        <p className="text-sm font-medium text-slate-500">Mulai eksplorasi referensi global.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* === VIEW: MANUAL === */}
                    {activeTab === 'manual' && (
                        <div className="p-10 max-w-2xl mx-auto h-full overflow-y-auto custom-scrollbar">
                            <div className="space-y-6">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Judul Dokumen <span className="text-red-500">*</span></label>
                                    <input className="w-full bg-[#131418] border border-[#2A2D36] rounded-xl p-4 text-sm text-white focus:border-[#6C5DD3] outline-none transition-all" 
                                        placeholder="Ketik judul lengkap..." value={manualForm.title} onChange={e => setManualForm({...manualForm, title: e.target.value})}/>
                                </div>
                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Penulis Utama</label>
                                        <input className="w-full bg-[#131418] border border-[#2A2D36] rounded-xl p-4 text-sm text-white focus:border-[#6C5DD3] outline-none" 
                                            placeholder="Nama Penulis" value={manualForm.author} onChange={e => setManualForm({...manualForm, author: e.target.value})}/>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Tahun Terbit</label>
                                        <input type="number" className="w-full bg-[#131418] border border-[#2A2D36] rounded-xl p-4 text-sm text-white focus:border-[#6C5DD3] outline-none" 
                                            placeholder="2024" value={manualForm.year} onChange={e => setManualForm({...manualForm, year: e.target.value})}/>
                                    </div>
                                </div>
                                <button onClick={handleManualSubmit} className="w-full py-4 bg-[#6C5DD3] hover:bg-[#5a4cb8] text-white rounded-xl font-bold uppercase tracking-widest text-xs mt-8 transition-all shadow-lg hover:shadow-[#6C5DD3]/20">Simpan ke Library</button>
                            </div>
                        </div>
                    )}

                    {/* === VIEW: UPLOAD === */}
                    {activeTab === 'upload' && (
                        <div className="h-full flex flex-col items-center justify-center p-10">
                            <div 
                                onClick={() => !isUploading && fileInputRef.current.click()}
                                className={`w-full max-w-lg h-80 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center cursor-pointer transition-all duration-300 group ${
                                    isUploading 
                                    ? 'border-[#6C5DD3] bg-[#6C5DD3]/5' 
                                    : 'border-[#2A2D36] hover:border-[#6C5DD3] hover:bg-[#181A20]'
                                }`}
                            >
                                <input type="file" ref={fileInputRef} className="hidden" accept="application/pdf" onChange={handleFileUpload} disabled={isUploading}/>
                                {isUploading ? (
                                    <Loader2 className="w-16 h-16 text-[#6C5DD3] animate-spin mb-6"/>
                                ) : (
                                    <div className="bg-[#131418] p-6 rounded-full border border-[#2A2D36] mb-6 group-hover:border-[#6C5DD3] group-hover:scale-110 transition-all">
                                        <Upload className="w-10 h-10 text-slate-500 group-hover:text-[#6C5DD3]"/>
                                    </div>
                                )}
                                <h3 className="text-lg font-bold text-white mb-2">{isUploading ? 'Analyzing PDF...' : 'Upload Jurnal PDF'}</h3>
                                <p className="text-xs text-slate-500">Drag & drop atau klik untuk upload</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            
            {/* INJECT ANIMATION CSS */}
            <style>{`
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>
        </div>
    );
}