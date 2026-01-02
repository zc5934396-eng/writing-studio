import React, { useState } from 'react';
import { 
    Sparkles, MessageSquare, BookOpen, 
    BarChart2, ShieldCheck, GraduationCap,
    Cpu, Layers
} from 'lucide-react';

// Import Tabs (Sama seperti sebelumnya)
import GeneratorTab from './Assistant/GeneratorTab';
import ChatInterface from './Assistant/ChatInterface';
import ToolsTab from './Assistant/ToolsTab';
import AnalysisTab from './Assistant/AnalysisTab';
import DefenseTab from './Assistant/DefenseTab';
import LogicTab from './Assistant/LogicTab';

export default function AssistantPanel(props) {
    const { activeTab, setActiveTab } = props;
    
    // Kita buat local state untuk "Mode Utama"
    // 'write' = Generator, Chat, Tools
    // 'review' = Analysis, Logic, Defense
    const [mode, setMode] = useState('write'); 

    // Mapping Tab per Mode
    const tabs = {
        write: [
            { id: 'generator', icon: Sparkles, label: 'Draft' },
            { id: 'chat', icon: MessageSquare, label: 'Chat' },
            { id: 'tools', icon: BookOpen, label: 'Tools' },
        ],
        review: [
            { id: 'analysis', icon: BarChart2, label: 'Data' },
            { id: 'logic', icon: ShieldCheck, label: 'Audit' },
            { id: 'defense', icon: GraduationCap, label: 'Sidang' }
        ]
    };

    // Auto-switch mode jika props activeTab berubah dari luar
    // (Opsional logic, tapi bagus untuk UX)

    return (
        <div className="flex flex-col h-full bg-sidebar-bg text-sidebar-text border-l border-sidebar-border">
            
            {/* 1. TOP HEADER: MODE SWITCHER */}
            <div className="p-3 bg-sidebar-header-bg border-b border-sidebar-border">
                <div className="flex bg-sidebar-tab-bg p-1 rounded-xl border border-sidebar-border">
                    <ModeBtn 
                        isActive={mode === 'write'} 
                        onClick={() => { setMode('write'); setActiveTab('generator'); }} 
                        icon={Cpu} 
                        label="WRITER" 
                    />
                    <ModeBtn 
                        isActive={mode === 'review'} 
                        onClick={() => { setMode('review'); setActiveTab('analysis'); }} 
                        icon={Layers} 
                        label="REVIEWER" 
                    />
                </div>
            </div>

            {/* 2. SUB-NAVIGATION (Tab Icons) */}
            <div className="flex items-center gap-1 px-3 py-2 bg-sidebar-header-bg/50 border-b border-sidebar-border overflow-x-auto custom-scrollbar">
                {tabs[mode].map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg transition-all text-[10px] font-bold uppercase tracking-wider ${
                                isActive 
                                ? 'bg-primary text-white shadow-lg shadow-primary/20' 
                                : 'text-sidebar-text-secondary hover:text-sidebar-text hover:bg-sidebar-hover'
                            }`}
                        >
                            <Icon size={14} strokeWidth={isActive ? 2.5 : 2} />
                            <span>{tab.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* 3. DYNAMIC CONTENT (No Change in Logic, Just Wrapper) */}
            <div className="flex-1 overflow-y-auto custom-scrollbar relative bg-sidebar-bg">
                {activeTab === 'generator' && <GeneratorTab {...props} />}
                {activeTab === 'chat' && <ChatInterface {...props} />}
                {activeTab === 'tools' && <ToolsTab {...props} />}
                {activeTab === 'analysis' && <AnalysisTab projectId={props.projectData?.id} onInsert={props.onInsert}/>}
                {activeTab === 'logic' && <LogicTab projectData={props.projectData} />}
                {activeTab === 'defense' && <DefenseTab projectData={props.projectData} />}
            </div>
        </div>
    );
}

function ModeBtn({ isActive, onClick, icon: Icon, label }) {
    return (
        <button 
            onClick={onClick}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-bold transition-all ${
                isActive 
                ? 'bg-[#252830] text-white shadow-sm' 
                : 'text-slate-500 hover:text-slate-300'
            }`}
        >
            <Icon size={12} /> {label}
        </button>
    );
}