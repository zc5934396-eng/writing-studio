import React, { useState, useEffect } from 'react';
import { 
    Library, Sparkles, RefreshCw, Play, 
    ArrowDownToLine, Trash2, CheckCircle2, BookOpen
} from 'lucide-react';
import { useToast } from '../../../UI/ToastProvider';

// Helper: Session Storage agar data tidak hilang saat refresh
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

const LiteratureWorkbench = ({ context, onInsert }) => {
    const { addToast } = useToast();
    
    // STATE
    const [topic, setTopic] = useState(context.title || '');
    const [outline, setOutline] = useSessionState(`onthesis_outline_${context.id}`, []);
    const [contents, setContents] = useSessionState(`onthesis_content_${context.id}`, {});
    
    // Loading States
    const [isGeneratingOutline, setIsGeneratingOutline] = useState(false);
    const [loadingSubId, setLoadingSubId] = useState(null); // ID sub-bab yang sedang ditulis AI

    // 1. GENERATE OUTLINE (JSON Structure)
    const handleGenerateOutline = async () => {
        if (!topic.trim()) return addToast("Topik/Judul harus diisi!", "error");
        
        setIsGeneratingOutline(true);
        setOutline([]); // Reset
        
        try {
            const response = await fetch('/api/generate-outline', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    judul_penelitian: topic,
                    methodology: context.methodology || 'Kualitatif' // Default
                })
            });

            const data = await response.json();
            
            // Normalisasi Output (Backend kadang kirim array langsung, kadang object)
            let rawOutline = [];
            if (Array.isArray(data)) rawOutline = data;
            else if (data.outline) rawOutline = Array.isArray(data.outline) ? data.outline : [];
            else if (data.data) rawOutline = data.data;

            if (rawOutline.length === 0) throw new Error("Format outline tidak dikenali");

            setOutline(rawOutline);
            addToast("Outline berhasil disusun!", "success");

        } catch (err) {
            console.error(err);
            addToast("Gagal menyusun outline. Coba lagi.", "error");
        } finally {
            setIsGeneratingOutline(false);
        }
    };

    // 2. GENERATE CONTENT PER SUB-BAB (Streaming)
    const handleGenerateSubChapter = async (subBabItem) => {
        const subId = subBabItem.sub_bab;
        setLoadingSubId(subId);
        
        // Reset konten lama item ini
        setContents(prev => ({ ...prev, [subId]: '' }));

        try {
            const response = await fetch('/api/writing-assistant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    task: 'literature_review', 
                    data: {
                        sub_task: 'content',
                        sub_topic: subBabItem.sub_bab,
                        context_title: topic,
                        // Kirim poin pembahasan sebagai konteks tambahan
                        context_material: `POIN PEMBAHASAN:\n- ${subBabItem.poin_pembahasan.join('\n- ')}`
                    }
                })
            });

            if (!response.body) throw new Error("Stream error");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                
                // Update State per Chunk
                setContents(prev => ({
                    ...prev,
                    [subId]: (prev[subId] || "") + chunk
                }));
            }

        } catch (err) {
            addToast(`Gagal generate ${subId}`, "error");
        } finally {
            setLoadingSubId(null);
        }
    };

    // 3. HELPER: INSERT ALL
    const handleInsertAll = () => {
        let fullText = "";
        outline.forEach(item => {
            const content = contents[item.sub_bab];
            if (content) {
                fullText += `<h3>${item.sub_bab}</h3>\n${content}\n\n`;
            }
        });
        
        if (!fullText) return addToast("Belum ada konten yang digenerate.", "error");
        
        // Kirim ke parent (Editor)
        // Kita pakai window event atau props onInsert jika ada
        if (onInsert) {
            onInsert(fullText);
        } else {
            // Fallback: Copy to clipboard
            navigator.clipboard.writeText(fullText);
            addToast("Konten disalin ke clipboard (Insert manual).", "success");
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-900 text-slate-100">
            {/* Header Input */}
            <div className="p-4 border-b border-slate-700 bg-slate-800/50">
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        placeholder="Judul Penelitian / Variabel Utama..."
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-purple-500 outline-none transition-colors"
                    />
                    <button 
                        onClick={handleGenerateOutline}
                        disabled={isGeneratingOutline}
                        className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isGeneratingOutline ? <RefreshCw className="animate-spin" size={16}/> : <Sparkles size={16}/>}
                        {outline.length > 0 ? 'Reset' : 'Susun Outline'}
                    </button>
                </div>
            </div>

            {/* Main Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
                
                {/* Empty State */}
                {outline.length === 0 && !isGeneratingOutline && (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-600 opacity-60">
                        <Library size={48} className="mb-4 text-purple-900/50"/>
                        <p className="text-sm">Masukkan topik untuk menyusun kerangka Bab 2.</p>
                    </div>
                )}

                {/* Loading Skeleton */}
                {isGeneratingOutline && (
                    <div className="space-y-4 animate-pulse">
                        <div className="h-16 bg-slate-800 rounded-xl"></div>
                        <div className="h-16 bg-slate-800 rounded-xl"></div>
                        <div className="h-16 bg-slate-800 rounded-xl"></div>
                    </div>
                )}

                {/* Outline Cards */}
                {outline.map((item, idx) => {
                    const content = contents[item.sub_bab];
                    const isWriting = loadingSubId === item.sub_bab;
                    
                    return (
                        <div key={idx} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-sm hover:border-purple-500/30 transition-all">
                            
                            {/* Card Header */}
                            <div className="p-4 flex items-start justify-between bg-slate-800/80">
                                <div>
                                    <h4 className="font-bold text-purple-300 text-sm flex items-center gap-2">
                                        <span className="bg-purple-900/50 text-purple-200 w-5 h-5 flex items-center justify-center rounded text-[10px]">{idx + 1}</span>
                                        {item.sub_bab}
                                    </h4>
                                    <ul className="mt-2 ml-7 list-disc text-[11px] text-slate-400 space-y-0.5">
                                        {item.poin_pembahasan.slice(0, 3).map((pt, i) => (
                                            <li key={i}>{pt}</li>
                                        ))}
                                    </ul>
                                </div>
                                
                                <button 
                                    onClick={() => handleGenerateSubChapter(item)}
                                    disabled={isWriting}
                                    className={`p-2 rounded-lg transition-colors ${
                                        content 
                                        ? 'bg-slate-700 text-green-400 hover:bg-slate-600' 
                                        : 'bg-purple-600 text-white hover:bg-purple-700'
                                    }`}
                                    title={content ? "Generate Ulang" : "Tulis Bagian Ini"}
                                >
                                    {isWriting ? <RefreshCw size={14} className="animate-spin"/> : (content ? <RefreshCw size={14}/> : <Play size={14} fill="currentColor"/>)}
                                </button>
                            </div>

                            {/* Content Output (Jika ada) */}
                            {(content || isWriting) && (
                                <div className="border-t border-slate-700/50 bg-slate-900/50 p-4 relative group">
                                    <div className="prose prose-invert prose-sm max-w-none text-xs leading-relaxed">
                                        <div dangerouslySetInnerHTML={{ __html: content }} />
                                        {isWriting && <span className="inline-block w-1.5 h-3 bg-purple-400 animate-pulse align-middle ml-1"/>}
                                    </div>
                                    
                                    {/* Mini Toolbar */}
                                    {content && !isWriting && (
                                        <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button 
                                                onClick={() => onInsert && onInsert(`<h3>${item.sub_bab}</h3>\n${content}`)}
                                                className="bg-purple-600 text-white px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 shadow-lg hover:bg-purple-500"
                                            >
                                                <ArrowDownToLine size={12}/> Insert
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Footer Action */}
            {outline.length > 0 && (
                <div className="p-4 border-t border-slate-700 bg-slate-800">
                    <button 
                        onClick={handleInsertAll}
                        className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-purple-900/20 transition-all"
                    >
                        <BookOpen size={16}/> Gabungkan & Masukkan Semua ke Editor
                    </button>
                </div>
            )}
        </div>
    );
};

export default LiteratureWorkbench;