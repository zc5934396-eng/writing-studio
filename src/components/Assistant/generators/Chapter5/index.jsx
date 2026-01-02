import React from 'react';
import { CheckCircle } from 'lucide-react';
import useStreamGenerator from '../../../../hooks/useStreamGenerator';
import StreamOutput from '../shared/StreamOutput';
import ClosingInput from './ClosingInput';

const Chapter5Generator = ({ context }) => {
    const { 
        generatedContent, 
        isGenerating, 
        error, 
        generateStream, 
        stopGeneration 
    } = useStreamGenerator();

    const handleGenerate = (data) => {
        generateStream({
            // Pilih Task ID
            task: data.activeSection === 'kesimpulan' ? 'bab5_kesimpulan' : 'bab5_saran',
            
            // Context Global
            context_title: context.title,
            context_problem: context.problem_statement, // PENTING: Kesimpulan wajib menjawab ini
            
            // Input User
            key_findings: data.keyFindings,
            suggestion_target: data.suggestionTarget,
            
            // Instruction
            instruction: data.activeSection === 'kesimpulan'
                ? "Buat Kesimpulan yang menjawab Rumusan Masalah satu per satu berdasarkan temuan ini."
                : "Buat Saran Operasional (Praktis) dan Teoretis."
        });
    };

    return (
        <div className="flex flex-col h-full bg-slate-900 text-slate-100">
            {/* Header */}
            <div className="p-4 border-b border-slate-700 bg-slate-800/50">
                <h2 className="text-lg font-bold flex items-center gap-2 text-teal-400">
                    <CheckCircle size={20} />
                    Bab 5: Penutup
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                    Konsistensi: Kesimpulan harus menjawab <span className="text-slate-200">"{context.problem_statement?.substring(0, 40)}..."</span>
                </p>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* LEFT PANEL: Input Logic */}
                <div className="w-1/3 p-4 border-r border-slate-700 bg-slate-900/50">
                    <ClosingInput 
                        onGenerate={handleGenerate}
                        isGenerating={isGenerating}
                        onStop={stopGeneration}
                    />
                </div>

                {/* RIGHT PANEL: Output (Shared UI) */}
                <div className="flex-1 p-4 overflow-y-auto custom-scrollbar bg-slate-900">
                    <StreamOutput 
                        content={generatedContent}
                        isGenerating={isGenerating}
                        error={error}
                        emptyStateMessage="Masukkan poin temuan utama untuk menyusun Kesimpulan yang valid."
                        icon={CheckCircle}
                    />
                </div>
            </div>
        </div>
    );
};

export default Chapter5Generator;