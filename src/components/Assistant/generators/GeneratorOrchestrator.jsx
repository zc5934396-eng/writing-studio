import React, { useMemo } from 'react';
import { useProject } from '../../../context/ProjectContext';
import ContextHealthCheck from './shared/ContextHealthCheck';

// Import Modul per Bab
import Chapter1Generator from './Chapter1';
import Chapter2Workbench from './Chapter2/LiteratureWorkbench';
import Chapter3Generator from './Chapter3';
import Chapter4Generator from './Chapter4';
import Chapter5Generator from './Chapter5';

const GeneratorOrchestrator = (props) => {
    const { activeChapterId, chapters, project } = useProject();

    // 1. Logic Pintar: Deteksi Nomor Bab
    const currentChapterNum = useMemo(() => {
        if (!activeChapterId) return 1;
        
        const chap = chapters.find(c => c.id === activeChapterId);
        if (!chap) return 1;

        const title = chap.title.toLowerCase();
        
        if (title.includes('pendahuluan') || title.includes('introduction')) return 1;
        if (title.includes('pustaka') || title.includes('literature')) return 2;
        if (title.includes('metode') || title.includes('method')) return 3;
        if (title.includes('hasil') || title.includes('result') || title.includes('pembahasan')) return 4;
        if (title.includes('penutup') || title.includes('conclusion') || title.includes('saran')) return 5;
        
        // Fallback ID
        if (activeChapterId.includes('1')) return 1;
        if (activeChapterId.includes('2')) return 2;
        if (activeChapterId.includes('3')) return 3;
        if (activeChapterId.includes('4')) return 4;
        if (activeChapterId.includes('5')) return 5;

        return 1;
    }, [activeChapterId, chapters]);

    // 2. Render Module
    const renderModule = () => {
        switch (currentChapterNum) {
            case 1: return <Chapter1Generator {...props} context={project} />;
            case 2: return <Chapter2Workbench {...props} context={project} />;
            case 3: return <Chapter3Generator {...props} context={project} />;
            case 4: return <Chapter4Generator {...props} context={project} />;
            case 5: return <Chapter5Generator {...props} context={project} />;
            default: return <Chapter1Generator {...props} context={project} />;
        }
    };

    // 3. Wrap dengan Health Check
    // Jika data project belum lengkap, HealthCheck akan memblokir renderModule
    return (
        <ContextHealthCheck project={project}>
            {renderModule()}
        </ContextHealthCheck>
    );
};

export default GeneratorOrchestrator;