import { useEffect, useCallback, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { $generateHtmlFromNodes } from "@lexical/html";

export default function AutoSavePlugin({ 
  projectId, 
  onServerSave, 
  isStreaming = false, // Prop untuk mendeteksi aktivitas AI
  debounceTime = 2000 // Default 2 detik
}) {
  const [editor] = useLexicalComposerContext();
  
  // Refs untuk menyimpan state tanpa memicu re-render
  const lastContentRef = useRef(null);
  const saveTimerRef = useRef(null); // KITA PEGANG KENDALI TIMER DI SINI

  // Cleanup saat unmount (Ganti Bab / Tutup Editor)
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        console.log(`[AutoSave] Timer dibatalkan untuk project ${projectId} (Cleanup)`);
      }
    };
  }, [projectId]);

  // Fungsi Save yang dijalankan saat timer habis
  const executeSave = useCallback((editorState) => {
    editorState.read(() => {
      // Double check: Jangan save jika sedang streaming
      if (isStreaming) return;

      const htmlString = $generateHtmlFromNodes(editor, null);
      
      // Cek apakah konten benar-benar berubah untuk hemat request
      if (htmlString === lastContentRef.current) return;
      
      // Panggil fungsi save dari parent (Context)
      if (onServerSave) {
          onServerSave(htmlString);
          lastContentRef.current = htmlString;
          console.log(`[AutoSave] Saved project ${projectId} at ${new Date().toLocaleTimeString()}`);
      }
    });
  }, [editor, isStreaming, onServerSave, projectId]);

  // Handler utama saat ada ketikan
  const onChange = (editorState) => {
    // 1. BLOKIR JIKA AI SEDANG MENULIS
    // Ini mencegah 'dirty read' saat teks sedang digenerate karakter per karakter.
    if (isStreaming) {
        return;
    }
    
    // 2. RESET TIMER LAMA (Debounce Logic Manual)
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    // 3. SET TIMER BARU
    saveTimerRef.current = setTimeout(() => {
      executeSave(editorState);
    }, debounceTime);
  };

  return <OnChangePlugin onChange={onChange} ignoreSelectionChange />;
}