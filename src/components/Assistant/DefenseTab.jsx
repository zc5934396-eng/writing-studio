import React, { useState, useRef, useEffect } from 'react';
import { 
    MessageSquare, Play, RefreshCw, User, GraduationCap, 
    ShieldAlert, Award, StopCircle, Lock, Zap, BookOpen 
} from 'lucide-react';

// Import komponen
import { useProject } from '../../context/ProjectContext.jsx';
import { api } from '../../api/client.js';

const DefenseTab = () => {
    const { project, isPro, setShowUpgradeModal } = useProject();
    
    // --- STATE ---
    const [messages, setMessages] = useState([]);
    const [isSessionActive, setIsSessionActive] = useState(false);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [feedbackReport, setFeedbackReport] = useState(null);
    
    // Config
    const [examinerType, setExaminerType] = useState('critical'); 
    const [difficulty, setDifficulty] = useState('hard'); 
    
    const messagesEndRef = useRef(null);

    // Auto Scroll
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };
    useEffect(() => scrollToBottom(), [messages]);

    // --- LOGIC: START ---
    const startSession = async () => {
        // Cek Pro/Free Limit
        if (!isPro && (difficulty === 'extreme' || examinerType === 'critical')) {
            setShowUpgradeModal(true);
            return;
        }

        setIsSessionActive(true);
        setFeedbackReport(null);
        setMessages([
            { 
                role: 'system', 
                content: `SIDANG DIBUKA. PENGUJI: ${getExaminerName(examinerType).toUpperCase()}.`,
                type: 'info'
            }
        ]);
        
        setIsLoading(true);
        try {
            const res = await api.post('/api/defense/start', {
                examiner_type: examinerType,
                difficulty: difficulty,
                project_context: {
                    title: project?.title,
                    problem: project?.problem_statement,
                    method: project?.methodology
                }
            });
            
            // Parsing Response (Flexible)
            const msg = res?.response?.message || res?.message || "Silakan perkenalkan diri Anda.";
            setMessages(prev => [...prev, { role: 'assistant', content: msg }]);
        } catch (error) {
            setMessages(prev => [...prev, { role: 'system', content: "Gagal terhubung ke Dosen AI.", type: 'error' }]);
            setIsSessionActive(false);
        } finally {
            setIsLoading(false);
        }
    };

    // --- LOGIC: CHAT (ANSWER) ---
    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMsg = input;
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setIsLoading(true);

        try {
            const res = await api.post('/api/defense/answer', {
                answer: userMsg,
                history: messages.filter(m => m.role !== 'system'),
                examiner_type: examinerType
            });

            // FIX: Parsing data lebih robust
            // Cek res.response.message (standard) atau res.message (fallback)
            const rawMsg = res?.response?.message || res?.message;
            const dosenResponse = rawMsg || "Maaf, saya kurang menangkap maksud Anda. Bisa ulangi?"; // Fallback lebih jelas

            setMessages(prev => [...prev, { 
                role: 'assistant', 
                content: dosenResponse
            }]);

        } catch (error) {
            setMessages(prev => [...prev, { role: 'system', content: "Koneksi terputus. Coba kirim ulang.", type: 'error' }]);
        } finally {
            setIsLoading(false);
        }
    };

    // --- LOGIC: END & EVALUATE ---
    const endSession = async () => {
        if (messages.length < 3) {
            setIsSessionActive(false);
            return;
        }
        
        setIsLoading(true);
        try {
            const res = await api.post('/api/defense/evaluate', {
                history: messages.filter(m => m.role !== 'system')
            });
            
            // FIX: Parsing Report Evaluasi
            // Backend bisa return di 'response', 'report', atau root object
            const reportData = res?.response || res?.report || res;
            
            // Pastikan data valid sebelum set state
            if (reportData && (reportData.score || reportData.verdict)) {
                setFeedbackReport(reportData);
            } else {
                setFeedbackReport({ 
                    score: 0, 
                    verdict: "Error Data", 
                    advice: "Gagal memuat evaluasi. Coba lagi." 
                });
            }
            
            setIsSessionActive(false);
        } catch (error) {
            console.error("Evaluation error:", error);
            setIsSessionActive(false);
        } finally {
            setIsLoading(false);
        }
    };

    const getExaminerName = (type) => {
        switch(type) {
            case 'critical': return "Prof. Killer";
            case 'methodologist': return "Dr. Metodologi";
            default: return "Dosen Pembimbing";
        }
    };

    return (
        <div className="h-full flex flex-col bg-[#16181D] relative overflow-hidden font-sans">
            
            {/* HEADER */}
            <div className="p-4 border-b border-white/5 bg-[#1C1E24]/80 backdrop-blur-sm z-10 flex justify-between items-center shrink-0">
                <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wide">
                        <ShieldAlert className="text-red-500" size={16} />
                        Simulasi Sidang
                    </h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">Mode: {difficulty.toUpperCase()}</p>
                </div>
                {isSessionActive && (
                    <button 
                        onClick={endSession}
                        className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[10px] font-bold rounded-lg border border-red-500/20 transition-all flex items-center gap-2"
                    >
                        <StopCircle size={14}/> Selesai & Nilai
                    </button>
                )}
            </div>

            {/* CONTENT AREA */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 relative z-0">
                
                {/* 1. CONFIGURATION (MENU AWAL) */}
                {!isSessionActive && !feedbackReport && (
                    <div className="max-w-md mx-auto mt-4 animate-in fade-in zoom-in-95 duration-500">
                        <div className="text-center mb-6">
                            <h2 className="text-xl font-black text-white uppercase tracking-tight">Pilih Penguji</h2>
                            <p className="text-xs text-slate-400 mt-1">Siapa yang ingin Anda hadapi hari ini?</p>
                        </div>

                        {/* EXAMINER CARDS */}
                        <div className="grid grid-cols-1 gap-3 mb-6">
                            {[
                                { id: 'critical', label: 'PROF. KILLER', desc: 'Sangat kritis, pertanyaan pendek & tajam.', icon: Zap, color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/20' },
                                { id: 'methodologist', label: 'DR. METODOLOGI', desc: 'Mengejar validitas data & rumus statistik.', icon: BookOpen, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
                                { id: 'supportive', label: 'DOSEN PEMBIMBING', desc: 'Latihan santai untuk melancarkan lidah.', icon: User, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' }
                            ].map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => setExaminerType(item.id)}
                                    className={`relative flex items-center gap-4 p-4 rounded-xl border transition-all text-left group overflow-hidden ${
                                        examinerType === item.id 
                                        ? `${item.bg} ${item.border} ring-1 ring-${item.color.split('-')[1]}-500` 
                                        : 'bg-[#1C1E24] border-white/5 hover:border-white/10'
                                    }`}
                                >
                                    {!isPro && item.id === 'critical' && (
                                        <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px] flex items-center justify-center z-10">
                                            <div className="bg-black/80 px-3 py-1 rounded-full flex items-center gap-2 border border-amber-500/30">
                                                <Lock size={12} className="text-amber-500" />
                                                <span className="text-[10px] font-bold text-amber-500 uppercase">Pro Only</span>
                                            </div>
                                        </div>
                                    )}
                                    <div className={`p-3 rounded-lg ${examinerType === item.id ? 'bg-black/20' : 'bg-[#252830]'}`}>
                                        <item.icon size={20} className={item.color} />
                                    </div>
                                    <div>
                                        <div className={`text-sm font-black ${examinerType === item.id ? 'text-white' : 'text-slate-300'}`}>{item.label}</div>
                                        <div className="text-[10px] text-slate-500 leading-tight mt-1">{item.desc}</div>
                                    </div>
                                </button>
                            ))}
                        </div>

                        {/* DIFFICULTY */}
                        <div className="bg-[#1C1E24] p-1 rounded-xl border border-white/5 flex relative">
                            {['normal', 'hard', 'extreme'].map((level) => (
                                <button
                                    key={level}
                                    onClick={() => setDifficulty(level)}
                                    className={`flex-1 py-3 rounded-lg text-[10px] font-bold uppercase transition-all relative z-10 ${
                                        difficulty === level ? 'text-white' : 'text-slate-500 hover:text-slate-300'
                                    }`}
                                >
                                    {level}
                                    {level === 'extreme' && !isPro && <Lock size={10} className="inline ml-1 mb-0.5 text-amber-500"/>}
                                </button>
                            ))}
                            <div 
                                className={`absolute top-1 bottom-1 rounded-lg bg-[#252830] transition-all duration-300 ease-out border border-white/5 shadow-sm`}
                                style={{
                                    left: difficulty === 'normal' ? '4px' : difficulty === 'hard' ? '33.33%' : '66.66%',
                                    width: 'calc(33.33% - 4px)'
                                }}
                            />
                        </div>

                        <button 
                            onClick={startSession}
                            className="w-full py-4 mt-6 bg-white hover:bg-slate-200 text-black rounded-xl text-sm font-black uppercase tracking-wide transition-all shadow-xl hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
                        >
                            <Play size={16} fill="currentColor"/> Masuk Ruang Sidang
                        </button>
                    </div>
                )}

                {/* 2. CHAT INTERFACE (SAAT SIDANG) */}
                {isSessionActive && (
                    <div className="space-y-6 pb-24">
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-in slide-in-from-bottom-2`}>
                                {msg.role === 'system' ? (
                                    <div className="w-full flex justify-center my-4">
                                        <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest bg-[#1C1E24] px-3 py-1 rounded-full border border-white/5">
                                            {msg.content}
                                        </span>
                                    </div>
                                ) : (
                                    <>
                                        <div className={`text-[9px] font-bold mb-1 px-1 ${msg.role === 'user' ? 'text-slate-400' : 'text-red-400 uppercase tracking-wider'}`}>
                                            {msg.role === 'user' ? 'Anda' : getExaminerName(examinerType)}
                                        </div>
                                        <div className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed shadow-lg ${
                                            msg.role === 'user' 
                                            ? 'bg-[#2C303B] text-slate-200 rounded-tr-none border border-white/5' 
                                            : 'bg-[#1C1E24] text-slate-300 rounded-tl-none border-l-2 border-l-red-500 border-y border-r border-white/5'
                                        }`}>
                                            {msg.content}
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}
                        
                        {isLoading && (
                            <div className="flex gap-2 items-center text-[10px] text-slate-500 ml-2 animate-pulse">
                                <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                                Dosen sedang menilai jawaban Anda...
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                )}

                {/* 3. REPORT CARD (HASIL EVALUASI) */}
                {feedbackReport && !isSessionActive && (
                    <div className="max-w-lg mx-auto mt-6 animate-in zoom-in-95 duration-500 pb-10">
                        {/* Header */}
                        <div className="bg-white text-black p-6 rounded-t-2xl text-center">
                            <div className="text-[10px] font-black uppercase tracking-[0.2em] mb-2 opacity-60">Hasil Evaluasi</div>
                            <h2 className={`text-4xl font-black uppercase ${
                                feedbackReport.verdict === 'LULUS' ? 'text-green-600' : 'text-red-600'
                            }`}>
                                {feedbackReport.verdict || "SELESAI"}
                            </h2>
                            <div className="mt-4 flex justify-center gap-4">
                                <div className="text-center">
                                    <div className="text-3xl font-black">{feedbackReport.score}</div>
                                    <div className="text-[9px] font-bold uppercase opacity-50">Skor Akhir</div>
                                </div>
                            </div>
                        </div>

                        {/* Details */}
                        <div className="bg-[#1C1E24] p-6 rounded-b-2xl border-t border-dashed border-slate-700">
                            <div className="space-y-4">
                                <div>
                                    <h4 className="text-[10px] font-bold text-green-400 uppercase mb-1 flex items-center gap-2">
                                        <Award size={12}/> Kekuatan
                                    </h4>
                                    <p className="text-xs text-slate-300 leading-relaxed">{feedbackReport.strengths || "-"}</p>
                                </div>
                                <div>
                                    <h4 className="text-[10px] font-bold text-red-400 uppercase mb-1 flex items-center gap-2">
                                        <ShieldAlert size={12}/> Kelemahan Fatal
                                    </h4>
                                    <p className="text-xs text-slate-300 leading-relaxed">{feedbackReport.weaknesses || "-"}</p>
                                </div>
                                <div className="bg-[#252830] p-3 rounded-lg border border-white/5">
                                    <h4 className="text-[10px] font-bold text-white uppercase mb-1">Saran Perbaikan</h4>
                                    <p className="text-xs text-slate-400 italic">"{feedbackReport.advice || "-"}"</p>
                                </div>
                            </div>

                            <button 
                                onClick={() => { setFeedbackReport(null); setMessages([]); }}
                                className="w-full mt-6 py-3 bg-[#2C303B] hover:bg-white hover:text-black text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2 uppercase tracking-wide"
                            >
                                <RefreshCw size={14}/> Uji Ulang
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* INPUT AREA */}
            {isSessionActive && (
                <div className="p-4 bg-[#16181D] border-t border-white/5 absolute bottom-0 w-full z-20">
                    <form onSubmit={handleSendMessage} className="relative flex items-center gap-2">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Jawab dengan singkat (Max 2 kalimat)..."
                            className="flex-1 bg-[#0D0F12] border border-white/10 text-white text-sm rounded-xl px-4 py-3 focus:border-red-500 outline-none transition-all placeholder-slate-600"
                            disabled={isLoading}
                            autoFocus
                        />
                        <button
                            type="submit"
                            disabled={isLoading || !input.trim()}
                            className="p-3 bg-red-600 hover:bg-red-500 text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-red-900/20"
                        >
                            <MessageSquare size={18} className="fill-white/20"/>
                        </button>
                    </form>
                </div>
            )}
        </div>
    );
};

export default DefenseTab;