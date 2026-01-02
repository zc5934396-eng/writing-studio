import React from 'react';
import { BarChart2 } from 'lucide-react';
import useStreamGenerator from '../../../../hooks/useStreamGenerator';
import StreamOutput from '../shared/StreamOutput';
import DataInterpreter from './DataInterpreter';

const Chapter4Generator = ({ context }) => {
    const { 
        generatedContent, 
        isGenerating, 
        error, 
        generateStream, 
        stopGeneration 
    } = useStreamGenerator();

    // Handler yang dipanggil oleh DataInterpreter
    const handleGenerate = (data) => {
        generateStream({
            // Pilih Task ID sesuai section aktif
            task: data.activeSection === 'deskripsi' ? 'bab4_hasil' : 'bab4_pembahasan',
            
            // Context Global
            context_title: context.title,
            context_problem: context.problem_statement,
            
            // Context Spesifik Data
            data_mode: data.dataMode,
            raw_data_summary: data.dataSummary,
            discussion_focus: data.interpretationFocus,
            
            // Instruksi Spesifik untuk AI (Backup Logic)
            instruction: data.activeSection === 'deskripsi' 
                ? "Narasikan data mentah berikut menjadi deskripsi hasil penelitian yang rapi."
                : "Bahas temuan data berikut, kaitkan dengan teori, dan jawab rumusan masalah."
        });
    };

    return (
        <div className="flex flex-col h-full bg-slate-900 text-slate-100">
            {/* Header */}
            <div className="p-4 border-b border-slate-700 bg-slate-800/50">
                <h2 className="text-lg font-bold flex items-center gap-2 text-emerald-400">
                    <BarChart2 size={20} />
                    Bab 4: Hasil & Pembahasan
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                    Data Driven: AI akan menarasikan data Anda, bukan mengarang data fiktif.
                </p>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* LEFT PANEL: Data Interpreter (Input Logic) */}
                <div className="w-1/3 p-4 border-r border-slate-700 bg-slate-900/50">
                    <DataInterpreter 
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
                        emptyStateMessage="Masukkan data kasar di panel kiri untuk diubah menjadi narasi akademis."
                        icon={BarChart2}
                    />
                </div>
            </div>
        </div>
    );
};

export default Chapter4Generator;