import React, { useState } from 'react';
import { BarChart2, MessageSquare, ArrowRightCircle } from 'lucide-react';

/**
 * DataInterpreter Component
 * Menangani input data mentah user (Angka/Teks) dan logic pemilihan sub-bab.
 */
const DataInterpreter = ({ onGenerate, isGenerating, onStop }) => {
    // Mode Data: Kuantitatif (Angka) vs Kualitatif (Teks)
    const [dataMode, setDataMode] = useState('kuantitatif');
    
    // Sub-Task: Deskripsi Data (4.1) atau Pembahasan (4.2)
    const [activeSection, setActiveSection] = useState('deskripsi'); 

    // Inputs
    const [dataSummary, setDataSummary] = useState(''); 
    const [interpretationFocus, setInterpretationFocus] = useState(''); 

    const handleSubmit = () => {
        if (!dataSummary.trim()) {
            alert("Mohon masukkan ringkasan data hasil penelitian Anda.");
            return;
        }

        onGenerate({
            dataMode,
            activeSection,
            dataSummary,
            interpretationFocus
        });
    };

    return (
        <div className="h-full flex flex-col">
            {/* 1. Mode Switcher (Kuanti/Kuali) */}
            <div className="flex gap-2 p-1 bg-slate-800 rounded-lg mb-4 border border-slate-700">
                <button
                    onClick={() => setDataMode('kuantitatif')}
                    className={`flex-1 py-2 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-2 ${
                        dataMode === 'kuantitatif' 
                        ? 'bg-emerald-600 text-white shadow' 
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                >
                    <BarChart2 size={14} /> Kuantitatif
                </button>
                <button
                    onClick={() => setDataMode('kualitatif')}
                    className={`flex-1 py-2 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-2 ${
                        dataMode === 'kualitatif' 
                        ? 'bg-emerald-600 text-white shadow' 
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                >
                    <MessageSquare size={14} /> Kualitatif
                </button>
            </div>

            {/* 2. Section Selector (Deskripsi vs Pembahasan) */}
            <div className="flex border-b border-slate-700 mb-4">
                <button
                    onClick={() => setActiveSection('deskripsi')}
                    className={`flex-1 pb-2 text-xs font-semibold text-center transition-colors border-b-2 ${
                        activeSection === 'deskripsi' 
                        ? 'border-emerald-500 text-emerald-400' 
                        : 'border-transparent text-slate-500 hover:text-slate-300'
                    }`}
                >
                    1. Deskripsi Data
                </button>
                <button
                    onClick={() => setActiveSection('pembahasan')}
                    className={`flex-1 pb-2 text-xs font-semibold text-center transition-colors border-b-2 ${
                        activeSection === 'pembahasan' 
                        ? 'border-emerald-500 text-emerald-400' 
                        : 'border-transparent text-slate-500 hover:text-slate-300'
                    }`}
                >
                    2. Pembahasan
                </button>
            </div>

            {/* 3. Input Fields */}
            <div className="space-y-4 overflow-y-auto custom-scrollbar pr-2 flex-1">
                {/* Input Data Mentah */}
                <div>
                    <label className="block text-xs font-semibold text-emerald-200 mb-2">
                        {dataMode === 'kuantitatif' ? 'HASIL OLAH DATA (SPSS/PLS)' : 'TEMUAN / KUTIPAN PENTING'}
                    </label>
                    <textarea
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm focus:ring-1 focus:ring-emerald-500 outline-none text-slate-200 placeholder-slate-600 h-40"
                        placeholder={dataMode === 'kuantitatif' 
                            ? "Contoh: H1 diterima (sig 0.002), Pengaruh X ke Y sebesar 0.45..." 
                            : "Contoh: Informan A mengatakan bahwa sistem sering error saat jam sibuk..."}
                        value={dataSummary}
                        onChange={(e) => setDataSummary(e.target.value)}
                    />
                    <p className="text-[10px] text-slate-500 mt-1 italic">
                        *AI dilarang mengarang angka. Masukkan data real Anda.
                    </p>
                </div>

                {/* Input Focus (Hanya muncul di Pembahasan) */}
                {activeSection === 'pembahasan' && (
                    <div className="animate-fade-in">
                        <label className="block text-xs font-semibold text-emerald-200 mb-2">
                            ARAH PEMBAHASAN / TEORI
                        </label>
                        <textarea
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm focus:ring-1 focus:ring-emerald-500 outline-none text-slate-200 placeholder-slate-600 h-24"
                            placeholder="Kaitkan dengan teori siapa? Apakah mendukung penelitian terdahulu?"
                            value={interpretationFocus}
                            onChange={(e) => setInterpretationFocus(e.target.value)}
                        />
                    </div>
                )}
            </div>

            {/* 4. Action Button */}
            <div className="pt-4 mt-auto border-t border-slate-800">
                {isGenerating ? (
                    <button onClick={onStop} className="w-full py-2 bg-red-600 rounded text-sm font-medium hover:bg-red-700 transition-colors">
                        Stop Generation
                    </button>
                ) : (
                    <button 
                        onClick={handleSubmit} 
                        className="w-full py-2 bg-emerald-700 hover:bg-emerald-600 rounded text-sm font-medium transition-colors shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2"
                    >
                        <ArrowRightCircle size={16} />
                        {activeSection === 'deskripsi' ? 'Narasikan Data' : 'Buat Pembahasan'}
                    </button>
                )}
            </div>
        </div>
    );
};

export default DataInterpreter;