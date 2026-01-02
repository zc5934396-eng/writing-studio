import React, { useState, useEffect } from 'react';
import { 
    X, User, Target, BookOpen, Settings, 
    Save, CheckCircle2, AlertCircle 
} from 'lucide-react';
import { useProject } from '../context/ProjectContext';

export default function ProjectSettingsModal({ isOpen, onClose }) {
    const { project, updateProjectMeta, isSaving } = useProject();
    const [activeTab, setActiveTab] = useState('identity');

    // STATE LOKAL FORM (Agar tidak lag saat ketik)
    const [formData, setFormData] = useState({});

    // 1. SYNC STATE SAAT MODAL DIBUKA
    useEffect(() => {
        if (isOpen && project) {
            // Debug: Cek apa isi project saat modal dibuka
            console.log("[MODAL DEBUG] Project Data received:", project);
            
            setFormData({
                student_name: project.student_name || '',
                university: project.university || '',
                degree_level: project.degree_level || 'S1',
                title: project.title || '',
                problem_statement: project.problem_statement || '',
                research_objectives: project.research_objectives || '',
                significance: project.significance || '',
                theoretical_framework: project.theoretical_framework || '',
                variables_indicators: project.variables_indicators || '',
                methodology: project.methodology || 'quantitative',
                population_sample: project.population_sample || '',
                data_analysis: project.data_analysis || ''
            });
        }
    }, [isOpen, project]);

    if (!isOpen) return null;

    // 2. HANDLE CHANGE (LOKAL)
    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    // 3. HANDLE SAVE (KIRIM KE CONTEXT)
    const handleSave = () => {
        // Kirim semua data sekaligus
        updateProjectMeta(formData);
        onClose();
    };

    const tabs = [
        { id: 'identity', label: 'Identitas', icon: User, desc: 'Nama, Judul, Kampus' },
        { id: 'problem', label: 'Masalah & Tujuan', icon: Target, desc: 'Rumusan & Signifikansi' },
        { id: 'theory', label: 'Landasan Teori', icon: BookOpen, desc: 'Variabel & Grand Theory' },
        { id: 'method', label: 'Metodologi', icon: Settings, desc: 'Jenis & Teknik Analisis' },
    ];

    const inputClass = "w-full bg-[#0D0F12] border border-white/10 text-slate-200 text-[13px] p-3 rounded-xl outline-none transition-all focus:border-[#6C5DD3] focus:ring-2 focus:ring-[#6C5DD3]/10 placeholder:text-slate-600";

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-4xl h-[85vh] bg-[#16181D] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                
                {/* HEADER */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[#1C1E24]">
                    <div>
                        <h2 className="text-sm font-bold text-white flex items-center gap-2">
                            <Settings size={16} className="text-[#6C5DD3]" />
                            Pengaturan Skripsi
                        </h2>
                        <p className="text-[11px] text-slate-400 mt-0.5">Atur metadata proyek untuk konteks AI.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        {isSaving && (
                            <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1 animate-pulse">
                                <CheckCircle2 size={12} /> Menyimpan...
                            </span>
                        )}
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-all">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* BODY */}
                <div className="flex flex-1 overflow-hidden">
                    {/* SIDEBAR */}
                    <div className="w-64 bg-[#0D0F12] border-r border-white/5 p-3 flex flex-col gap-1 overflow-y-auto">
                        {tabs.map((tab) => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex items-start gap-3 p-3 rounded-xl text-left transition-all duration-200 ${
                                        isActive ? 'bg-[#6C5DD3]/10 border border-[#6C5DD3]/20' : 'hover:bg-white/5 border border-transparent'
                                    }`}
                                >
                                    <Icon size={18} className={`mt-0.5 ${isActive ? 'text-[#6C5DD3]' : 'text-slate-500'}`} />
                                    <div>
                                        <div className={`text-xs font-bold ${isActive ? 'text-white' : 'text-slate-400'}`}>{tab.label}</div>
                                        <div className="text-[10px] text-slate-600 font-medium mt-0.5">{tab.desc}</div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* FORM AREA */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#16181D] p-8">
                        <div className="max-w-2xl mx-auto space-y-6">
                            
                            {/* TAB: IDENTITAS */}
                            {activeTab === 'identity' && (
                                <div className="space-y-5 animate-in slide-in-from-right-4 duration-300">
                                    <SectionHeader title="Identitas Dasar" desc="Informasi mahasiswa dan institusi." />
                                    <div className="grid grid-cols-2 gap-4">
                                        <InputGroup label="Nama Mahasiswa">
                                            <input className={inputClass} name="student_name" value={formData.student_name} onChange={handleChange} placeholder="Nama Lengkap..." />
                                        </InputGroup>
                                        <InputGroup label="Jenjang Studi">
                                            <select className={`${inputClass} appearance-none cursor-pointer`} name="degree_level" value={formData.degree_level} onChange={handleChange}>
                                                <option value="S1">S1 - Sarjana</option>
                                                <option value="S2">S2 - Magister</option>
                                                <option value="S3">S3 - Doktoral</option>
                                            </select>
                                        </InputGroup>
                                    </div>
                                    <InputGroup label="Universitas / Instansi">
                                        <input className={inputClass} name="university" value={formData.university} onChange={handleChange} placeholder="Nama Universitas..." />
                                    </InputGroup>
                                    <InputGroup label="Judul Penelitian">
                                        <textarea className={`${inputClass} min-h-[100px] resize-none`} name="title" value={formData.title} onChange={handleChange} placeholder="Judul skripsi..." />
                                    </InputGroup>
                                </div>
                            )}

                            {/* TAB: MASALAH */}
                            {activeTab === 'problem' && (
                                <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                                    <SectionHeader title="Kerangka Masalah" desc="Fokus utama penelitian." />
                                    <InputGroup label="Rumusan Masalah">
                                        <textarea className={`${inputClass} min-h-[120px] resize-none`} name="problem_statement" value={formData.problem_statement} onChange={handleChange} placeholder="Daftar pertanyaan penelitian..." />
                                    </InputGroup>
                                    <InputGroup label="Tujuan Penelitian">
                                        <textarea className={`${inputClass} min-h-[100px] resize-none`} name="research_objectives" value={formData.research_objectives} onChange={handleChange} placeholder="Tujuan yang ingin dicapai..." />
                                    </InputGroup>
                                    <InputGroup label="Signifikansi / Manfaat">
                                        <textarea className={`${inputClass} min-h-[80px] resize-none`} name="significance" value={formData.significance} onChange={handleChange} placeholder="Manfaat teoritis & praktis..." />
                                    </InputGroup>
                                </div>
                            )}

                             {/* TAB: TEORI */}
                             {activeTab === 'theory' && (
                                <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                                    <SectionHeader title="Landasan Teori" desc="Teori dan Variabel." />
                                    <InputGroup label="Grand Theory">
                                        <textarea className={`${inputClass} min-h-[100px] resize-none`} name="theoretical_framework" value={formData.theoretical_framework} onChange={handleChange} placeholder="Teori utama yang digunakan..." />
                                    </InputGroup>
                                    <InputGroup label="Variabel & Indikator">
                                        <textarea className={`${inputClass} min-h-[120px] resize-none`} name="variables_indicators" value={formData.variables_indicators} onChange={handleChange} placeholder="Definisi variabel dan indikator..." />
                                    </InputGroup>
                                </div>
                            )}

                             {/* TAB: METODE */}
                             {activeTab === 'method' && (
                                <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                                    <SectionHeader title="Metodologi" desc="Metode penelitian." />
                                    <InputGroup label="Pendekatan Penelitian">
                                        <select className={`${inputClass} appearance-none cursor-pointer`} name="methodology" value={formData.methodology} onChange={handleChange}>
                                            <option value="quantitative">Kuantitatif (Statistik)</option>
                                            <option value="qualitative">Kualitatif (Deskriptif)</option>
                                            <option value="mix_method">Mixed Method</option>
                                            <option value="rnd">R&D</option>
                                        </select>
                                    </InputGroup>
                                    <InputGroup label="Populasi & Sampel">
                                        <textarea className={`${inputClass} min-h-[80px] resize-none`} name="population_sample" value={formData.population_sample} onChange={handleChange} placeholder="Detail populasi dan sampel..." />
                                    </InputGroup>
                                    <InputGroup label="Teknik Analisis Data">
                                        <textarea className={`${inputClass} min-h-[80px] resize-none`} name="data_analysis" value={formData.data_analysis} onChange={handleChange} placeholder="Teknik analisis yang dipakai..." />
                                    </InputGroup>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* FOOTER */}
                <div className="p-4 border-t border-white/5 bg-[#16181D] flex justify-end gap-3">
                    <button onClick={onClose} className="px-5 py-2.5 text-xs font-bold text-slate-400 hover:text-white transition-colors rounded-xl">Batal</button>
                    <button onClick={handleSave} className="px-6 py-2.5 bg-[#6C5DD3] hover:bg-[#5b4cc4] text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-[#6C5DD3]/20 flex items-center gap-2 active:scale-95">
                        <Save size={16} /> Simpan Perubahan
                    </button>
                </div>
            </div>
        </div>
    );
}

function SectionHeader({ title, desc }) {
    return (
        <div className="pb-2 border-b border-white/5 mb-4">
            <h3 className="text-lg font-bold text-white">{title}</h3>
            <p className="text-xs text-slate-500">{desc}</p>
        </div>
    );
}

function InputGroup({ label, children }) {
    return (
        <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 ml-1">{label}</label>
            {children}
        </div>
    );
}