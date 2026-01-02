import React from 'react';
import { AlertTriangle, Settings } from 'lucide-react';

/**
 * ContextHealthCheck
 * Memastikan user sudah mengisi Metadata Project sebelum menggunakan AI.
 */
const ContextHealthCheck = ({ project, children }) => {
    // Cek kelengkapan data
    const hasTitle = project?.title && project?.title !== 'Proyek Baru';
    const hasProblem = project?.problem_statement && project?.problem_statement.trim().length > 10;

    const isReady = hasTitle && hasProblem;

    if (!isReady) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8 text-center bg-slate-900">
                <div className="bg-yellow-900/20 p-4 rounded-full mb-4 ring-1 ring-yellow-500/30">
                    <AlertTriangle size={32} className="text-yellow-500" />
                </div>
                
                <h3 className="font-bold text-slate-200 text-lg">Data Project Belum Lengkap</h3>
                <p className="text-sm mt-2 mb-6 max-w-sm leading-relaxed text-slate-400">
                    AI membutuhkan <strong>Judul</strong> dan <strong>Rumusan Masalah</strong> agar hasil generate akurat dan tidak berhalusinasi.
                </p>

                <div className="p-4 bg-slate-800 rounded-lg border border-slate-700 text-left w-full max-w-xs space-y-3">
                    <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${hasTitle ? 'bg-green-500' : 'bg-red-500'}`} />
                        <span className="text-sm">Judul Project</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${hasProblem ? 'bg-green-500' : 'bg-red-500'}`} />
                        <span className="text-sm">Rumusan Masalah</span>
                    </div>
                </div>

                <p className="text-xs mt-6 text-slate-500">
                    Silakan buka menu <span className="text-blue-400"><Settings size={10} className="inline"/> Settings</span> di sidebar kiri.
                </p>
            </div>
        );
    }

    // Jika aman, render konten asli (Generator)
    return <>{children}</>;
};

export default ContextHealthCheck;