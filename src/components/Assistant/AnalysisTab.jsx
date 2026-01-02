import React, { useState, useEffect } from 'react';
import { 
    BarChart2, ChevronRight, RefreshCw, Calendar, 
    FileText, CheckCircle2, AlertCircle, Search, Database 
} from 'lucide-react';
import { api } from '../../api/client';
import { toast } from 'react-hot-toast';

export default function AnalysisTab({ projectId, onInsert }) {
    
    // STATE
    const [history, setHistory] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    // 1. FETCH DATA (Saat Component Mount)
    const fetchHistory = async () => {
        setIsLoading(true);
        try {
            // Memanggil endpoint yang sudah ada di analysis_routes.py
            const res = await api.get('/api/my-analyses');
            if (res && res.history) {
                setHistory(res.history);
            }
        } catch (err) {
            console.error("Gagal ambil history:", err);
            toast.error("Gagal memuat riwayat analisis.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchHistory();
    }, []);

    // 2. HELPER: FORMAT TANGGAL
    const formatDate = (isoString) => {
        if (!isoString) return '-';
        return new Date(isoString).toLocaleDateString('id-ID', {
            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
        });
    };

    // 3. FILTER PENCARIAN
    const filteredHistory = history.filter(item => 
        item.analysis_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.filename?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // --- RENDER ---
    return (
        <div className="flex flex-col h-full bg-[#16181D]">
            
            {/* A. HEADER */}
            <div className="p-4 border-b border-white/5 bg-gradient-to-b from-[#1C1E24] to-[#16181D]">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-[#6C5DD3]">
                        <BarChart2 size={16} />
                        <span className="text-xs font-bold uppercase tracking-wider">DATA STUDIO LINK</span>
                    </div>
                    <button 
                        onClick={fetchHistory} 
                        className={`p-1.5 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors ${isLoading ? 'animate-spin' : ''}`}
                        title="Refresh Data"
                    >
                        <RefreshCw size={14} />
                    </button>
                </div>
                
                <h2 className="text-sm font-bold text-white mb-1">Hasil Analisis Data</h2>
                <p className="text-[10px] text-slate-400">
                    Pilih hasil olah data dari Data Studio untuk dimasukkan ke Bab 4.
                </p>

                {/* SEARCH BAR */}
                <div className="mt-3 relative">
                    <input 
                        type="text" 
                        placeholder="Cari (misal: Regresi, Uji T)..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-[#0D0F12] border border-white/10 rounded-xl py-2 pl-8 pr-3 text-xs text-slate-300 focus:outline-none focus:border-[#6C5DD3] transition-colors"
                    />
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500"/>
                </div>
            </div>

            {/* B. LIST CONTENT */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
                {isLoading ? (
                    // LOADING SKELETON
                    [1,2,3].map(i => (
                        <div key={i} className="h-20 bg-[#1C1E24] rounded-xl animate-pulse"></div>
                    ))
                ) : filteredHistory.length === 0 ? (
                    // EMPTY STATE
                    <div className="flex flex-col items-center justify-center h-40 text-slate-500 gap-2">
                        <Database size={24} className="opacity-50"/>
                        <p className="text-xs">Belum ada riwayat analisis.</p>
                        <a href="/data-analysis" className="text-[10px] text-[#6C5DD3] hover:underline">
                            Buka Data Studio
                        </a>
                    </div>
                ) : (
                    // DATA LIST
                    filteredHistory.map((item) => {
                        const isSelected = selectedItem?.id === item.id;
                        return (
                            <div 
                                key={item.id}
                                onClick={() => setSelectedItem(isSelected ? null : item)}
                                className={`group rounded-xl border transition-all cursor-pointer overflow-hidden ${
                                    isSelected 
                                    ? 'bg-[#1C1E24] border-[#6C5DD3] shadow-lg shadow-[#6C5DD3]/10' 
                                    : 'bg-[#1C1E24]/50 border-white/5 hover:border-white/20 hover:bg-[#1C1E24]'
                                }`}
                            >
                                {/* CARD HEADER */}
                                <div className="p-3">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className={`p-1.5 rounded-lg ${isSelected ? 'bg-[#6C5DD3] text-white' : 'bg-[#0D0F12] text-slate-400'}`}>
                                                <FileText size={14} />
                                            </div>
                                            <div>
                                                <h4 className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                                                    {item.analysis_type || "Analisis Tanpa Judul"}
                                                </h4>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-[10px] text-slate-500 flex items-center gap-1">
                                                        <Calendar size={10}/> {formatDate(item.timestamp)}
                                                    </span>
                                                    {item.result?.n && (
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-slate-400 border border-white/5">
                                                            N={item.result.n}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <ChevronRight size={14} className={`text-slate-500 transition-transform ${isSelected ? 'rotate-90' : ''}`}/>
                                    </div>
                                </div>

                                {/* CARD DETAIL (EXPANDABLE) */}
                                {isSelected && (
                                    <div className="px-3 pb-3 pt-0 animate-in slide-in-from-top-2">
                                        <div className="p-3 bg-[#0D0F12] rounded-lg border border-white/5 space-y-2">
                                            
                                            {/* 1. Ringkasan Narasi AI */}
                                            {item.result?.ai_narrative_summary && (
                                                <div className="mb-2">
                                                    <p className="text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider">RINGKASAN HASIL</p>
                                                    <p className="text-[11px] text-slate-300 leading-relaxed font-serif italic border-l-2 border-[#6C5DD3] pl-2">
                                                        "{item.result.ai_narrative_summary}"
                                                    </p>
                                                </div>
                                            )}

                                            {/* 2. Detail Statistik (Jika ada) */}
                                            {item.result?.details && (
                                                <div className="grid grid-cols-2 gap-2">
                                                    {Object.entries(item.result.details[0] || {}).slice(0, 4).map(([key, val]) => (
                                                        <div key={key} className="bg-white/5 p-1.5 rounded">
                                                            <div className="text-[9px] text-slate-500 capitalize">{key.replace(/_/g, ' ')}</div>
                                                            <div className="text-[10px] font-bold text-white truncate">
                                                                {typeof val === 'number' ? val.toFixed(3) : String(val)}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* 3. ACTION BUTTON */}
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    // Masukkan narasi lengkap ke editor
                                                    const content = item.result?.ai_narrative || item.result?.ai_narrative_summary;
                                                    if (content) onInsert(content);
                                                    else toast.error("Tidak ada narasi teks untuk data ini.");
                                                }}
                                                className="w-full mt-2 py-2 bg-[#6C5DD3] hover:bg-[#5b4ec2] text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2"
                                            >
                                                <CheckCircle2 size={14}/> Masukkan ke Bab 4
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}