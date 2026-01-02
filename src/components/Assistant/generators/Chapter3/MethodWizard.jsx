import React, { useState } from 'react';
import { Microscope, Users, Database, Activity, GitBranch } from 'lucide-react';

/**
 * MethodWizard Component
 * Menangani logic form input untuk Metodologi (Kualitatif/Kuantitatif).
 * Output: Mengirim data form ke parent via props onGenerate.
 */
const MethodWizard = ({ onGenerate, isGenerating, onStop }) => {
    // Mode: 'kuantitatif' | 'kualitatif'
    const [methodMode, setMethodMode] = useState('kuantitatif');
    
    // Form State
    const [formData, setFormData] = useState({
        design: '',         
        participants: '',   
        instruments: '',    
        analysis: ''        
    });

    const handleInputChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = () => {
        // Validasi Simple
        if (!formData.design || !formData.participants) {
            alert("Mohon lengkapi Desain Penelitian dan Partisipan.");
            return;
        }

        // Kirim data ke Parent
        onGenerate({
            methodMode,
            ...formData
        });
    };

    // Label Dinamis
    const labels = {
        kuantitatif: {
            design: "Desain Penelitian (Ex: Survey, Eksperimen)",
            participants: "Populasi & Sampel",
            instruments: "Instrumen (Ex: Kuesioner)",
            analysis: "Teknik Analisis (Ex: SPSS, SEM-PLS)"
        },
        kualitatif: {
            design: "Pendekatan (Ex: Fenomenologi, Studi Kasus)",
            participants: "Informan / Subjek Penelitian",
            instruments: "Teknik Pengumpulan Data (Ex: Wawancara)",
            analysis: "Analisis Data (Ex: Reduksi Data, Triangulasi)"
        }
    }[methodMode];

    return (
        <div className="h-full flex flex-col">
            {/* Mode Switcher */}
            <div className="flex gap-2 p-1 bg-slate-800 rounded-lg mb-4 border border-slate-700">
                <button
                    onClick={() => setMethodMode('kuantitatif')}
                    className={`flex-1 py-2 text-xs font-medium rounded-md transition-all ${
                        methodMode === 'kuantitatif' 
                        ? 'bg-cyan-600 text-white shadow' 
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                >
                    Kuantitatif
                </button>
                <button
                    onClick={() => setMethodMode('kualitatif')}
                    className={`flex-1 py-2 text-xs font-medium rounded-md transition-all ${
                        methodMode === 'kualitatif' 
                        ? 'bg-cyan-600 text-white shadow' 
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                >
                    Kualitatif
                </button>
            </div>

            {/* Form Fields */}
            <div className="space-y-4 overflow-y-auto custom-scrollbar pr-2 flex-1">
                <div>
                    <label className="text-xs font-semibold text-cyan-200 mb-1 flex items-center gap-1">
                        <GitBranch size={12} /> {labels.design}
                    </label>
                    <input
                        type="text"
                        className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm focus:border-cyan-500 outline-none placeholder-slate-600"
                        placeholder={methodMode === 'kuantitatif' ? "Contoh: Survey Cross-sectional" : "Contoh: Studi Kasus deskriptif"}
                        value={formData.design}
                        onChange={(e) => handleInputChange('design', e.target.value)}
                    />
                </div>

                <div>
                    <label className="text-xs font-semibold text-cyan-200 mb-1 flex items-center gap-1">
                        <Users size={12} /> {labels.participants}
                    </label>
                    <textarea
                        className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm focus:border-cyan-500 outline-none placeholder-slate-600"
                        rows={2}
                        placeholder="Siapa subjeknya? Berapa jumlahnya?"
                        value={formData.participants}
                        onChange={(e) => handleInputChange('participants', e.target.value)}
                    />
                </div>

                <div>
                    <label className="text-xs font-semibold text-cyan-200 mb-1 flex items-center gap-1">
                        <Database size={12} /> {labels.instruments}
                    </label>
                    <textarea
                        className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm focus:border-cyan-500 outline-none placeholder-slate-600"
                        rows={2}
                        placeholder="Alat ukur atau cara ambil data?"
                        value={formData.instruments}
                        onChange={(e) => handleInputChange('instruments', e.target.value)}
                    />
                </div>

                <div>
                    <label className="text-xs font-semibold text-cyan-200 mb-1 flex items-center gap-1">
                        <Activity size={12} /> {labels.analysis}
                    </label>
                    <input
                        type="text"
                        className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm focus:border-cyan-500 outline-none placeholder-slate-600"
                        placeholder="Teknik pengolahan data?"
                        value={formData.analysis}
                        onChange={(e) => handleInputChange('analysis', e.target.value)}
                    />
                </div>
            </div>

            {/* Action Button */}
            <div className="pt-4 mt-auto border-t border-slate-800">
                {isGenerating ? (
                    <button 
                        onClick={onStop} 
                        className="w-full py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition-colors"
                    >
                        Stop Generation
                    </button>
                ) : (
                    <button 
                        onClick={handleSubmit} 
                        className="w-full py-2 bg-cyan-700 hover:bg-cyan-600 text-white rounded text-sm font-medium transition-colors shadow-lg shadow-cyan-900/20 flex items-center justify-center gap-2"
                    >
                        <Microscope size={16} />
                        Generate Metodologi
                    </button>
                )}
            </div>
        </div>
    );
};

export default MethodWizard;