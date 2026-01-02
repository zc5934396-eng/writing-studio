import React, { useState } from 'react';
import { Bot, FileText, Target, HelpCircle, PenTool } from 'lucide-react';
import useStreamGenerator from '../../../../hooks/useStreamGenerator';

const Chapter1Generator = ({ context }) => {
    // State untuk mode sub-bab (Latar Belakang / Rumusan / Tujuan)
    const [activeSection, setActiveSection] = useState('latar_belakang');
    
    // Hook Stream Generator
    const { 
        generatedContent, 
        isGenerating, 
        error, 
        generateStream, 
        stopGeneration 
    } = useStreamGenerator();

    // Fungsi Trigger Generator
    const handleGenerate = () => {
        // Mapping task ID agar Backend tau mau generate apa
        // Task ID ini harus ditangkap di ai_utils.py nanti
        let taskType = 'bab1_latar_belakang';
        if (activeSection === 'rumusan') taskType = 'bab1_rumusan';
        if (activeSection === 'tujuan') taskType = 'bab1_tujuan';

        // Kirim Prompt + Context Global (Judul & Masalah dari Settings)
        generateStream({
            task: taskType,
            context_title: context.title,
            context_problem: context.problem_statement,
            // Opsional: Kirim instruksi tambahan dari user jika ada input text area
        });
    };

    return (
        <div className="flex flex-col h-full bg-slate-900 text-slate-100">
            {/* 1. Header & Context Info */}
            <div className="p-4 border-b border-slate-700 bg-slate-800/50">
                <h2 className="text-lg font-bold flex items-center gap-2 text-blue-400">
                    <FileText size={20} />
                    Generator Bab 1: Pendahuluan
                </h2>
                <p className="text-xs text-slate-400 mt-1 line-clamp-1">
                    Konteks: {context.title || 'Judul belum diset'}
                </p>
            </div>

            {/* 2. Sub-Task Selection Tabs */}
            <div className="flex p-2 gap-2 bg-slate-900 border-b border-slate-800 overflow-x-auto">
                <TabButton 
                    active={activeSection === 'latar_belakang'} 
                    onClick={() => setActiveSection('latar_belakang')}
                    icon={<Bot size={14} />}
                    label="Latar Belakang"
                />
                <TabButton 
                    active={activeSection === 'rumusan'} 
                    onClick={() => setActiveSection('rumusan')}
                    icon={<HelpCircle size={14} />}
                    label="Rumusan Masalah"
                />
                <TabButton 
                    active={activeSection === 'tujuan'} 
                    onClick={() => setActiveSection('tujuan')}
                    icon={<Target size={14} />}
                    label="Tujuan & Manfaat"
                />
            </div>

            {/* 3. Main Output Area */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {/* Petunjuk Singkat */}
                {!generatedContent && !isGenerating && (
                    <div className="text-center text-slate-500 mt-10 p-6 border border-dashed border-slate-700 rounded-lg">
                        <p className="mb-2">Pilih bagian yang ingin dibuat di atas.</p>
                        <p className="text-xs">
                            AI akan menggunakan Judul & Masalah dari Settings project Anda<br/>
                            untuk membuat narasi yang akademis.
                        </p>
                    </div>
                )}

                {/* Stream Output */}
                {(generatedContent || isGenerating) && (
                    <div className="prose prose-invert prose-sm max-w-none bg-slate-800 p-4 rounded-lg border border-slate-700">
                        <div className="whitespace-pre-wrap leading-relaxed">
                            {generatedContent}
                            {isGenerating && <span className="animate-pulse">_</span>}
                        </div>
                    </div>
                )}
                
                {/* Error State */}
                {error && (
                    <div className="mt-4 p-3 bg-red-900/30 border border-red-500/50 text-red-200 text-sm rounded">
                        Error: {error}
                    </div>
                )}
            </div>

            {/* 4. Action Bar */}
            <div className="p-4 border-t border-slate-700 bg-slate-800">
                <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">
                        {isGenerating ? 'Sedang menulis...' : 'Siap generate'}
                    </span>
                    
                    <div className="flex gap-2">
                        {isGenerating ? (
                            <button 
                                onClick={stopGeneration}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition-colors"
                            >
                                Stop
                            </button>
                        ) : (
                            <button 
                                onClick={handleGenerate}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors shadow-lg shadow-blue-900/20"
                            >
                                <PenTool size={16} />
                                Buat {formatLabel(activeSection)}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// Helper Component untuk Tab
const TabButton = ({ active, onClick, icon, label }) => (
    <button
        onClick={onClick}
        className={`
            flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap
            ${active 
                ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30' 
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200 border border-transparent'}
        `}
    >
        {icon}
        {label}
    </button>
);

const formatLabel = (slug) => {
    if (slug === 'latar_belakang') return 'Latar Belakang';
    if (slug === 'rumusan') return 'Rumusan Masalah';
    return 'Tujuan';
};

export default Chapter1Generator;