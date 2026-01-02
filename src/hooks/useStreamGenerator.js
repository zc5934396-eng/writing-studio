import { useState, useRef, useCallback } from 'react';
import { useToast } from '../components/UI/ToastProvider'; 

const useStreamGenerator = () => {
    const [generatedContent, setGeneratedContent] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState(null);
    const abortControllerRef = useRef(null);
    
    // Safety check kalau ToastProvider belum ready
    const toastHook = useToast ? useToast() : { triggerToast: console.log };
    const { triggerToast } = toastHook || { triggerToast: console.log };

    const generateStream = useCallback(async (payload) => {
        setIsGenerating(true);
        setError(null);
        setGeneratedContent('');
        
        abortControllerRef.current = new AbortController();
        
        try {
            const response = await fetch('/api/assistant/generate-stream', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
                signal: abortControllerRef.current.signal
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.message || 'Gagal generate konten');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let done = false;

            while (!done) {
                const { value, done: doneReading } = await reader.read();
                done = doneReading;
                const chunkValue = decoder.decode(value, { stream: true });
                setGeneratedContent((prev) => prev + chunkValue);
            }

        } catch (err) {
            if (err.name === 'AbortError') {
                console.log('Generation stopped by user');
                if (triggerToast) triggerToast('info', 'Generasi dihentikan.');
            } else {
                console.error('Stream Error:', err);
                setError(err.message);
                if (triggerToast) triggerToast('error', `Error: ${err.message}`);
            }
        } finally {
            setIsGenerating(false);
            abortControllerRef.current = null;
        }
    }, [triggerToast]);

    const stopGeneration = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
            setIsGenerating(false);
        }
    }, []);

    return {
        generatedContent,
        isGenerating,
        error,
        generateStream,
        stopGeneration
    };
};

// --- BAGIAN INI FIX ERROR NYA ---
// Support Named Import (import { useStreamGenerator } from ...) -> Untuk WritingStudioRoot.jsx
export { useStreamGenerator }; 

// Support Default Import (import useStreamGenerator from ...) -> Untuk Chapter1, 2, dll
export default useStreamGenerator;