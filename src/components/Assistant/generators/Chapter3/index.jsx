import React from 'react';
import { Microscope } from 'lucide-react';
import useStreamGenerator from '../../../../hooks/useStreamGenerator';
import StreamOutput from '../shared/StreamOutput'; // Import Shared UI
import MethodWizard from './MethodWizard'; // Import Local Wizard

const Chapter3Generator = ({ context }) => {
    // 1. Hook Generator
    const { 
        generatedContent, 
        isGenerating, 
        error, 
        generateStream, 
        stopGeneration 
    } = useStreamGenerator();

    // 2. Handler saat User klik Generate di Wizard
    const handleGenerate = (wizardData) => {
        generateStream({
            task: 'bab3_metode',
            
            // Global Context
            context_title: context.title,
            context_problem: context.problem_statement,
            
            // Data dari Wizard
            method_mode: wizardData.methodMode,
            method_design: wizardData.design,
            method_participants: wizardData.participants,
            method_instruments: wizardData.instruments,
            method_analysis: wizardData.analysis,
            
            instruction: `Buat Bab 3 Metodologi Penelitian dengan pendekatan ${wizardData.methodMode}.`
        });
    };

    return (
        <div className="flex flex-col h-full bg-slate-900 text-slate-100">
            {/* Header */}
            <div className="p-4 border-b border-slate-700 bg-slate-800/50">
                <h2 className="text-lg font-bold flex items-center gap-2 text-cyan-400">
                    <Microscope size={20} />
                    Bab 3: Metodologi Penelitian
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                    Mode Wizard: Tentukan desain dan prosedur penelitian Anda.
                </p>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* LEFT PANEL: Wizard Form (Logic Terpisah) */}
                <div className="w-1/3 p-4 border-r border-slate-700 bg-slate-900/50">
                    <MethodWizard 
                        onGenerate={handleGenerate}
                        isGenerating={isGenerating}
                        onStop={stopGeneration}
                    />
                </div>

                {/* RIGHT PANEL: Output (Shared Component) */}
                <div className="flex-1 p-4 overflow-y-auto custom-scrollbar bg-slate-900">
                    <StreamOutput 
                        content={generatedContent}
                        isGenerating={isGenerating}
                        error={error}
                        emptyStateMessage="Isi parameter penelitian di panel kiri untuk mulai menulis Bab 3."
                        icon={Microscope}
                    />
                </div>
            </div>
        </div>
    );
};

export default Chapter3Generator;