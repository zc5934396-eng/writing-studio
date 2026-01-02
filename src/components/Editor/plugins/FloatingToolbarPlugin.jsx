import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getSelection, $isRangeSelection, FORMAT_TEXT_COMMAND } from 'lexical';
import { createPortal } from 'react-dom';
import { 
    Sparkles, Maximize2, Minimize2, AlignLeft, RefreshCw, 
    StopCircle 
} from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function FloatingToolbarPlugin() {
    const [editor] = useLexicalComposerContext();
    const [isTextSelected, setIsTextSelected] = useState(false);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const [isProcessing, setIsProcessing] = useState(false);
    const toolbarRef = useRef(null);
    const abortControllerRef = useRef(null); // Untuk membatalkan stream jika perlu

    // --- POSISI TOOLBAR (Sama seperti sebelumnya) ---
    const updateToolbar = useCallback(() => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
            if(!isProcessing) setIsTextSelected(false); // Jangan sembunyi kalau lagi ngetik
            return;
        }

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        if (rect.width > 0) {
            setPosition({
                top: rect.top - 55 + window.scrollY, 
                left: rect.left + (rect.width / 2) - 160 
            });
            
            editor.getEditorState().read(() => {
                const lexicalSelection = $getSelection();
                if ($isRangeSelection(lexicalSelection) && !lexicalSelection.isCollapsed()) {
                    const text = lexicalSelection.getTextContent();
                    if(text.trim().length > 0) setIsTextSelected(true);
                } else if (!isProcessing) {
                    setIsTextSelected(false);
                }
            });
        }
    }, [editor, isProcessing]);

    useEffect(() => {
        const removeListener = editor.registerUpdateListener(({ editorState }) => {
            editorState.read(() => updateToolbar());
        });
        document.addEventListener('selectionchange', updateToolbar);
        window.addEventListener('resize', updateToolbar);
        window.addEventListener('scroll', updateToolbar);

        return () => {
            removeListener();
            document.removeEventListener('selectionchange', updateToolbar);
            window.removeEventListener('resize', updateToolbar);
            window.removeEventListener('scroll', updateToolbar);
        };
    }, [editor, updateToolbar]);


    // ==========================================
    // ⚡ STREAMING AI HANDLER (THE MAGIC)
    // ==========================================

    const handleAIAction = async (mode) => {
        setIsProcessing(true);
        let selectedText = "";
        
        // Setup AbortController untuk tombol Stop
        if (abortControllerRef.current) abortControllerRef.current.abort();
        abortControllerRef.current = new AbortController();

        editor.getEditorState().read(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
                selectedText = selection.getTextContent();
            }
        });

        if (!selectedText) {
            setIsProcessing(false);
            return;
        }

        try {
            // 1. HAPUS TEKS LAMA DULU (Agar terlihat mulai mengetik dari kosong)
            editor.update(() => {
                const selection = $getSelection();
                if ($isRangeSelection(selection)) {
                    selection.insertText(""); 
                }
            });

            // 2. REQUEST KE BACKEND (Wajib stream: true)
            const response = await fetch('/api/ai/edit-text', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    text: selectedText, 
                    mode: mode,
                    stream: true // <--- INI WAJIB ADA AGAR TIDAK JSON
                }),
                signal: abortControllerRef.current.signal
            });

            if (!response.ok) throw new Error("Gagal terhubung ke AI");

            // 3. BACA STREAM (CHUNK PER CHUNK)
            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                
                // Masukkan potongan teks sekecil apapun
                editor.update(() => {
                    const selection = $getSelection();
                    if ($isRangeSelection(selection)) {
                        selection.insertText(chunk);
                    }
                });
            }

            // Jika pakai toast
            if (typeof toast !== 'undefined') toast.success("Selesai!");

        } catch (err) {
            if (err.name === 'AbortError') {
                if (typeof toast !== 'undefined') toast("Dibatalkan");
            } else {
                console.error(err);
                if (typeof toast !== 'undefined') toast.error("Gagal memproses");
                // Fallback: Kembalikan teks asli jika gagal total
                editor.update(() => {
                    const selection = $getSelection();
                    if ($isRangeSelection(selection)) selection.insertText(selectedText);
                });
            }
        } finally {
            setIsProcessing(false);
            setIsTextSelected(false); // Tutup toolbar
        }
    };


    const stopGeneration = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
    };

    if (!isTextSelected && !isProcessing) return null;

    return createPortal(
        <div 
            ref={toolbarRef}
            className="fixed z-[9999] flex items-center gap-1 p-1.5 bg-[#1C1E24] border border-[#2A2D36] rounded-xl shadow-2xl animate-in fade-in zoom-in-95 duration-200"
            style={{ top: `${position.top}px`, left: `${position.left}px` }}
        >
            {isProcessing ? (
                <div className="flex items-center gap-3 px-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-[#6C5DD3] animate-pulse">
                        <RefreshCw className="w-4 h-4 animate-spin"/> AI Sedang Menulis...
                    </div>
                    <div className="h-4 w-px bg-white/10"></div>
                    <button 
                        onClick={stopGeneration}
                        className="text-red-400 hover:text-red-300 text-[10px] font-bold flex items-center gap-1 px-2 py-1 rounded bg-red-500/10 hover:bg-red-500/20 transition-colors"
                    >
                        <StopCircle size={12}/> Stop
                    </button>
                </div>
            ) : (
                <>
                    <ToolbarBtn 
                        icon={Sparkles} label="Paraphrase" color="text-emerald-400"
                        onClick={() => handleAIAction('paraphrase')} 
                    />
                    <div className="w-px h-4 bg-white/10 mx-1"></div>
                    
                    <ToolbarBtn 
                        icon={Maximize2} label="Expand" 
                        onClick={() => handleAIAction('expand')} 
                    />
                    <ToolbarBtn 
                        icon={Minimize2} label="Shorten" 
                        onClick={() => handleAIAction('shorten')} 
                    />
                    <div className="w-px h-4 bg-white/10 mx-1"></div>
                    
                    <ToolbarBtn 
                        icon={AlignLeft} label="Formalize" color="text-blue-400"
                        onClick={() => handleAIAction('formalize')} 
                    />
                </>
            )}
        </div>,
        document.body
    );
}

function ToolbarBtn({ icon: Icon, label, onClick, color = "text-slate-300" }) {
    return (
        <button 
            onClick={onClick}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors ${color} hover:text-white group`}
            title={label}
        >
            <Icon size={14} className="group-hover:scale-110 transition-transform"/>
            <span className="text-[11px] font-bold">{label}</span>
        </button>
    );
}