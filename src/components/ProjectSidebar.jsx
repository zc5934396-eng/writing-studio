import React, { useState } from 'react';
import { 
    FolderOpen, Settings, Plus, FileText, BookOpen, Search, 
    LayoutGrid, Quote, Copy, Crown
} from 'lucide-react';
// Pastikan import menggunakan ekstensi .jsx
import ReferenceSearchModal from './ReferenceSearchModal.jsx';
import ProjectSettingsModal from './ProjectSettingsModal.jsx';
import { useToast } from './UI/ToastProvider.jsx';
import { useProject } from '../context/ProjectContext.jsx'; 

export default function ProjectSidebar({ onInsertCitation }) {
    const { addToast } = useToast();
    const { 
        project, projectsList, 
        chapters = [], activeChapterId, changeActiveChapter, 
        loadProject, createNewProject, isSaving, isContentLoading,
        addReference, isPro // Ambil isPro sekalian disini
    } = useProject();

    // --- STATE MANAGEMENT ---
    const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('structure'); // 'structure' | 'references'
    
    // State untuk Modals
    const [isRefModalOpen, setIsRefModalOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    
    const safeData = project || {};

    // --- LOGIC HELPER ---
    const getFormattedBib = (ref) => {
        if (ref.formatted_citation) return ref.formatted_citation;
        const authors = ref.author || "Anonim";
        const year = ref.year || "n.d.";
        const title = ref.title || "Tanpa Judul";
        const publisher = ref.publisher || ref.journal || ref.website || "";
        return `${authors}. (${year}). ${title}. ${publisher}.`;
    };

    const handleCopyBib = (ref) => {
        const text = getFormattedBib(ref);
        navigator.clipboard.writeText(text);
        // Cek apakah addToast function ada (untuk safety)
        if (addToast) addToast("Format Daftar Pustaka disalin!", "success");
    };

    const handleAddReference = (newRef) => {
        addReference(newRef); 
    };

    // Sorting Referensi (LIFO - Terbaru di atas)
    const displayedReferences = safeData.references 
        ? [...safeData.references].reverse() 
        : [];

    return (
        <aside className="w-full flex flex-col h-full bg-sidebar-bg border-r border-sidebar-border relative">
            
            {/* 1. HEADER PROJECT */}
            <div className="p-3 border-b border-sidebar-border bg-sidebar-bg">
                <button 
                    onClick={() => setProjectDropdownOpen(!projectDropdownOpen)}
                    className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-sidebar-hover transition-all group relative"
                >
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#6C5DD3] to-[#4F46E5] flex items-center justify-center shrink-0 shadow-lg shadow-[#6C5DD3]/20">
                        <FolderOpen size={14} className="text-white" />
                    </div>
                    <div className="flex-1 text-left overflow-hidden">
                        <div className="text-[10px] text-slate-500 font-bold tracking-wider flex items-center gap-2">
                            PROJECT
                            {isSaving && <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"/>}
                            {/* Label PRO jika user adalah Pro */}
                            {isPro && (
                                <span className="flex items-center gap-0.5 px-1 py-0.5 rounded bg-gradient-to-r from-amber-500 to-orange-500 text-[8px] font-bold text-white">
                                    <Crown size={8} fill="currentColor"/> PRO
                                </span>
                            )}
                        </div>
                        <div className="text-xs font-bold text-white truncate">{safeData.title || "Untitled Project"}</div>
                    </div>
                    
                    {/* TOMBOL SETTINGS - FIX: Langsung buka modal internal */}
                    <div 
                        className="p-1.5 text-slate-500 hover:text-white hover:bg-white/10 rounded transition-colors" 
                        onClick={(e) => { 
                            e.stopPropagation(); 
                            setIsSettingsOpen(true); 
                        }}
                    >
                        <Settings size={14} />
                    </div>
                </button>
                
                {/* DROPDOWN LIST PROJECT */}
                {projectDropdownOpen && (
                    <>
                        <div className="fixed inset-0 z-40" onClick={() => setProjectDropdownOpen(false)}/>
                        <div className="absolute top-16 left-3 right-3 bg-dropdown-bg border border-sidebar-border rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95">
                            <div className="max-h-[200px] overflow-y-auto custom-scrollbar p-1">
                                {projectsList && projectsList.length > 0 ? (
                                    projectsList.map(p => (
                                        <button 
                                            key={p.id} 
                                            onClick={() => { loadProject(p.id); setProjectDropdownOpen(false); }} 
                                            className="w-full text-left p-2 rounded-lg text-xs hover:bg-sidebar-hover text-sidebar-text truncate flex items-center gap-2"
                                        >
                                            <FileText size={12} className="opacity-50"/>
                                            {p.title || "Untitled"}
                                        </button>
                                    ))
                                ) : (
                                    <div className="p-2 text-[10px] text-sidebar-text-secondary text-center">Tidak ada project lain</div>
                                )}
                                
                                <button onClick={() => { createNewProject(); setProjectDropdownOpen(false); }} className="w-full flex items-center gap-2 p-2 rounded-lg text-xs text-primary hover:bg-primary/10 font-bold mt-1 border-t border-sidebar-border">
                                    <Plus size={12}/> New Project
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* 2. TAB SWITCHER */}
            <div className="grid grid-cols-2 p-1 m-3 bg-sidebar-tab-bg rounded-lg border border-sidebar-border">
                <button 
                    onClick={() => setActiveTab('structure')}
                    className={`flex items-center justify-center gap-2 py-2 rounded-md text-[10px] font-bold transition-all ${activeTab === 'structure' ? 'bg-sidebar-tab-active text-sidebar-text' : 'text-sidebar-text-secondary'}`}
                >
                    <LayoutGrid size={12} /> Struktur
                </button>
                <button 
                    onClick={() => setActiveTab('references')}
                    className={`flex items-center justify-center gap-2 py-2 rounded-md text-[10px] font-bold transition-all ${activeTab === 'references' ? 'bg-sidebar-tab-active text-sidebar-text' : 'text-sidebar-text-secondary'}`}
                >
                    <BookOpen size={12} /> Referensi
                </button>
            </div>

            {/* 3. CONTENT AREA */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-3 pb-4">
                
                {/* TAB 1: LIST BAB (CHAPTERS) */}
                {activeTab === 'structure' && (
                    <div className="space-y-1">
                        <div className="px-2 py-2 text-[10px] font-bold text-sidebar-text-secondary uppercase tracking-widest">CHAPTERS</div>
                        {chapters.map((chapter) => (
                            <button
                                key={chapter.id}
                                onClick={() => changeActiveChapter(chapter.id)}
                                disabled={isContentLoading}
                                className={`w-full flex items-center gap-3 p-2.5 rounded-lg transition-all border ${activeChapterId === chapter.id ? 'bg-primary/10 text-sidebar-text border-primary/20' : 'text-sidebar-text-secondary border-transparent hover:bg-sidebar-hover'}`}
                            >
                                <FileText size={14} className={activeChapterId === chapter.id ? "text-primary" : "text-sidebar-text-secondary"} />
                                <span className="text-[11px] font-medium truncate flex-1 text-left">{chapter.title}</span>
                                {activeChapterId === chapter.id && <div className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_primary]"></div>}
                            </button>
                        ))}
                    </div>
                )}

                {/* TAB 2: LIST REFERENSI */}
                {activeTab === 'references' && (
                    <div className="space-y-3">
                         <button onClick={() => setIsRefModalOpen(true)} className="w-full py-2.5 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20">
                            <Search size={14} /> Cari Referensi Online
                        </button>

                        <div className="space-y-2">
                            {displayedReferences.length > 0 ? displayedReferences.map((ref, idx) => (
                                <div key={idx} className="bg-sidebar-card-bg p-3 rounded-xl border border-sidebar-border hover:border-primary/30 transition-all group">
                                    <div className="flex items-start gap-2 mb-2">
                                        <div className="mt-0.5 shrink-0 w-4 h-4 bg-sidebar-tab-bg rounded flex items-center justify-center text-[8px] font-bold text-sidebar-text-secondary">
                                            {displayedReferences.length - idx}
                                        </div>
                                        <div>
                                            <div className="text-[11px] font-bold text-sidebar-text line-clamp-2 leading-snug">{ref.title}</div>
                                            <div className="flex items-center gap-2 mt-1 text-[9px] text-sidebar-text-secondary">
                                                <span className="bg-sidebar-hover px-1.5 py-0.5 rounded text-sidebar-text-secondary">{ref.year || "?"}</span>
                                                <span className="truncate max-w-[120px]">{ref.author}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 pt-2 border-t border-sidebar-border opacity-60 group-hover:opacity-100 transition-opacity">
                                        <button 
                                            onClick={() => onInsertCitation && onInsertCitation(`(${ref.author ? ref.author.split(',')[0].split(' ').pop() : 'Anonim'}, ${ref.year})`)}
                                            className="flex-1 py-1.5 bg-sidebar-tab-bg hover:bg-primary text-sidebar-text-secondary hover:text-white rounded text-[9px] font-bold flex items-center justify-center gap-1"
                                        >
                                            <Quote size={10} /> Cite
                                        </button>
                                        <button 
                                            onClick={() => handleCopyBib(ref)}
                                            className="flex-1 py-1.5 bg-sidebar-tab-bg hover:bg-success text-sidebar-text-secondary hover:text-white rounded text-[9px] font-bold flex items-center justify-center gap-1"
                                        >
                                            <Copy size={10} /> Copy Bib
                                        </button>
                                    </div>
                                </div>
                            )) : (
                                <div className="text-center py-8 text-sidebar-text-secondary text-[10px]">Belum ada referensi.</div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* 4. MODALS (RENDER DISINI AGAR MANDIRI) */}
            
            {/* Modal Pencarian Referensi */}
            <ReferenceSearchModal 
                isOpen={isRefModalOpen} 
                onClose={() => setIsRefModalOpen(false)}
                onReferenceAdded={handleAddReference} 
            />

            {/* Modal Settings Project (FITUR YANG HILANG KEMBALI) */}
            <ProjectSettingsModal 
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
            />
        </aside>
    );
}