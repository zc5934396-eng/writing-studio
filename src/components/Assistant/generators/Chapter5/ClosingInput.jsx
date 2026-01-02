import React, { useState } from 'react';
import { CheckCircle, Lightbulb, ClipboardList, ArrowRightCircle } from 'lucide-react';

/**
 * ClosingInput Component
 * Menangani input untuk Bab 5 (Kesimpulan & Saran).
 */
const ClosingInput = ({ onGenerate, isGenerating, onStop }) => {
    // Sub-Task: Kesimpulan vs Saran
    const [activeSection, setActiveSection] = useState('kesimpulan');
    
    // Inputs
    const [keyFindings, setKeyFindings] = useState(''); // Untuk Kesimpulan
    const [suggestionTarget, setSuggestionTarget] = useState(''); // Untuk Saran

    const handleSubmit = () => {
        // Validasi
        if (activeSection === 'kesimpulan' && !keyFindings.trim()) {
            alert("Mohon isi poin-poin temuan utama dari Bab 4 agar kesimpulan akurat.");
            return;
        }

        onGenerate({
            activeSection,
            keyFindings,
            suggestionTarget
        });
    };

    return (
        <div className="h-full flex flex-col">
            {/* 1. Section Tabs */}
            <div className="flex border-b border-slate-700 mb-4">
                <button
                    onClick={() => setActiveSection('kesimpulan')}
                    className={`flex-1 pb-2 text-xs font-semibold text-center transition-colors border-b-2 ${
                        activeSection === 'kesimpulan' 
                        ? 'border-teal-500 text-teal-400' 
                        : 'border-transparent text-slate-500 hover:text-slate-300'
                    }`}
                >
                    1. Kesimpulan
                </button>
                <button
                    onClick={() => setActiveSection('saran')}
                    className={`flex-1 pb-2 text-xs font-semibold text-center transition-colors border-b-2 ${
                        activeSection === 'saran' 
                        ? 'border-teal-500 text-teal-400' 
                        : 'border-transparent text-slate-500 hover:text-slate-300'
                    }`}
                >
                    2. Saran
                </button>
            </div>

            {/* 2. Input Fields */}
            <div className="space-y-4 overflow-y-auto custom-scrollbar pr-2 flex-1">
                
                {/* Mode: Kesimpulan */}
                {activeSection === 'kesimpulan' && (
                    <div className="animate-fade-in">
                        <label className="block text-xs font-semibold text-teal-200 mb-2 flex items-center gap-1">
                            <ClipboardList size={14} /> POIN TEMUAN UTAMA
                        </label>
                        <textarea
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm focus:ring-1 focus:ring-teal-500 outline-none text-slate-200 placeholder-slate-600 h-48"
                            placeholder="Contoh: &#10;- Hipotesis 1 diterima (sig 0.02).&#10;- Strategi promosi IG paling efektif.&#10;- Tidak ada beda kepuasan pria vs wanita."
                            value={keyFindings}
                            onChange={(e) => setKeyFindings(e.target.value)}
                        />
                        <p className="text-[10px] text-slate-500 mt-2 italic">
                            *Tuliskan poin hasil analisis Bab 4. AI akan menyusunnya menjawab Rumusan Masalah.
                        </p>
                    </div>
                )}

                {/* Mode: Saran */}
                {activeSection === 'saran' && (
                    <div className="animate-fade-in">
                        <label className="block text-xs font-semibold text-teal-200 mb-2 flex items-center gap-1">
                            <Lightbulb size={14} /> TARGET SARAN
                        </label>
                        <textarea
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm focus:ring-1 focus:ring-teal-500 outline-none text-slate-200 placeholder-slate-600 h-32"
                            placeholder="Contoh:&#10;- Manajemen Perusahaan&#10;- Kementerian Pendidikan&#10;- Peneliti selanjutnya (menambah variabel X)"
                            value={suggestionTarget}
                            onChange={(e) => setSuggestionTarget(e.target.value)}
                        />
                        <p className="text-[10px] text-slate-500 mt-2 italic">
                            *Kepada siapa saran ditujukan? AI akan membuat saran operasional konkret.
                        </p>
                    </div>
                )}
            </div>

            {/* 3. Action Button */}
            <div className="pt-4 mt-auto border-t border-slate-800">
                {isGenerating ? (
                    <button onClick={onStop} className="w-full py-2 bg-red-600 hover:bg-red-700 rounded text-sm font-medium transition-colors">
                        Stop Generation
                    </button>
                ) : (
                    <button 
                        onClick={handleSubmit} 
                        className="w-full py-2 bg-teal-700 hover:bg-teal-600 rounded text-sm font-medium transition-colors shadow-lg shadow-teal-900/20 flex items-center justify-center gap-2"
                    >
                        <ArrowRightCircle size={16} />
                        Buat {activeSection === 'kesimpulan' ? 'Kesimpulan' : 'Saran'}
                    </button>
                )}
            </div>
        </div>
    );
};

export default ClosingInput;