import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

// --- IMPORT KOMPONEN ---
import WritingStudioRoot from './WritingStudioRoot';
import { ProjectProvider } from './context/ProjectContext';
import { ToastProvider } from './components/UI/ToastProvider'; // <--- PASTIKAN INI ADA DI ATAS

import './index.css';

// --- DEBUGGING (Cek di Console Browser) ---
console.log("[DEBUG] Main.jsx loaded");
console.log("[DEBUG] ToastProvider is:", ToastProvider); // Harus keluar: function ToastProvider(...)

// Ambil data awal dari Flask (Embed)
const initialState = window.initialState || {};
const container = document.getElementById('writing-studio-react-root');

if (container) {
  const root = createRoot(container);
  
  // Render Aplikasi
  root.render(
    <React.StrictMode>
      <BrowserRouter>
        {/* ToastProvider WAJIB membungkus semuanya */}
        <ToastProvider>
            <ProjectProvider initialData={initialState}>
                <WritingStudioRoot />
            </ProjectProvider>
        </ToastProvider>
      </BrowserRouter>
    </React.StrictMode>
  );
} else {
  console.error("[ERROR] Container #writing-studio-react-root tidak ditemukan di HTML!");
}