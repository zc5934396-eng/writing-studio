import React from 'react';
import { Bot, AlertCircle } from 'lucide-react';

/**
 * StreamOutput Component
 * Standard UI untuk menampilkan teks hasil generate AI.
 */
const StreamOutput = ({ 
    content, 
    isGenerating, 
    error, 
    emptyStateMessage = "Siap menulis...",
    icon: Icon = Bot
}) => {
    
    // 1. State: Error
    if (error) {
        return (
            <div className="mt-4 p-4 bg-red-900/20 border border-red-500/50 rounded-lg flex gap-3 text-red-200">
                <AlertCircle size={20} className="shrink-0 mt-0.5" />
                <div className="text-sm">
                    <strong className="block mb-1 font-semibold">Terjadi Kesalahan</strong>
                    {error}
                </div>
            </div>
        );
    }

    // 2. State: Kosong (Belum generate)
    if (!content && !isGenerating) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-slate-600 opacity-60 min-h-[300px]">
                <Icon size={48} className="mb-4 text-slate-700" />
                <p className="text-sm text-center max-w-xs">{emptyStateMessage}</p>
            </div>
        );
    }

    // 3. State: Ada Konten (Sedang stream / Selesai)
    return (
        <div className="prose prose-invert prose-sm max-w-none bg-slate-800 p-6 rounded-lg border border-slate-700 shadow-inner">
            <div className="whitespace-pre-wrap leading-relaxed">
                {content}
                {/* Kursor berkedip saat generating */}
                {isGenerating && (
                    <span className="inline-block w-2 h-4 bg-blue-400 ml-1 animate-pulse align-middle"></span>
                )}
            </div>
        </div>
    );
};

export default StreamOutput;