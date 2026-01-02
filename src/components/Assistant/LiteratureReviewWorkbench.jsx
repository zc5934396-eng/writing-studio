import React, { useState, useEffect } from 'react';
import { 
    Library, Sparkles, RefreshCw, RotateCcw, 
    FileText, ArrowDownToLine, Play, Bot, AlertCircle 
} from 'lucide-react';
import { useToast } from '../UI/ToastProvider.jsx';
import { useProject } from '../../context/ProjectContext.jsx'; 
import { api } from '../../api/client.js'; 

// Helper Session (Supaya data gak hilang pas refresh)
function useSessionState(key, defaultValue) {
    const [state, setState] = useState(() => {
        try {
            const saved = sessionStorage.getItem(key);
            return saved ? JSON.parse(saved) : defaultValue;
        } catch (e) { return defaultValue; }
    });
    useEffect(() => {
        sessionStorage.setItem(key, JSON.stringify(state));
    }, [key, state]);
    return [state, setState];
}

export default function LiteratureReviewWorkbench({
    topic, setTopic, onInsert
}) {
    const { addToast } = useToast();
    
    // Ambil Referensi dari Project Context (Untuk dikirim ke AI)
    const { project } = useProject(); 
    const savedReferences = project?.references || [];

    // STATE UTAMA
    const [outline, setOutline] = useSessionState('onthesis_bab2_outline', []);
    const [isLoadingOutline, setIsLoadingOutline] = useState(false);
    
    // CONTENT STATE
    const [generatedContent, setGeneratedContent] = useSessionState('onthesis_bab2_content', {});
    const [loadingSubChapter, setLoadingSubChapter] = useState(null); // ID sub-bab yang lagi digenerate

    // --- HELPER: PARSER AGRESIF ---
    // Mencoba mengekstrak struktur outline dari teks mentah jika JSON gagal
    const parseRefinedOutline = (rawText) => {
        const lines = rawText.split('\n');
        const extracted = [];
        let currentSub = null;

        const subBabRegex = /^(2\.\d+)\s+(.+)/; // Match "2.1 Landasan Teori"
        const boldRegex = /^\*\*(.+)\*\*$/;      // Match "**Judul**"

        lines.forEach(line => {
            const cleanLine = line.trim();
            if (!cleanLine) return;

            // Cek apakah ini judul sub-bab
            const subMatch = cleanLine.match(subBabRegex);
            const boldMatch = cleanLine.match(boldRegex);

            if (subMatch) {
                // Format: 2.1 Judul
                currentSub = { sub_bab: cleanLine, poin_pembahasan: [] };
                extracted.push(currentSub);
            } else if (boldMatch && (cleanLine.includes("Landasan") || cleanLine.includes("Teori") || cleanLine.includes("Penelitian"))) {
                // Format: **Landasan Teori**
                currentSub = { sub_bab: boldMatch[1], poin_pembahasan: [] };
                extracted.push(currentSub);
            } else if (currentSub && (cleanLine.startsWith('-') || cleanLine.startsWith('*') || cleanLine.startsWith('+'))) {
                // Ini poin pembahasan
                currentSub.poin_pembahasan.push(cleanLine.replace(/^[-*+]\s+/, ''));
            }
        });

        return extracted;
    };

    // --- 1. GENERATE OUTLINE ---
    const handleGenerateOutline = async () => {
        const judul = topic || project?.title;
        if (!judul) {
            addToast("Judul Penelitian wajib diisi!", "error");
            return;
        }

        setIsLoadingOutline(true);
        setOutline([]); // Reset
        
        try {
            console.log("Generating outline for:", judul);
            
            // Panggil API
            const response = await api.post('/api/generate-outline', {
                judul_penelitian: judul,
                methodology: project?.methodology || 'Kualitatif'
            });

            console.log("Outline Response Raw:", response); // DEBUG LOG

            // FIX: Normalisasi Data Outline agar Frontend tidak crash
            let cleanData = [];
            
            // Prioritas 1: Jika response itu sendiri adalah array (Ideal)
            if (Array.isArray(response)) {
                cleanData = response;
            }
            // Prioritas 2: Jika response.data adalah array (Standard API)
            else if (response.data && Array.isArray(response.data)) {
                cleanData = response.data;
            }
            // Prioritas 3: Format Legacy/Fallback JSON Object
            else if (response.outline) {
                if (Array.isArray(response.outline)) {
                    cleanData = response.outline;
                } else if (typeof response.outline === 'object') {
                    cleanData = Object.keys(response.outline).map(key => ({
                        sub_bab: key,
                        poin_pembahasan: response.outline[key]
                    }));
                }
            }
            
            // --- EMERGENCY FALLBACK: TEXT PARSING ---
            // Jika backend mengirim string teks panjang (draft skripsi)
            if ((!cleanData || cleanData.length === 0) && typeof response === 'string') {
                console.warn("Backend return string. Attempting manual parse...");
                
                // Coba parse manual dari teks
                const parsedManual = parseRefinedOutline(response);
                
                if (parsedManual.length > 0) {
                    cleanData = parsedManual;
                    addToast("Outline diekstrak dari teks narasi.", "success");
                } else {
                    // Jika gagal total, tampilkan sebagai satu blok teks untuk direview
                    cleanData = [{
                        sub_bab: "Review Manual (Format AI Tidak Standar)",
                        poin_pembahasan: ["AI memberikan teks narasi panjang.", "Klik 'Tulis' untuk melihat isinya."],
                        raw_content: response // Simpan konten asli
                    }];
                    // Simpan konten asli ke state content agar bisa langsung ditampilkan
                    setGeneratedContent(prev => ({
                        ...prev,
                        "Review Manual (Format AI Tidak Standar)": response
                    }));
                }
            }

            console.log("Cleaned Outline Data:", cleanData);

            // Validasi Akhir
            if (!cleanData || cleanData.length === 0) {
                // Jika masih kosong juga, buat item placeholder
                cleanData = [
                    { sub_bab: "2.1 Landasan Teori", poin_pembahasan: ["Definisi Variabel Utama", "Indikator Variabel"] },
                    { sub_bab: "2.2 Penelitian Terdahulu", poin_pembahasan: ["Studi Relevan 1", "Studi Relevan 2"] },
                    { sub_bab: "2.3 Kerangka Berpikir", poin_pembahasan: ["Hubungan Antar Variabel"] }
                ];
                addToast("Gagal memuat outline otomatis. Menggunakan template default.", "error");
            }

            setOutline(cleanData);

        } catch (error) {
            console.error("Outline Error Details:", error);
            addToast("Terjadi kesalahan sistem.", "error");
            // Fallback default agar UI tidak kosong
            setOutline([
                { sub_bab: "2.1 Landasan Teori", poin_pembahasan: ["Definisi Variabel"] },
                { sub_bab: "2.2 Penelitian Terdahulu", poin_pembahasan: ["Review Jurnal"] }
            ]);
        } finally {
            setIsLoadingOutline(false);
        }
    };

    // --- 2. GENERATE CONTENT PER SUB-BAB ---
    const handleGenerateContent = async (subBabItem) => {
        if (loadingSubChapter) return;
        
        // Cek jika kita sudah punya raw_content dari fallback
        if (subBabItem.raw_content) {
            addToast("Menampilkan konten yang sudah ada.", "success");
            return;
        }
        
        setLoadingSubChapter(subBabItem.sub_bab);
        
        try {
            // Siapkan Referensi
            const refList = savedReferences.map(r => 
                `- ${r.author} (${r.year}): ${r.title}`
            ).join("\n");

            const payload = {
                task: 'content_specific', 
                data: {
                    sub_bab: subBabItem.sub_bab,
                    points: subBabItem.poin_pembahasan,
                    context_material: refList,
                    context_title: project?.title,
                    context_method: project?.methodology
                }
            };

            setGeneratedContent(prev => ({
                ...prev,
                [subBabItem.sub_bab]: "" // Reset konten lama
            }));

            const response = await fetch('/api/writing-assistant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.body) throw new Error("No stream body");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                
                setGeneratedContent(prev => ({
                    ...prev,
                    [subBabItem.sub_bab]: (prev[subBabItem.sub_bab] || "") + chunk
                }));
            }

        } catch (error) {
            console.error("Generate Content Error:", error);
            addToast("Gagal menulis konten.", "error");
        } finally {
            setLoadingSubChapter(null);
        }
    };

    return (
        <div className="h-full flex flex-col bg-[#16181D]">
            {/* Header */}
            <div className="p-4 border-b border-white/5 bg-[#1C1E24]">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Library size={16} className="text-[#6C5DD3]"/> 
                    Literature Review Workbench
                </h3>
                <p className="text-[10px] text-slate-400 mt-1">
                    Generator Bab 2 Otomatis: Menyusun kerangka teori berdasarkan judul & referensi Anda.
                </p>
            </div>

            {/* Input Judul */}
            <div className="p-4 border-b border-white/5 bg-[#16181D]">
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        value={topic || project?.title || ''}
                        onChange={(e) => setTopic && setTopic(e.target.value)}
                        placeholder="Judul Penelitian / Variabel Utama..."
                        className="flex-1 bg-[#0D0F12] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:border-[#6C5DD3] outline-none"
                    />
                    <button 
                        onClick={handleGenerateOutline}
                        disabled={isLoadingOutline}
                        className="bg-[#6C5DD3] hover:bg-[#5a4cb5] text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 disabled:opacity-50 transition-all"
                    >
                        {isLoadingOutline ? <RefreshCw className="animate-spin" size={14}/> : <Sparkles size={14}/>}
                        {outline.length > 0 ? 'Regenerate' : 'Susun Outline'}
                    </button>
                </div>
            </div>

            {/* Main Workspace */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
                
                {/* Empty State */}
                {outline.length === 0 && !isLoadingOutline && (
                    <div className="text-center py-10 opacity-50">
                        <Bot size={40} className="mx-auto mb-2 text-slate-600"/>
                        <p className="text-xs text-slate-500">Belum ada outline. Masukkan judul & klik 'Susun Outline'.</p>
                    </div>
                )}

                {/* Loading State */}
                {isLoadingOutline && (
                    <div className="space-y-3 animate-pulse">
                        {[1,2,3].map(i => (
                            <div key={i} className="h-20 bg-[#1C1E24] rounded-xl border border-white/5"></div>
                        ))}
                    </div>
                )}

                {/* Outline List */}
                {outline.map((item, idx) => {
                    const contentText = generatedContent[item.sub_bab];
                    const isGenerating = loadingSubChapter === item.sub_bab;
                    const hasContent = !!contentText;

                    return (
                        <React.Fragment key={idx}>
                            {/* Connector Line */}
                            {idx > 0 && <div className="w-0.5 h-4 bg-white/5 mx-auto"></div>}

                            <div className={`rounded-xl border transition-all ${hasContent ? 'bg-[#1C1E24] border-[#6C5DD3]/30' : 'bg-[#16181D] border-white/10 hover:border-white/20'}`}>
                                
                                {/* Header Card */}
                                <div className="p-3 flex items-start justify-between gap-4">
                                    <div className="flex items-start gap-3">
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 ${hasContent ? 'bg-[#6C5DD3] text-white' : 'bg-[#252830] text-slate-500'}`}>
                                            {idx + 1}
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-bold text-slate-200">{item.sub_bab}</h4>
                                            <ul className="mt-1 space-y-0.5">
                                                {item.poin_pembahasan && item.poin_pembahasan.map((pt, pIdx) => (
                                                    <li key={pIdx} className="text-[10px] text-slate-500 flex items-center gap-1.5">
                                                        <span className="w-1 h-1 rounded-full bg-slate-600"></span>
                                                        {typeof pt === 'string' ? pt : JSON.stringify(pt)}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>

                                    {/* Action Button */}
                                    {!hasContent && !isGenerating && !item.raw_content && (
                                        <button 
                                            onClick={() => handleGenerateContent(item)}
                                            className="px-3 py-1.5 bg-[#252830] hover:bg-[#6C5DD3] text-slate-400 hover:text-white rounded-lg text-[10px] font-bold transition-colors flex items-center gap-2 shrink-0"
                                        >
                                            <Play size={12} fill="currentColor"/> Tulis
                                        </button>
                                    )}
                                </div>

                                {/* Content Area (Jika sudah digenerate) */}
                                {(hasContent || isGenerating) && (
                                    <div className="border-t border-white/5 bg-[#0F1115]/50 rounded-b-xl relative group">
                                        
                                        {/* Toolbar Insert (Floating) */}
                                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                                            {isGenerating ? (
                                                <span className="text-[10px] text-[#6C5DD3] bg-[#6C5DD3]/10 px-2 py-1 rounded-md flex items-center gap-1">
                                                    <RefreshCw size={10} className="animate-spin"/> Menulis...
                                                </span>
                                            ) : (
                                                <button 
                                                    onClick={() => onInsert && onInsert(contentText)}
                                                    className="bg-[#6C5DD3] hover:bg-[#5a4cb5] text-white px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 shadow-lg"
                                                >
                                                    <ArrowDownToLine size={12}/> Insert ke Editor
                                                </button>
                                            )}
                                        </div>

                                        {/* Konten Teks */}
                                        <div className="p-4 prose prose-invert prose-sm text-xs text-slate-300 leading-relaxed max-h-[300px] overflow-y-auto custom-scrollbar">
                                            {isGenerating ? (
                                                <div className="flex flex-col items-center justify-center py-8 text-slate-500 gap-2 opacity-50">
                                                    <Sparkles className="animate-pulse" size={24}/>
                                                    <p>AI sedang berpikir & menyusun narasi...</p>
                                                </div>
                                            ) : (
                                                <div dangerouslySetInnerHTML={{ __html: contentText.replace(/\n/g, '<br/>') }} />
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
}