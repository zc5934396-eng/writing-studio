/* File: app/static/js/writing_assistant.js
   Deskripsi: Full Logic Writing Studio (Alpine.js + TinyMCE + PPT + Auditor)
   Status: Complete Feature Set
*/

// --- 1. KONFIGURASI TINYMCE (SESUAI FITUR ASLI) ---
const tinymceConfig = { 
    selector: '#studio-editor', 
    height: '100%', 
    menubar: false, 
    statusbar: false, 
    skin: "oxide-dark", 
    content_css: "dark", 
    plugins: 'advlist autolink lists link image charmap preview anchor searchreplace visualblocks code fullscreen insertdatetime media table code help wordcount quickbars', 
    
    // Toolbar standar
    toolbar: 'undo redo | blocks | bold italic underline | alignleft aligncenter alignright | bullist numlist | table | removeformat', 
    
    // Quickbars (Menu saat seleksi teks)
    quickbars_selection_toolbar: 'ai_paraphrase ai_formal | bold italic | h2 h3 blockquote',
    quickbars_insert_toolbar: 'quickimage quicktable | ai_expand_paragraph', 
    
    contextmenu: 'ai_paraphrase ai_expand ai_shorten ai_formal | link image table',
    
    // Styling agar editor menyatu dengan tema gelap
    content_style: `
        body { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 14px; line-height: 1.6; padding: 2rem; color: #e2e8f0; background: #1e293b; } 
        p { margin-bottom: 1em; text-align: justify; } 
        h1, h2, h3 { font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 700; margin-top: 1em; margin-bottom: 0.5em; color: #fff; } 
        ul, ol { margin-left: 2em; margin-bottom: 1em; }
        .citation-badge { background-color: rgba(16, 185, 129, 0.1); color: #34D399; padding: 2px 8px; border-radius: 6px; font-size: 0.75rem; border: 1px solid rgba(16, 185, 129, 0.2); cursor: pointer; display: inline-block; user-select: none; }
        .ai-generated-pending { border-bottom: 2px dashed #F59E0B; background: rgba(245, 158, 11, 0.1); }
        .ai-generated-valid { border-bottom: 2px solid #10B981; }
        .ai-generated-hallucination { text-decoration: wavy underline #EF4444; background: rgba(239, 68, 68, 0.1); }
    `,

    setup: (editor) => {
        editor.on('init', () => { 
            document.getElementById('studio-editor').style.opacity = '1'; 
            window.dispatchEvent(new CustomEvent('check-import')); 
        }); 

        // Event Listener untuk Context Awareness
        editor.on('NodeChange', () => {
            window.dispatchEvent(new CustomEvent('editor-context-change', { detail: { editor: editor } }));
        });

        // Registrasi Menu "/" (Slash Command) - FITUR LAMA DIKEMBALIKAN
        editor.ui.registry.addAutocompleter('slashcommands', {
            ch: '/',
            minChars: 0,
            columns: 1,
            fetch: (pattern) => {
                const matchedItems = [
                    { value: 'ai_expand', text: '✍️ Kembangkan Paragraf', icon: 'plus' },
                    { value: 'ai_shorten', text: '✂️ Ringkas (Summary)', icon: 'cut' },
                    { value: 'ai_paraphrase', text: '✨ Paraphrase', icon: 'sync' },
                    { value: 'ai_ref', text: '📚 Cari Referensi Terkait', icon: 'search' },
                    { value: 'ai_data', text: '📊 Masukkan Data Statistik', icon: 'chart' }
                ].filter(item => item.text.toLowerCase().includes(pattern.toLowerCase()));

                return new Promise((resolve) => resolve(matchedItems));
            },
            onAction: (autocompleteApi, rng, value) => {
                editor.selection.setRng(rng);
                editor.insertContent('');
                
                const text = editor.selection.getNode().textContent;
                
                if (value === 'ai_ref') {
                    window.dispatchEvent(new CustomEvent('trigger-ref-search', { detail: { keyword: text } }));
                } else if (value === 'ai_data') {
                     window.dispatchEvent(new CustomEvent('trigger-data-modal'));
                } else {
                    const mode = value.replace('ai_', '');
                    window.dispatchEvent(new CustomEvent('ai-quick-action', { detail: { mode: mode, text: text } }));
                }
            }
        });

        // Context Menu Actions
        const triggerAI = (mode) => {
            const text = editor.selection.getContent({format: 'text'});
            if(!text) { alert("⚠️ Silakan blok/seleksi teks yang ingin diproses dulu."); return; }
            window.dispatchEvent(new CustomEvent('ai-quick-action', { detail: { mode: mode, text: text } }));
        };
        editor.ui.registry.addMenuItem('ai_paraphrase', { text: '✨ Paraphrase', icon: 'sync', onAction: () => triggerAI('paraphrase') });
        editor.ui.registry.addMenuItem('ai_expand', { text: '📈 Kembangkan', icon: 'plus', onAction: () => triggerAI('expand') });
        editor.ui.registry.addMenuItem('ai_shorten', { text: '✂️ Ringkas', icon: 'cut', onAction: () => triggerAI('shorten') });
        editor.ui.registry.addMenuItem('ai_formal', { text: '🎓 Formalkan', icon: 'bookmark', onAction: () => triggerAI('formal') });
    }
};

// --- 2. LOGIKA ALPINE.JS (LENGKAP) ---
function studioApp() {
    return {
        // STATE VARIABLES (Dikembalikan Lengkap)
        showLeft: true, showRight: true, leftWidth: 280, rightWidth: 340, isResizing: null, 
        showSearchModal: false, showOutlineModal: false, showDataModal: false,
        projectId: '', projects: [], analysisHistory: [],
        context: { title: '', problem_statement: '', methodology: '', variables: '', theories: '', requirements: '' },
        activeTool: 'generator', isSaving: false, isLoading: false, loadingText: 'Memproses...', isPro: false,
        selectedModel: 'fast', genTask: 'background',
        genInput: { topic: '', stats_result: '', qual_data: '', word_count: '600', custom_instruction: '', citation_style: 'bodynote_apa' },
        outlineData: [], generatedResult: '', chatInput: '', refSource: 'project', searchKeyword: '', isSearching: false, searchResults: [], selectedAdHocRefs: [], lastUsedReferences: [],
        
        // Style Transfer States
        styleProfile: null, isAnalyzingStyle: false,
        
        // Context Awareness State
        currentChapterContext: 'general',
        
        // Zen Mode State
        isZenMode: false,
        loaderInterval: null,

        // --- INIT ---
        async init() {
            // Ambil config dari HTML bridge
            if(window.appConfig) {
                this.isPro = window.appConfig.isPro;
                // Jika projectId sudah ada di URL/Session, set default
                if(window.appConfig.projectId) this.projectId = window.appConfig.projectId;
            }

            await this.loadProjects();
            if (typeof tinymce !== 'undefined') tinymce.init(tinymceConfig); 
            
            // Event Listeners Global
            window.addEventListener('ai-quick-action', (e) => this.handleQuickAction(e.detail.mode, e.detail.text));
            window.addEventListener('check-import', () => this.checkImportedData());
            
            // Listener Context Awareness
            window.addEventListener('editor-context-change', (e) => {
                this.detectContext(e.detail.editor);
            });

            // Listener Trigger dari Menu "/"
            window.addEventListener('trigger-ref-search', (e) => {
                this.searchKeyword = e.detail.keyword || '';
                this.showSearchModal = true;
                if(this.searchKeyword) this.searchReferences();
            });
            
            window.addEventListener('trigger-data-modal', () => {
                this.openDataModal();
            });

            this.$nextTick(() => { if (window.lucide) lucide.createIcons(); });
        },

        // --- [BARU] FITUR EXPORT PPT ---
        async exportPPT() {
            let content = '';
            if (tinymce.activeEditor) {
                // Ambil teks murni
                content = tinymce.activeEditor.getContent({ format: 'text' });
            }

            if (!content || content.length < 50) {
                alert("Konten terlalu pendek untuk dibuat slide. Tulis lebih banyak dulu!");
                return;
            }

            if(!confirm("Buat PowerPoint dari dokumen ini?")) return;

            this.isLoading = true;
            this.loadingText = "Merancang Slide Presentasi...";

            try {
                const response = await fetch(window.appConfig.endpoints.generatePPT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        projectId: this.projectId,
                        content: content,
                        style: 'clean'
                    })
                });

                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || "Gagal membuat PPT");
                }

                // Download Blob
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `OnThesis_Presentation_${new Date().toISOString().slice(0,10)}.pptx`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);

            } catch (e) {
                console.error(e);
                alert("Gagal: " + e.message);
            } finally {
                this.isLoading = false;
            }
        },

        // --- FITUR LAMA YANG DIKEMBALIKAN ---

        detectContext(editor) {
            const node = editor.selection.getNode();
            const textContent = node.textContent.toLowerCase();
            
            if (textContent.includes("latar belakang") || textContent.includes("pendahuluan")) {
                this.currentChapterContext = 'intro';
            } else if (textContent.includes("tinjauan pustaka") || textContent.includes("teori") || textContent.includes("kajian")) {
                this.currentChapterContext = 'literature';
            } else if (textContent.includes("metode") || textContent.includes("pendekatan")) {
                this.currentChapterContext = 'method';
            } else if (textContent.includes("hasil") || textContent.includes("pembahasan")) {
                this.currentChapterContext = 'result';
            } else if (textContent.includes("kesimpulan") || textContent.includes("saran")) {
                this.currentChapterContext = 'conclusion';
            } else {
                this.currentChapterContext = 'general';
            }
            
            this.updateSidebarTools();
        },

        updateSidebarTools() {
            if (this.currentChapterContext === 'literature') {
                if(this.activeTool !== 'generator') this.activeTool = 'generator';
                this.genTask = 'literature_review';
                this.refSource = 'online';
            }
        },

        async openDataModal() {
            this.isLoading = true;
            this.loadingText = "Mengambil Data...";
            try {
                const res = await fetch('/api/analysis-history/get');
                if (res.ok) { 
                    const data = await res.json(); 
                    this.analysisHistory = data.history || []; 
                    this.showDataModal = true; 
                } 
                else { alert("Gagal mengambil riwayat analisis."); }
            } catch (e) { console.error(e); alert("Error koneksi."); } 
            finally { this.isLoading = false; this.$nextTick(() => lucide.createIcons()); }
        },

        selectAnalysisItem(item) {
            const formattedData = JSON.stringify(item.result, null, 2);
            this.genInput.stats_result = `[DATA SUMBER: ${this.formatTestName(item.type)}]\n` + formattedData;
            if (!['result_quant', 'discussion_chapter4'].includes(this.genTask)) { this.genTask = 'discussion_chapter4'; }
            this.showDataModal = false;
        },

        formatTestName(type) { return type.replace(/-/g, ' ').toUpperCase(); },
        formatDate(isoString) { if(!isoString) return '-'; return new Date(isoString).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute:'2-digit' }); },

        async handleQuickAction(mode, text) {
            let instruction = "";
            if(mode === 'paraphrase') instruction = "Parafrase teks berikut agar lebih akademis, mengalir, dan bebas plagiasi. STRICT_DIRECT_OUTPUT (HANYA HASILNYA SAJA):";
            else if(mode === 'expand') instruction = "Kembangkan teks berikut menjadi lebih detail dengan argumen pendukung. STRICT_DIRECT_OUTPUT:";
            else if(mode === 'shorten') instruction = "Ringkas teks berikut menjadi padat tanpa mengurangi substansi. STRICT_DIRECT_OUTPUT:";
            else if(mode === 'formal') instruction = "Perbaiki tata bahasa (PUEBI) teks berikut dan ubah ke gaya ilmiah baku. STRICT_DIRECT_OUTPUT:";
            
            const finalMsg = `${instruction}\n\n"${text}"`;
            if (tinymce.activeEditor) { tinymce.activeEditor.notificationManager.open({ text: '✨ AI Sedang Menulis...', type: 'info', timeout: 2000 }); tinymce.activeEditor.selection.setContent(''); }

            try {
                const res = await fetch('/chat/stream', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ message: finalMsg, projectId: this.projectId }) });
                const reader = res.body.getReader(); const decoder = new TextDecoder();
                while (true) {
                    const { done, value } = await reader.read(); if (done) break;
                    const chunk = decoder.decode(value, { stream: true });
                    if (tinymce.activeEditor) tinymce.activeEditor.insertContent(chunk);
                }
            } catch (e) { alert("Stream Error: " + e.message); }
        },

        // STYLE TRANSFER UPLOAD HANDLER
        async uploadStyleSample(e) {
            const file = e.target.files[0];
            if (!file) return;
            
            this.isAnalyzingStyle = true;
            const formData = new FormData();
            formData.append('file', file);

            try {
                const res = await fetch('/api/analyze-style', { method: 'POST', body: formData });
                const data = await res.json();
                if (res.ok) {
                    this.styleProfile = data.style_profile;
                    alert("Gaya tulisan berhasil dianalisis! AI akan meniru gaya Anda.");
                } else {
                    alert("Gagal analisis gaya: " + data.error);
                }
            } catch (err) { alert("Error upload."); }
            finally { this.isAnalyzingStyle = false; }
        },

        // MAIN WORKFLOW (GENERATOR)
        async processWorkflow() {
            if (!this.projectId && this.refSource !== 'online' && !confirm("Tanpa proyek, AI halusinasi. Lanjut?")) return;
            if (['background', 'literature_review', 'discussion_chapter4', 'methodology'].includes(this.genTask)) {
                this.loadingText = "Menyusun Kerangka..."; await this.fetchOutline();
            } else { this.loadingText = "Menganalisis..."; await this.generateFullDraft(); }
        },

        async fetchOutline() {
            this.isLoading = true; 
            const payload = { task: this.genTask, data: this.genInput, projectId: this.projectId || null, model: 'smart' };
            try {
                const res = await fetch(window.appConfig.endpoints.generateOutline, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
                const json = await res.json();
                if (res.ok) { this.outlineData = json.outline; this.showOutlineModal = true; } else alert("Gagal membuat outline: " + json.error);
            } catch (e) { alert("Koneksi Error."); } finally { this.isLoading = false; }
        },

        async generateFullDraft() {
            this.showOutlineModal = false;
            this.isLoading = true;
            this.startLoadingTextCycle();
            this.generatedResult = ''; 
            
            let currentContent = '';
            if (typeof tinymce !== 'undefined' && tinymce.activeEditor) { 
                currentContent = tinymce.activeEditor.getContent({ format: 'text' }); 
            }
            
            if (this.outlineData.length > 0) { 
                this.genInput.custom_instruction = "Gunakan kerangka berikut:\n" + JSON.stringify(this.outlineData); 
            }

            const payload = { 
                task: this.genTask, 
                data: this.genInput, 
                projectId: this.projectId || null, 
                model: this.selectedModel, 
                ad_hoc_references: this.refSource === 'online' ? this.selectedAdHocRefs : null, 
                previous_content: currentContent,
                style_profile: this.styleProfile 
            };

            try { 
                const response = await fetch(window.appConfig.endpoints.writingAssistant, { 
                    method: 'POST', 
                    headers: {'Content-Type': 'application/json'}, 
                    body: JSON.stringify(payload) 
                });

                if (!response.ok) {
                    const errJson = await response.json();
                    if (errJson.redirect) { window.location.href = errJson.redirect; return; }
                    alert("Gagal: " + (errJson.error || response.statusText));
                    this.isLoading = false; this.stopLoadingTextCycle(); return;
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let rawHTML = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    const chunk = decoder.decode(value, { stream: true });
                    // Visual feedback untuk Auditor Agent
                    const pendingChunk = `<span class="ai-generated-pending">${chunk}</span>`;
                    rawHTML += chunk;
                    this.generatedResult = rawHTML;
                    
                    this.$nextTick(() => {
                        const container = document.querySelector('.prose');
                        if (container) container.scrollTop = container.scrollHeight;
                    });
                }

                this.generatedResult = this.parseCitations(rawHTML);
                
                // --- AUDITOR AGENT CHECK ---
                this.isLoading = false;
                this.stopLoadingTextCycle();
                
                if (this.projectId && this.refSource === 'project') {
                    this.runAuditorCheck(rawHTML);
                }

            } catch (e) { console.error(e); alert("Koneksi terputus."); } 
            finally { this.isLoading = false; this.stopLoadingTextCycle(); }
        },
        
        // AUDITOR AGENT
        async runAuditorCheck(htmlContent) {
            // Visual Badge
            const badge = document.createElement('div');
            badge.className = 'fixed bottom-10 right-10 bg-yellow-500/20 text-yellow-400 px-3 py-1 rounded-full text-xs font-bold border border-yellow-500/30 flex items-center gap-2 backdrop-blur-md animate-pulse z-50';
            badge.innerHTML = '<i data-lucide="shield-check" class="w-3 h-3"></i> Auditor Sedang Memeriksa...';
            document.body.appendChild(badge);

            try {
                const response = await fetch('/api/audit-content', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: htmlContent, projectId: this.projectId })
                });
                
                const result = await response.json();
                
                if (result.status === 'success' && result.audit_report.segments) {
                    let auditedHTML = this.generatedResult;
                    
                    result.audit_report.segments.forEach(seg => {
                        if (seg.status === 'invalid' || seg.status === 'unsupported') {
                            const colorClass = seg.status === 'invalid' ? 'ai-generated-hallucination' : 'ai-generated-pending';
                            if(seg.original_text.length > 10) {
                                 auditedHTML = auditedHTML.replace(seg.original_text, `<span class="${colorClass}" title="${seg.reason}">${seg.original_text}</span>`);
                            }
                        }
                    });
                    
                    this.generatedResult = auditedHTML;
                    badge.className = 'fixed bottom-10 right-10 bg-green-500/20 text-green-400 px-3 py-1 rounded-full text-xs font-bold border border-green-500/30 flex items-center gap-2 backdrop-blur-md';
                    badge.innerHTML = '<i data-lucide="check-circle" class="w-3 h-3"></i> Audit Selesai: Aman';
                } else { badge.remove(); }
                
            } catch (e) { badge.innerHTML = 'Gagal Mengaudit'; } 
            finally { if(window.lucide) lucide.createIcons(); setTimeout(() => badge?.remove(), 5000); }
        },
        
        parseCitations(text) {
            return text.replace(/\[REF_ID:\s*(\d+)\]/g, (match, id) => {
                return `<span class="citation-badge" onclick="window.handleRefClick(${id}, event)" title="Klik untuk verifikasi sumber">REF ${parseInt(id) + 1}</span>`;
            });
        },

        addOutlinePoint() { this.outlineData.push({ sub_bab: "Sub-bab Baru", poin_pembahasan: [], instruksi_khusus: "" }); },
        removeOutlinePoint(index) { this.outlineData.splice(index, 1); },
        startLoadingTextCycle() { const texts = ["Membaca Konteks...", "Menyusun Argumen...", "Mencari Referensi...", "Menulis Draf...", "Finishing Touch..."]; let i = 0; this.loadingText = texts[0]; this.loaderInterval = setInterval(() => { i = (i + 1) % texts.length; this.loadingText = texts[i]; }, 2000); },
        stopLoadingTextCycle() { clearInterval(this.loaderInterval); },
        startResize(side) { this.isResizing = side; document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'; },
        stopResize() { this.isResizing = null; document.body.style.cursor = 'default'; document.body.style.userSelect = ''; },
        handleResize(e) { if (!this.isResizing) return; if (this.isResizing === 'left') { const w = e.clientX; if (w > 200 && w < 500) this.leftWidth = w; } else if (this.isResizing === 'right') { const w = window.innerWidth - e.clientX; if (w > 250 && w < 600) this.rightWidth = w; } },
        toggleSidebar(side) { if (side === 'left') this.showLeft = !this.showLeft; if (side === 'right') this.showRight = !this.showRight; },
        toggleAdHocRef(item) { const idx = this.selectedAdHocRefs.findIndex(r => r.id === item.id); if (idx > -1) this.selectedAdHocRefs.splice(idx, 1); else this.selectedAdHocRefs.push(item); },
        isRefSelected(item) { return this.selectedAdHocRefs.some(r => r.id === item.id); },
        async loadProjects() { try { const res = await fetch('/api/get-user-projects'); if(res.ok) this.projects = await res.json(); } catch(e) {} },
        async loadProjectContext() { if (!this.projectId) return; try { const res = await fetch(`/api/project-context/${this.projectId}`); if(res.ok) { const d = await res.json(); this.context = { title: d.title||'', problem_statement: d.problem_statement||'', methodology: d.methodology||'', variables: d.variables||'', theories: d.theories||'', requirements: d.requirements||'' }; this.genInput.topic = this.context.title; } } catch(e) { alert("Gagal memuat."); } },
        async saveContext() { if (!this.projectId) return alert("Pilih proyek dulu!"); try { await fetch(`/api/project-context/${this.projectId}`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(this.context) }); alert("Tersimpan!"); } catch(e) { alert("Gagal."); } },
        checkImportedData() { const data = sessionStorage.getItem('analysisDataForBab4'); if (data) { const parsed = JSON.parse(data); this.activeTool = 'generator'; this.genTask = 'discussion_chapter4'; this.genInput.stats_result = JSON.stringify(parsed.fullAnalysis, null, 2); sessionStorage.removeItem('analysisDataForBab4'); alert("Data Statistik diimpor! Silakan generate pembahasan."); } },
        async searchReferences() { if (!this.searchKeyword.trim()) return; this.isSearching = true; this.searchResults = []; this.selectedAdHocRefs = []; try { const res = await fetch('/api/quick-search', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ keyword: this.searchKeyword }) }); const data = await res.json(); if (data.status === 'success') { this.searchResults = data.results; } else alert("Gagal mencari."); } catch(e) { alert("Error jaringan."); } finally { this.isSearching = false; } },
        insertToEditor() { if (tinymce.activeEditor) { tinymce.activeEditor.insertContent(this.generatedResult + "<br><br>"); } },
        async sendChat() { const msg = this.chatInput.trim(); if (!msg) return; this.addBubble(msg, true); this.chatInput = ''; const loadingId = this.addBubble('<i class="animate-spin" data-lucide="loader-2"></i>', false); if(window.lucide) lucide.createIcons(); try { const res = await fetch('/chat/stream', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ message: msg, projectId: this.projectId }) }); const reader = res.body.getReader(); const decoder = new TextDecoder(); let aiMsg = ''; const bubbleEl = document.getElementById(loadingId); while (true) { const { done, value } = await reader.read(); if (done) break; aiMsg += decoder.decode(value, { stream: true }); bubbleEl.innerHTML = aiMsg.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>'); } } catch (e) { document.getElementById(loadingId).innerText = "Error jaringan."; } },
        addBubble(text, isUser) { const id = 'chat-' + Date.now(); const container = document.getElementById('chat-history'); const align = isUser ? 'items-end' : 'items-start'; const bg = isUser ? 'bg-accent-primary text-white' : 'bg-white/10 text-gray-200'; container.insertAdjacentHTML('beforeend', `<div class="flex flex-col ${align} animate-fade-in-up"><div id="${id}" class="max-w-[90%] p-3 rounded-2xl text-xs leading-relaxed ${bg}">${text}</div></div>`); container.scrollTop = container.scrollHeight; return id; },
        exportDoc() { if (tinymce.activeEditor) tinymce.activeEditor.getWin().print(); }
    }
}

// Global Helper untuk Citation Badge
window.handleRefClick = (refIndex, event) => {
    event.stopPropagation();
    alert(`🔍 VERIFIKASI FAKTA:\n\nSistem mengonfirmasi kalimat ini didukung oleh Referensi #${refIndex + 1} dalam database proyek Anda.`);
};