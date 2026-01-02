import React, { useState } from 'react';
import { 
    FileText, Printer, Layers, ScanLine, 
    CheckCircle2, XCircle, AlertTriangle, RefreshCw, ArrowRight
} from 'lucide-react';
import CitationGraph from './CitationGraph';

export default function ToolsTab({ projectId, onInsert, onUpdateStyle, onExport, projectData, getEditorContent }) {
    const [tone, setTone] = useState('formal');
    const [auditResult, setAuditResult] = useState(null);
    const [isAuditing, setIsAuditing] = useState(false);
    
    // Pastikan references selalu array
    const references = projectData?.references || [];

    // ==========================================
    // LOGIKA AUDIT SITASI "GACOR" (Fuzzy Match)
    // ==========================================
    const runCitationAudit = () => {
        setIsAuditing(true);
        setTimeout(() => { 
            const htmlContent = getEditorContent ? getEditorContent() : '';
            
            // 1. Extract Text
            const tempDiv = document.createElement("div");
            tempDiv.innerHTML = htmlContent;
            const text = tempDiv.textContent || tempDiv.innerText || "";

            // 2. Regex Sitasi: Menangkap (Author, Year) atau Author (Year)
            const citationRegex = /([A-Z][a-zA-Z\s\.\-]+?)(?:et al\.?)?[\s,]*\(?(\d{4})\)?/g;
            
            const foundInText = new Set();
            let match;
            
            while ((match = citationRegex.exec(text)) !== null) {
                const rawName = match[1].trim().replace(/[\(\),]/g, '');
                const year = match[2];
                
                // Ambil kata terakhir sebagai "Last Name" prediksi dari teks
                // Contoh: "Budi Santoso" -> "santoso"
                const lastName = rawName.split(' ').pop().toLowerCase().replace(/[^a-z]/g, '');
                
                // Filter: Minimal 3 huruf untuk menghindari inisial atau kata sambung
                if (lastName.length >= 3) {
                    foundInText.add(`${lastName}-${year}`);
                }
            }

            // 3. LOGIKA PENCOCOKAN BARU (Smart Matching)
            const missingInBib = [];
            const matchedDbIndices = new Set(); // Lacak index referensi yg terpakai

            // A. Cek setiap sitasi di teks -> Apakah ada "Ayahnya" di Database?
            foundInText.forEach(citeKey => {
                const [textName, textYear] = citeKey.split('-');

                // Cari di array references
                const foundIndex = references.findIndex((ref, idx) => {
                    if (!ref.author || !ref.year) return false;
                    
                    const dbYear = String(ref.year).trim();
                    const dbAuthor = ref.author.toLowerCase();
                    
                    // SYARAT COCOK:
                    // 1. Tahun harus sama
                    // 2. Nama dari teks harus ada di dalam string author DB
                    //    Contoh: Text "schulkin" ada di DB "schulkin, j." -> MATCH!
                    return dbYear === textYear && dbAuthor.includes(textName);
                });

                if (foundIndex !== -1) {
                    matchedDbIndices.add(foundIndex); // Tandai ref ini sudah dipakai
                } else {
                    // Jika benar-benar tidak ketemu
                    const displayName = textName.charAt(0).toUpperCase() + textName.slice(1);
                    missingInBib.push(`${displayName} (${textYear})`);
                }
            });

            // B. Cari Unused (Yang ada di DB tapi indexnya gak pernah kena match)
            const unusedInText = references.filter((_, idx) => !matchedDbIndices.has(idx));

            setAuditResult({
                score: Math.max(0, 100 - (missingInBib.length * 20) - (unusedInText.length * 10)),
                missingInBib,
                unusedInText,
                totalCitations: foundInText.size,
                totalRefs: references.length
            });
            setIsAuditing(false);
        }, 800);
    };

    return (
        <div className="h-full flex flex-col bg-[#16181D]">
            
            {/* HEADER */}
            <div className="p-4 border-b border-[#252830] bg-[#1C1E24]">
                <h3 className="text-xs font-bold text-white uppercase flex items-center gap-2">
                    <Layers size={14} className="text-[#6C5DD3]"/> Research Toolkit
                </h3>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">

                {/* 1. CITATION GRAPH */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Smart Citation Map
                        </label>
                        <span className="text-[9px] bg-[#6C5DD3]/10 text-[#6C5DD3] px-1.5 py-0.5 rounded">
                            {references.length} Refs
                        </span>
                    </div>
                    <div className="h-[280px]">
                        <CitationGraph references={references} />
                    </div>
                </div>

                <div className="h-px bg-[#252830] w-full"></div>

                {/* 2. THE LIBRARIAN (AUDITOR) */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                            <ScanLine size={12}/> Reference Audit
                        </label>
                        {auditResult && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${auditResult.score === 100 ? 'bg-green-500 text-black' : 'bg-red-500 text-white'}`}>
                                Score: {auditResult.score}
                            </span>
                        )}
                    </div>
                    
                    {!auditResult ? (
                        <div className="bg-[#1C1E24] p-4 rounded-xl border border-[#252830] text-center">
                            <p className="text-[10px] text-slate-400 mb-3">
                                Cek sinkronisasi antara Sitasi di Teks vs Daftar Pustaka. Deteksi otomatis typo atau referensi yatim.
                            </p>
                            <button 
                                onClick={runCitationAudit}
                                disabled={isAuditing}
                                className="px-4 py-2 bg-[#6C5DD3] hover:bg-[#5a4cb8] text-white text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 mx-auto"
                            >
                                {isAuditing ? <RefreshCw size={12} className="animate-spin"/> : <ScanLine size={12}/>}
                                {isAuditing ? 'Scanning...' : 'Mulai Audit Pustaka'}
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
                            {/* HASIL 1: Missing in Bib (BAHAYA) */}
                            {auditResult.missingInBib.length > 0 ? (
                                <div className="bg-red-500/10 border border-red-500/30 p-3 rounded-lg">
                                    <div className="flex items-center gap-2 mb-2">
                                        <XCircle size={14} className="text-red-500"/>
                                        <span className="text-[10px] font-bold text-red-400 uppercase">Ada di Teks, Hilang di Dapus</span>
                                    </div>
                                    <ul className="list-disc list-inside space-y-1">
                                        {auditResult.missingInBib.map((name, i) => (
                                            <li key={i} className="text-[10px] text-slate-300 font-mono">{name}</li>
                                        ))}
                                    </ul>
                                </div>
                            ) : (
                                <div className="bg-green-500/10 border border-green-500/30 p-2 rounded-lg flex items-center gap-2">
                                    <CheckCircle2 size={14} className="text-green-500"/>
                                    <span className="text-[10px] font-bold text-green-400">Semua sitasi teks valid!</span>
                                </div>
                            )}

                            {/* HASIL 2: Unused Refs (Warning) */}
                            {auditResult.unusedInText.length > 0 ? (
                                <div className="bg-yellow-500/10 border border-yellow-500/30 p-3 rounded-lg">
                                    <div className="flex items-center gap-2 mb-2">
                                        <AlertTriangle size={14} className="text-yellow-500"/>
                                        <span className="text-[10px] font-bold text-yellow-400 uppercase">Ada di Dapus, Belum dipakai</span>
                                    </div>
                                    <div className="space-y-1 max-h-[150px] overflow-y-auto custom-scrollbar">
                                        {auditResult.unusedInText.map((ref, i) => (
                                            <div key={i} className="flex justify-between items-center text-[10px] text-slate-400 bg-black/20 p-1.5 rounded">
                                                <span className="truncate w-32">{ref.title}</span>
                                                <button 
                                                    onClick={() => onInsert(`(${ref.author ? ref.author.split(',')[0].split(' ').pop() : 'Anonim'}, ${ref.year})`)}
                                                    className="text-[#6C5DD3] hover:text-white flex items-center gap-1 shrink-0"
                                                >
                                                    Insert <ArrowRight size={10}/>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-blue-500/10 border border-blue-500/30 p-2 rounded-lg flex items-center gap-2">
                                    <CheckCircle2 size={14} className="text-blue-500"/>
                                    <span className="text-[10px] font-bold text-blue-400">Dapus efisien (semua terpakai).</span>
                                </div>
                            )}

                            <button onClick={runCitationAudit} className="w-full py-1.5 bg-[#252830] text-[10px] text-slate-400 hover:text-white rounded hover:bg-[#323642] transition-colors flex items-center justify-center gap-2">
                                <RefreshCw size={10}/> Scan Ulang
                            </button>
                        </div>
                    )}
                </div>

                <div className="h-px bg-[#252830] w-full"></div>

                {/* 3. EXPORT TOOLS */}
                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Document Actions</label>
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => onExport('word')} className="flex flex-col items-center justify-center p-3 bg-[#1C1E24] border border-[#252830] rounded-xl hover:border-[#6C5DD3] hover:bg-[#6C5DD3]/5 transition-all group">
                            <FileText size={20} className="text-blue-400 mb-2 group-hover:scale-110 transition-transform"/>
                            <span className="text-xs font-bold text-slate-300">MS Word</span>
                        </button>
                        <button onClick={() => onExport('pdf')} className="flex flex-col items-center justify-center p-3 bg-[#1C1E24] border border-[#252830] rounded-xl hover:border-red-500 hover:bg-red-500/5 transition-all group">
                            <Printer size={20} className="text-red-400 mb-2 group-hover:scale-110 transition-transform"/>
                            <span className="text-xs font-bold text-slate-300">PDF Print</span>
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}