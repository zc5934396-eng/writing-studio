import React, { useState } from 'react';
import { ShieldCheck, AlertTriangle, CheckCircle, RefreshCw, ChevronRight, Activity } from 'lucide-react';
import { api } from '../../api/client.js'; // Gunakan api client yang sudah diperbaiki
import { useProject } from '../../context/ProjectContext.jsx'; // Ambil data project

const LogicTab = () => {
    // Ambil data project langsung dari Context
    const { project } = useProject(); 
    
    const [auditResult, setAuditResult] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const runLogicAudit = async () => {
        // Validasi Frontend: Pastikan data project ada sebelum kirim
        const title = project?.title || '';
        const problem = project?.problem_statement || '';
        const objectives = project?.research_objectives || '';

        if (!title || !problem) {
            setError("Judul dan Rumusan Masalah wajib diisi di Settings Project sebelum audit.");
            return;
        }

        setIsLoading(true);
        setError(null);
        
        try {
            // Panggil API dengan payload yang lengkap
            const data = await api.post('/api/assistant/logic-check', {
                title: title,
                problem: problem,
                objectives: objectives
            });
            
            setAuditResult(data);
        } catch (err) {
            console.error("Logic check failed:", err);
            setError(err.message || "Gagal melakukan audit logika.");
        } finally {
            setIsLoading(false);
        }
    };

    // Helper untuk warna status score
    const getScoreColor = (score) => {
        if (score >= 80) return 'text-emerald-400';
        if (score >= 50) return 'text-yellow-400';
        return 'text-red-400';
    };

    return (
        <div className="h-full flex flex-col bg-[#16181D]">
            {/* Header */}
            <div className="p-4 border-b border-white/5 bg-[#1C1E24]">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <ShieldCheck className="text-[#6C5DD3]" size={18} />
                    Logic Guard
                </h3>
                <p className="text-[10px] text-slate-400 mt-1">
                    Audit konsistensi "Benang Merah" skripsi Anda (Judul vs Masalah vs Tujuan).
                </p>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                
                {/* Empty State / Intro */}
                {!auditResult && !isLoading && !error && (
                    <div className="text-center py-10 px-4 border-2 border-dashed border-white/5 rounded-xl bg-[#1A1D23]/50">
                        <Activity className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                        <h4 className="text-sm font-bold text-slate-300 mb-2">Siap Mengaudit?</h4>
                        <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                            AI akan memeriksa apakah Judul, Rumusan Masalah, dan Tujuan Penelitian Anda sudah sinkron secara logis.
                        </p>
                        <button 
                            onClick={runLogicAudit}
                            className="bg-[#6C5DD3] hover:bg-[#5a4cb5] text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg shadow-[#6C5DD3]/20 flex items-center gap-2 mx-auto"
                        >
                            <ShieldCheck size={16} /> Jalankan Audit
                        </button>
                    </div>
                )}

                {/* Loading State */}
                {isLoading && (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <RefreshCw className="w-8 h-8 text-[#6C5DD3] animate-spin mb-4" />
                        <p className="text-xs font-bold text-slate-300">Sedang Menganalisis Logika...</p>
                        <p className="text-[10px] text-slate-500 mt-1">Membedah benang merah skripsi Anda.</p>
                    </div>
                )}

                {/* Error State */}
                {error && (
                    <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-xl mb-4">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="text-red-400 shrink-0 mt-0.5" size={16} />
                            <div>
                                <h4 className="text-xs font-bold text-red-300 mb-1">Gagal Audit</h4>
                                <p className="text-[11px] text-red-200/80">{error}</p>
                                {!project?.title && (
                                    <button className="mt-2 text-[10px] bg-red-500/20 hover:bg-red-500/30 text-red-200 px-3 py-1 rounded transition-colors">
                                        Lengkapi Data Project
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Result View */}
                {auditResult && !isLoading && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        
                        {/* Score Card */}
                        <div className="bg-[#1C1E24] p-5 rounded-2xl border border-white/5 relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-3 opacity-10">
                                <Activity size={80} className="text-white" />
                            </div>
                            <div className="relative z-10">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Konsistensi Score</span>
                                <div className={`text-4xl font-black mt-1 mb-1 ${getScoreColor(auditResult.consistency_score)}`}>
                                    {auditResult.consistency_score}/100
                                </div>
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-medium text-slate-300">
                                    Status: <span className="text-white font-bold">{auditResult.status}</span>
                                </div>
                            </div>
                        </div>

                        {/* Analysis List */}
                        <div className="space-y-3">
                            {auditResult.analysis && auditResult.analysis.map((item, idx) => (
                                <div key={idx} className="bg-[#1A1D23] p-4 rounded-xl border border-white/5">
                                    <div className="flex items-center justify-between mb-2">
                                        <h5 className="text-xs font-bold text-slate-200">{item.pair}</h5>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                            item.status === 'Valid' ? 'bg-emerald-500/20 text-emerald-400' : 
                                            item.status === 'Warning' ? 'bg-yellow-500/20 text-yellow-400' : 
                                            'bg-red-500/20 text-red-400'
                                        }`}>
                                            {item.status}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-slate-400 leading-relaxed border-l-2 border-slate-700 pl-3">
                                        {item.feedback}
                                    </p>
                                </div>
                            ))}
                        </div>

                        {/* Suggestions */}
                        {auditResult.suggestions && auditResult.suggestions.length > 0 && (
                            <div className="bg-[#1A1D23] p-4 rounded-xl border border-white/5">
                                <h5 className="text-xs font-bold text-slate-300 mb-3 flex items-center gap-2">
                                    <CheckCircle size={14} className="text-[#6C5DD3]"/> Rekomendasi Perbaikan
                                </h5>
                                <ul className="space-y-2">
                                    {auditResult.suggestions.map((sug, idx) => (
                                        <li key={idx} className="text-[11px] text-slate-400 flex gap-2">
                                            <span className="text-[#6C5DD3] mt-0.5">•</span>
                                            {sug}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <button 
                            onClick={runLogicAudit}
                            className="w-full py-3 mt-2 bg-[#252830] hover:bg-[#2d313a] text-slate-300 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 border border-white/5"
                        >
                            <RefreshCw size={14} /> Audit Ulang
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default LogicTab;