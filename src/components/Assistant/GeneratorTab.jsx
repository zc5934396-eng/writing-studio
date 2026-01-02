import React from 'react';
import GeneratorOrchestrator from './generators/GeneratorOrchestrator';

/**
 * GeneratorTab (Wrapper)
 * ----------------------
 * Komponen ini sekarang bertindak sebagai "cangkang" saja.
 * Logic sesungguhnya sudah dipindah ke: ./generators/GeneratorOrchestrator.jsx
 * * Ini menjaga agar import di AssistantPanel.jsx tidak rusak.
 */
const GeneratorTab = (props) => {
    // Kita passing semua props (seperti triggerToast, user data, dll)
    // langsung ke Orchestrator.
    return (
        <div className="h-full w-full bg-slate-900">
            <GeneratorOrchestrator {...props} />
        </div>
    );
};

export default GeneratorTab;