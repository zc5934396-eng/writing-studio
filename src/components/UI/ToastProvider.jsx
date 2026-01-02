import React, { createContext, useContext, useState, useCallback } from 'react';
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react';

const ToastContext = createContext();

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
}

// Pastikan ada keyword 'export' di depan function
export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    const addToast = useCallback((message, type = 'info') => {
        const id = Date.now();
        setToasts((prev) => [...prev, { id, message, type }]);
        setTimeout(() => removeToast(id), 3000);
    }, []);

    const removeToast = (id) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    };

    return (
        <ToastContext.Provider value={{ addToast }}>
            {children}
            <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 pointer-events-none">
                {toasts.map((toast) => (
                    <div 
                        key={toast.id}
                        className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl min-w-[300px] animate-in slide-in-from-right duration-300 bg-[#1C1E24] ${
                            toast.type === 'success' ? 'border-green-500/30 text-green-400' :
                            toast.type === 'error' ? 'border-red-500/30 text-red-400' :
                            'border-blue-500/30 text-blue-400'
                        }`}
                    >
                        <span className="text-xs font-bold">{toast.message}</span>
                        <button onClick={() => removeToast(toast.id)}><X size={14}/></button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}