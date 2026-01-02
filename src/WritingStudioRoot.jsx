import React, { useState, useRef, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { 
    Monitor, PanelRightClose, PanelRightOpen, 
    PanelLeftClose, PanelLeftOpen, Feather, LogOut, CheckCircle2, RefreshCw, Minimize2, Loader2 
} from 'lucide-react';

// --- COMPONENTS (FIXED IMPORTS WITH EXTENSIONS) ---
import LexicalEditor from './components/Editor/LexicalEditor.jsx';
import AssistantPanel from './components/AssistantPanel.jsx';
import ProjectSidebar from './components/ProjectSidebar.jsx';
import ProjectSettingsModal from './components/ProjectSettingsModal.jsx';
import UpgradeModal from './components/UI/UpgradeModal.jsx'; // Komponen Baru

// --- HOOKS & CONTEXT ---
import { useStreamGenerator } from './hooks/useStreamGenerator.js';
import { useProject } from './context/ProjectContext.jsx';
import { UPGRADE_EVENT } from './api/client.js'; // Global Event Constant

export default function WritingStudioRoot() {
    // 1. STATE & CONTEXT
    const { 
        project, content, projectId, activeChapterId, chapters,
        isSaving, isLoading, isContentLoading, 
        saveContent, projectsList, loadProject,
        // State baru untuk Modal Upgrade (pastikan context juga sudah diupdate)
        showUpgradeModal, setShowUpgradeModal 
    } = useProject();

    const { generate, stop, status, streamData, error } = useStreamGenerator();
    
    // UI State (Fitur Asli - JANGAN DIHAPUS)
    const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
    const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
    const [activeTab, setActiveTab] = useState('generator');
    const [isZenMode, setIsZenMode] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    
    const editorRef = useRef(null);

    // --- 2. GLOBAL LISTENER UNTUK UPGRADE MODAL (FITUR BARU) ---
    // Ini menangkap sinyal dari client.js jika API melempar error 403 (Limit Habis)
    useEffect(() => {
        const handleUpgradeTrigger = (event) => {
            console.log("Upgrade Modal Triggered:", event.detail);
            if (setShowUpgradeModal) {
                setShowUpgradeModal(true);
            }
        };

        if (typeof window !== 'undefined') {
            window.addEventListener(UPGRADE_EVENT, handleUpgradeTrigger);
        }

        return () => {
            if (typeof window !== 'undefined') {
                window.removeEventListener(UPGRADE_EVENT, handleUpgradeTrigger);
            }
        };
    }, [setShowUpgradeModal]);

    // --- 3. LOGIC EDITOR & AI (FITUR ASLI YANG KOMPLEKS) ---
    
    // Insert Text dari AI ke Editor
    const handleInsertToEditor = (text) => { 
        editorRef.current?.insertContent(text); 
    };

    // Handle AI Running (Complex Payload Construction)
    const handleRunAI = (task, inputData) => {
        if (!project) return alert("Pilih atau buat project dulu!");

        // Format Referensi dari Project Context
        const referencesText = project.references && project.references.length > 0
            ? project.references.map((ref, idx) => `[${idx+1}] (${ref.author}, ${ref.year}): ${ref.title}`).join('\n')
            : "";
        
        // Ambil konten HTML saat ini dari Editor untuk konteks
        const currentHtml = editorRef.current?.getHtml() || "";

        // Susun Payload Lengkap
        const fullContextPayload = {
            projectId, 
            task, 
            data: {
                ...inputData, 
                student_name: project.student_name,
                university: project.university,
                context_title: project.title,
                context_problem: project.problem_statement,
                // Gabungkan referensi dan konten editor sebagai material konteks
                context_material: `REFERENCES:\n${referencesText}\n\nCURRENT CONTENT:\n${currentHtml}`,
                current_chapter_id: activeChapterId 
            },
            model: inputData.model || 'fast'
        };
        
        // Eksekusi Generator
        generate('/api/writing-assistant', fullContextPayload); 
        
        // Auto-switch tab & open sidebar
        if (activeTab === 'analysis') setActiveTab('generator');
        if (!rightSidebarOpen) setRightSidebarOpen(true);
    };

    // --- 4. LOADING SCREEN (Global Project Load) ---
    if (isLoading) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-[#0F1115] text-slate-400">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 text-[#6C5DD3] animate-spin" />
                    <span className="text-xs font-mono tracking-widest">MEMUAT STUDIO...</span>
                </div>
            </div>
        );
    }

    const currentChapterTitle = chapters?.find(c => c.id === activeChapterId)?.title || "Editor";

    return (
        <> 
            <Toaster position="bottom-center" toastOptions={{ style: { background: '#333', color: '#fff' } }} />
            
            <div className="flex h-screen w-screen bg-[#0D0F12] text-white overflow-hidden font-sans">
                
                {/* A. LEFT SIDEBAR (Project Nav) */}
                <aside className={`${leftSidebarOpen && !isZenMode ? 'w-[300px]' : 'w-0'} h-full bg-[#16181D] border-r border-[#252830] flex flex-col transition-all duration-300 relative overflow-hidden`}>
                    <div className="h-14 px-4 border-b border-[#252830] flex items-center justify-between bg-[#1C1E24] shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-[#6C5DD3] flex items-center justify-center text-white"><Feather size={18}/></div>
                            <h1 className="text-sm font-bold">OnThesis</h1>
                        </div>
                        <button onClick={() => window.location.href = '/dashboard'} className="p-1.5 text-slate-500 hover:text-red-400" title="Keluar ke Dashboard"><LogOut size={16}/></button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <ProjectSidebar 
                            onInsertCitation={handleInsertToEditor}
                            onOpenSettings={() => setIsSettingsOpen(true)} 
                        />
                    </div>
                </aside>

                {/* B. CENTER EDITOR (Main Area) */}
                <main className="flex-1 flex flex-col h-full min-w-0 bg-[#0D0F12] relative">
                    {!isZenMode && (
                        <header className="h-14 border-b border-[#252830] bg-[#0D0F12] flex items-center justify-between px-4 shrink-0 z-20">
                            <div className="flex items-center gap-3">
                                <button onClick={() => setLeftSidebarOpen(!leftSidebarOpen)} className="text-slate-400 hover:text-white">{leftSidebarOpen ? <PanelLeftClose size={18}/> : <PanelLeftOpen size={18}/>}</button>
                                <div className="h-4 w-px bg-[#252830]"></div>
                                <div className="text-xs font-bold text-slate-200">{currentChapterTitle}</div>
                                <div className="flex items-center gap-2 px-3 py-1 bg-[#16181D] border border-[#252830] rounded">
                                    {isSaving ? <RefreshCw size={10} className="text-yellow-500 animate-spin"/> : <CheckCircle2 size={10} className="text-green-500"/>}
                                    <span className="text-[10px] font-bold text-slate-400">{isSaving ? 'SAVING...' : 'SAVED'}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => setIsZenMode(true)} className="p-2 text-slate-400 hover:text-white" title="Zen Mode"><Monitor size={18} /></button>
                                <button onClick={() => setRightSidebarOpen(!rightSidebarOpen)} className="text-slate-400 hover:text-white">{rightSidebarOpen ? <PanelRightClose size={18}/> : <PanelRightOpen size={18}/>}</button>
                            </div>
                        </header>
                    )}
                    
                    <div className="flex-1 overflow-y-auto bg-[#0D0F12] flex justify-center custom-scrollbar relative">
                        <div className={`w-full max-w-[900px] transition-all ${isZenMode ? 'py-0' : 'py-8 px-4'}`}>
                            
                            {/* LEXICAL EDITOR COMPONENT */}
                            {isContentLoading ? (
                                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0D0F12] backdrop-blur-sm">
                                    <Loader2 className="w-10 h-10 text-[#6C5DD3] animate-spin" />
                                    <p className="text-xs font-bold text-white mt-2">Memuat {currentChapterTitle}...</p>
                                </div>
                            ) : (
                                <LexicalEditor 
                                    key={activeChapterId} 
                                    ref={editorRef} 
                                    projectId={projectId}
                                    activeChapterId={activeChapterId} 
                                    initialContent={content} 
                                    isStreaming={status === 'streaming'} 
                                    projectContext={project} 
                                    onSave={saveContent} 
                                />
                            )}
                        </div>
                    </div>
                    {isZenMode && <button onClick={() => setIsZenMode(false)} className="absolute top-4 right-4 z-50 bg-black/50 text-white px-4 py-2 rounded-full text-xs font-bold flex gap-2"><Minimize2 size={14}/> Exit Focus</button>}
                </main>

                {/* C. RIGHT SIDEBAR (Assistant) */}
                <aside className={`${rightSidebarOpen && !isZenMode ? 'w-[380px]' : 'w-0'} h-full bg-[#16181D] border-l border-[#252830] flex flex-col transition-all duration-300 shadow-2xl`}>
                    <AssistantPanel 
                        activeTab={activeTab} 
                        setActiveTab={setActiveTab}
                        status={status} 
                        streamData={streamData} 
                        error={error}
                        onRunAI={handleRunAI} 
                        onStop={stop} 
                        onInsert={handleInsertToEditor}
                        getEditorContent={() => editorRef.current?.getHtml()}
                        activeChapterId={activeChapterId} 
                        chapters={chapters}              
                        projectData={project}            
                    />
                </aside>

                {/* MODALS */}
                <ProjectSettingsModal 
                    isOpen={isSettingsOpen} 
                    onClose={() => setIsSettingsOpen(false)} 
                />
                
                {/* --- UPGRADE MODAL (LAPISAN TERATAS) --- */}
                {/* Modal ini akan muncul otomatis saat UPGRADE_EVENT di-dispatch */}
                <UpgradeModal 
                    isOpen={showUpgradeModal} 
                    onClose={() => setShowUpgradeModal && setShowUpgradeModal(false)} 
                />
            </div>
        </>
    );
}