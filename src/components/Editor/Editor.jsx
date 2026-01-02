import React from 'react';
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import LexicalErrorBoundary from "@lexical/react/LexicalErrorBoundary";

// IMPORT PLUGIN YANG BARU DIBUAT TADI
import AutoSavePlugin from "./plugins/AutoSavePlugin"; 

// Config Sederhana (Gak perlu logic load di sini)
const editorConfig = {
  namespace: "OnThesisEditor",
  theme: {
    // ... theme lu ...
  },
  onError(error) {
    console.error(error);
  },
};

export default function WritingStudio() {
  return (
    <LexicalComposer initialConfig={editorConfig}>
      <div className="relative min-h-[500px] bg-[#1F2128] border border-white/5 rounded-xl p-4">
        
        {/* Area Ketik */}
        <RichTextPlugin
          contentEditable={<ContentEditable className="min-h-[400px] outline-none text-white" />}
          placeholder={<div className="absolute top-4 left-4 text-gray-500 pointer-events-none">Mulai menulis skripsi...</div>}
          ErrorBoundary={LexicalErrorBoundary}
        />
        
        {/* History (Undo/Redo) */}
        <HistoryPlugin />

        {/* INI DIA PENYELAMATNYA */}
        <AutoSavePlugin />

      </div>
    </LexicalComposer>
  );
}