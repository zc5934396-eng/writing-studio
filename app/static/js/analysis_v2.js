/**
 * ONTHESIS PRO - ANALYSIS ENGINE V2 (ULTIMATE VERSION)
 * Stack: Alpine.js + Handsontable + Plotly + Groq AI
 * Features: 13+ Statistical Tests, Auto-Save, Smart Import, Full Visualization, AI Chat Consultant
 */

document.addEventListener('alpine:init', () => {
    Alpine.data('analysisApp', () => ({
        // --- STATE MANAGEMENT ---
        activeTab: 'data',
        saveStatus: 'Saved',
        isLoading: false,
        activeMenu: null,
        isPro: false, // Status Member
        
        // --- DATA STORE ---
        hotData: null,
        hotVar: null,
        variables: [],
        history: [],
        currentHistoryId: null,
        outputHtml: '',
        
        // --- AI CHAT STATE ---
        chatInput: '',
        chatHistory: [],
        isChatting: false,
        selectedModel: 'fast', // Default Llama 3.3
        
        // --- MODALS ---
        modals: {
            smartImport: false, analysis: false, missing: false, 
            findReplace: false, smartScan: false, advisor: false
        },
        
        // --- IMPORT DATA ---
        smartImport: { file: null, columns: [], total_columns: 0, headerRow: 0, previewData: [] },
        scanReport: { total_rows: 0, total_cols: 0, duplicates: 0, columns: [] },

        // --- ANALYSIS CONFIGURATION ---
        analysisConfig: {
            type: '', title: '', 
            l1: 'Variables', l2: 'Group', 
            twoGroups: false,
            limitTarget1: false, // e.g. Regression Dependent Var must be 1
            limitTarget2: false  // e.g. ANOVA Factor must be 1
        },
        selectedVars: [],
        target1: [],
        target2: [],
        targetSelection: null,

        // --- TOASTS ---
        toasts: [],

        // ====================================================================
        // 1. INITIALIZATION
        // ====================================================================
        init() {
            console.log("🚀 OnThesis Engine V2: Full Power Mode");
            
            // Ambil status PRO dari atribut body
            this.isPro = document.body.dataset.userPro === 'true';
            
            this.$nextTick(() => {
                this.initDataGrid();
                this.initVariableGrid();
                this.loadProjectData();
                
                // [FIX] Gunakan loadServerHistory yang lebih lengkap, hapus fetchHistory lama
                this.loadServerHistory();
                
                if(window.lucide) lucide.createIcons();
            });
            
            window.addEventListener('resize', () => {
                if(this.hotData) this.hotData.render();
                if(this.hotVar) this.hotVar.render();
            });

            this.$watch('activeTab', (val) => {
                if (val === 'data' && this.hotData) setTimeout(() => this.hotData.render(), 100);
                if (val === 'variable' && this.hotVar) setTimeout(() => this.hotVar.render(), 100);
                if (window.lucide) lucide.createIcons();
                // Scroll chat to bottom if tab switched to chat
                if (val === 'chat') this.scrollToBottom();
            });
        },

        toggleMenu(name) { this.activeMenu = this.activeMenu === name ? null : name; },
        closeModal(name) { this.modals[name] = false; },

        // ====================================================================
        // 2. GRID SYSTEM
        // ====================================================================
        initDataGrid() {
            const container = document.getElementById('hot-data-view');
            if (!container) return;
            this.hotData = new Handsontable(container, {
                data: this.generateEmptyRows(50, 20),
                rowHeaders: true, colHeaders: true,
                height: '100%', width: '100%',
                licenseKey: 'non-commercial-and-evaluation',
                contextMenu: true, manualColumnResize: true, stretchH: 'all',
                afterChange: (c, s) => { if(s!=='loadData' && c) this.saveDataChanges(c); }
            });
        },
        initVariableGrid() {
            const container = document.getElementById('hot-variable-view');
            if (!container) return;
            this.hotVar = new Handsontable(container, {
                data: [],
                colHeaders: ['Name', 'Type', 'Label', 'Measure', 'Role'],
                columns: [
                    { data: 'name', type: 'text' },
                    { data: 'type', type: 'dropdown', source: ['Numeric', 'String'] },
                    { data: 'label', type: 'text' },
                    { data: 'measure', type: 'dropdown', source: ['Scale', 'Ordinal', 'Nominal'] },
                    { data: 'role', type: 'dropdown', source: ['Input', 'Target', 'Both'] }
                ],
                rowHeaders: true, height: '100%', width: '100%', stretchH: 'all',
                licenseKey: 'non-commercial-and-evaluation',
                afterChange: (c, s) => { if(s!=='loadData' && c) this.saveVariableChanges(c); }
            });
        },

        // ====================================================================
        // 3. DATA SYNC & MANAGEMENT
        // ====================================================================
        async loadProjectData() {
            try {
                const [resMeta, resData] = await Promise.all([
                    fetch('/api/variable-view/get'),
                    fetch('/api/data-view/get')
                ]);
                const meta = await resMeta.json();
                const data = await resData.json();

                if (meta.variables) {
                    this.variables = meta.variables;
                    this.hotVar.loadData(this.variables);
                    this.hotData.updateSettings({ colHeaders: this.variables.map(v => v.name) });
                }
                if (data.data && data.data.length) this.hotData.loadData(data.data);
                else this.hotData.loadData(this.generateEmptyRows(50, this.variables.length || 10));
            } catch (e) { this.showToast('Error', 'Gagal memuat data.', 'error'); }
        },

        async saveDataChanges(changes) {
            this.saveStatus = 'Saving...';
            try {
                for (let [r, p, o, n] of changes) {
                    if (o === n) continue;
                    await fetch('/api/data-view/update', {
                        method: 'POST', headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ row: r, col: this.hotData.propToCol(p), value: n })
                    });
                }
                this.saveStatus = 'Saved';
            } catch (e) { this.saveStatus = 'Error'; }
        },

        async saveVariableChanges(changes) {
            this.saveStatus = 'Saving...';
            try {
                for (let [r, p, o, n] of changes) {
                    if (o === n) continue;
                    const name = (p === 'name') ? o : this.hotVar.getDataAtRowProp(r, 'name');
                    if (!name && p !== 'name') continue;
                    await fetch('/api/variable-view/update', {
                        method: 'POST', headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ name, field: p, value: n })
                    });
                    if (p === 'name') await this.loadProjectData();
                }
                this.saveStatus = 'Saved';
            } catch (e) { this.saveStatus = 'Error'; }
        },

        // ====================================================================
        // 4. SMART IMPORT
        // ====================================================================
        async handleFileUpload(e) {
            const file = e.target.files[0]; if (!file) return;
            this.activeMenu = null;
            this.showToast('Analyzing', 'Reading file structure...', 'info');
            
            const fd = new FormData(); fd.append('file', file);
            try {
                const res = await fetch('/api/project/smart-import', { method: 'POST', body: fd });
                const data = await res.json();
                if (data.status === 'success') {
                    this.smartImport = { file, ...data, previewData: data.preview_data };
                    this.modals.smartImport = true;
                } else throw new Error(data.error);
            } catch (err) { this.showToast('Error', err.message, 'error'); }
            e.target.value = '';
        },

        async confirmSmartImport() {
            this.isLoading = true; this.modals.smartImport = false;
            try {
                const payload = { data: this.smartImport.previewData, headers: this.smartImport.columns.map(c => c.name) };
                const res = await fetch('/api/project/initialize', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
                const json = await res.json();
                if (json.status === 'success') { 
                    this.showToast('Success', 'Data imported!', 'success'); 
                    window.location.reload(); 
                } else throw new Error(json.error);
            } catch (err) { this.showToast('Error', err.message, 'error'); }
            finally { this.isLoading = false; }
        },

        async downloadDataset() { window.location.href = '/api/project/export-data'; },
        async initializeProject() {
            if(confirm("Reset project? Data will be lost.")) {
                await fetch('/api/project/reset', {method:'POST'}); window.location.reload();
            }
        },

        // ====================================================================
        // 5. DATA PREP & TOOLS
        // ====================================================================
        async runSmartScan() {
            this.isLoading = true; this.showToast('Scanning', 'Analyzing data quality...', 'info');
            try {
                const res = await fetch('/api/data-preparation/smart-scan');
                const data = await res.json();
                if(data.status === 'success') {
                    this.scanReport = data.report;
                    this.modals.smartScan = true;
                } else throw new Error(data.message);
            } catch(e) { this.showToast('Error', e.message, 'error'); }
            finally { this.isLoading = false; }
        },

        async runDataPrep(action) {
            let payload = {}, endpoint = '', close = null;
            if(action === 'duplicates') endpoint = '/api/data-preparation/remove-duplicates';
            else if(action === 'missing') {
                endpoint = '/api/data-preparation/missing-values';
                payload = { action: document.getElementById('mv-action').value };
                close = 'missing';
            }
            else if(action.includes('find')) { this.handleFindReplace(action); return; }

            this.isLoading = true;
            try {
                const res = await fetch(endpoint, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
                const data = await res.json();
                if(data.status === 'success') {
                    this.showToast('Success', data.message, 'success');
                    if(close) this.closeModal(close);
                    this.loadProjectData();
                } else throw new Error(data.message);
            } catch(e) { this.showToast('Error', e.message, 'error'); }
            finally { this.isLoading = false; }
        },

        async handleFindReplace(action) {
            const find = document.getElementById('fr-find').value;
            if(!find) return this.showToast('Warning', 'Input text to find.', 'warning');
            this.isLoading = true;
            try {
                if(action === 'find-all') {
                    const res = await fetch('/api/data-preparation/search-data', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({query:find})});
                    const data = await res.json();
                    if(data.results.length) {
                        const f = data.results[0];
                        this.hotData.scrollViewportTo(f.row, f.col); this.hotData.selectCell(f.row, f.col);
                        this.showToast('Found', `${data.results.length} matches.`, 'success');
                    } else this.showToast('Info', 'No match found.', 'warning');
                } else {
                    const replace = document.getElementById('fr-replace').value;
                    const exact = document.getElementById('fr-exact').checked;
                    const res = await fetch('/api/data-preparation/find-replace', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({find, replace, exact_match:exact})});
                    const data = await res.json();
                    if(data.status==='success') { this.showToast('Success', data.message, 'success'); this.loadProjectData(); this.closeModal('findReplace'); }
                }
            } catch(e) { console.error(e); } finally { this.isLoading = false; }
        },

        // ====================================================================
        // 6. ANALYSIS ENGINE
        // ====================================================================
        
        openAnalysis(type) {
            this.selectedVars = []; this.target1 = []; this.target2 = []; this.targetSelection = null;
            
            // Konfigurasi Spesifik Tiap Uji
            const configs = {
                'descriptive-analysis': { title: 'Descriptive Statistics', l1: 'Variables:', twoGroups: false },
                'normality': { title: 'Normality Test', l1: 'Dependent List:', twoGroups: false },
                'independent-ttest': { title: 'Independent Samples T-Test', l1: 'Test Variable(s):', l2: 'Grouping Variable:', twoGroups: true, limitTarget2: true },
                'paired-ttest': { title: 'Paired Samples T-Test', l1: 'Variable 1:', l2: 'Variable 2:', twoGroups: true },
                'oneway-anova': { title: 'One-Way ANOVA', l1: 'Dependent List:', l2: 'Factor:', twoGroups: true, limitTarget2: true },
                'correlation-analysis': { title: 'Bivariate Correlation', l1: 'Variables:', twoGroups: false },
                'linear-regression': { title: 'Linear Regression', l1: 'Dependent (Y):', l2: 'Independent (X):', twoGroups: true, limitTarget1: true },
                'mann-whitney': { title: 'Mann-Whitney U', l1: 'Test List:', l2: 'Grouping Var:', twoGroups: true, limitTarget2: true },
                'kruskal-wallis': { title: 'Kruskal-Wallis H', l1: 'Test List:', l2: 'Grouping Var:', twoGroups: true, limitTarget2: true },
                'wilcoxon': { title: 'Wilcoxon Signed Rank', l1: 'Variable 1:', l2: 'Variable 2:', twoGroups: true },
                'reliability': { title: 'Reliability Analysis', l1: 'Items:', twoGroups: false },
                'validity': { title: 'Validity Test (Pearson)', l1: 'Items:', twoGroups: false },
                'chi-square': { title: 'Chi-Square Test', l1: 'Row(s):', l2: 'Column(s):', twoGroups: true, limitTarget1: true, limitTarget2: true }
            };

            if (configs[type]) {
                this.analysisConfig = { ...configs[type], type };
                this.modals.analysis = true;
                this.activeMenu = null;
            } else {
                this.showToast('Info', 'Coming soon.', 'info');
            }
        },

        toggleSelection(name) {
            if(this.selectedVars.includes(name)) this.selectedVars = this.selectedVars.filter(v => v !== name);
            else this.selectedVars.push(name);
        },

        moveVarsToTarget(box) {
            if(!this.selectedVars.length) return;
            const cfg = this.analysisConfig;

            if (box === 1) {
                if (cfg.limitTarget1 && (this.target1.length + this.selectedVars.length > 1)) {
                    return this.showToast('Limit', `Box ini hanya menerima 1 variabel.`, 'warning');
                }
                const toAdd = this.selectedVars.filter(v => !this.target1.includes(v));
                if (cfg.limitTarget1) this.target1 = [this.selectedVars[0]]; // Replace
                else this.target1.push(...toAdd);
            } else {
                if (cfg.limitTarget2 && (this.target2.length + this.selectedVars.length > 1)) {
                     return this.showToast('Limit', `Box ini hanya menerima 1 variabel.`, 'warning');
                }
                const toAdd = this.selectedVars.filter(v => !this.target2.includes(v));
                if (cfg.limitTarget2) this.target2 = [this.selectedVars[0]]; // Replace
                else this.target2.push(...toAdd);
            }
            this.selectedVars = [];
        },

        removeVarsFromTarget(box) {
            if(!this.targetSelection) return;
            if(box === 1) this.target1 = this.target1.filter(v => v !== this.targetSelection);
            else this.target2 = this.target2.filter(v => v !== this.targetSelection);
            this.targetSelection = null;
        },

        async runAnalysis() {
            if (!this.target1.length) return this.showToast('Error', 'Target variables required.', 'error');
            
            this.isLoading = true;
            const type = this.analysisConfig.type;
            let payload = {};

            // PAYLOAD BUILDER
            if (['independent-ttest', 'mann-whitney', 'kruskal-wallis'].includes(type)) {
                payload = { test_vars: this.target1, group_var: this.target2[0] };
            } else if (['paired-ttest', 'wilcoxon'].includes(type)) {
                payload = { var1: this.target1, var2: this.target2 };
            } else if (type === 'oneway-anova') {
                payload = { dependent_list: this.target1, factor: this.target2[0] };
            } else if (type === 'linear-regression') {
                payload = { dependent: this.target1[0], independents: this.target2 };
            } else if (type === 'chi-square') {
                payload = { row_var: this.target1[0], col_var: this.target2[0] };
            } else if (['reliability', 'validity'].includes(type)) {
                payload = { items: this.target1 };
            } else {
                payload = { variables: this.target1 }; // Default
            }

            try {
                // 1. Jalankan Analisis (API Lama)
                const res = await fetch(`/api/${type}`, {
                    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)
                });
                const response = await res.json();

                if (response.success) {
                    this.modals.analysis = false;
                    this.activeTab = 'output';
                    this.outputHtml = this.generateReportHTML(type, response.data);

                    // --- [FITUR BARU] AUTO SAVE KE FIRESTORE ---
                    // Ambil data mentah dari tabel untuk dikirim ke server
                    const rawData = this.hotData.getData();
                    const headers = rawData[0];
                    const rows = rawData.slice(1).filter(r => r.some(c => c !== null && c !== ''));

                    // Kirim ke Backend (Auto-Save)
                    const serverData = await this.uploadAnalysis(type, headers, rows);
                    
                    // Update history item terakhir dengan data dari server (untuk ID sinkron)
                    if (this.history.length > 0 && serverData) {
                       this.history[0].aiNarrative = serverData.ai_narrative;
                    }
                    
                    this.fetchHistory(); // Refresh history list dari server
                    this.showToast('Success', 'Analisis selesai & tersimpan di database.', 'success');
                    // ---------------------------------------------
                    
                    // AUTO-SAVE FOR WRITING STUDIO (Session Storage - Legacy)
                    const bab4Context = {
                        testName: type.replace(/-/g, ' ').toUpperCase(),
                        fullAnalysis: response.data,
                        summary: "Hasil analisis otomatis."
                    };
                    sessionStorage.setItem('analysisDataForBab4', JSON.stringify(bab4Context));
                    
                } else {
                    if (response.redirect) window.location.href = response.redirect;
                    else throw new Error(response.error || 'Server Error');
                }
            } catch (e) { this.showToast('Failed', e.message, 'error'); }
            finally { this.isLoading = false; }
        },
        
        // ====================================================================
        // 7. DATA ANALYST CHAT (AI)
        // ====================================================================
        
        async sendDataChat(manualMsg = null) {
            const message = manualMsg || this.chatInput.trim();
            if (!message) return;

            // Tambahkan pesan user ke UI
            this.chatHistory.push({ role: 'user', content: message });
            this.chatInput = '';
            this.isChatting = true;
            this.scrollToBottom();

            try {
                const response = await fetch('/api/data-analyst/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: message, model: this.selectedModel })
                });

                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || "Gagal terhubung ke AI.");
                }

                // Siapkan bubble kosong untuk AI
                const aiIndex = this.chatHistory.push({ role: 'ai', content: '' }) - 1;
                
                // Streaming Reader
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                const converter = new showdown.Converter({ simpleLineBreaks: true, tables: true });
                let rawText = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    rawText += decoder.decode(value, { stream: true });
                    // Update content real-time (render Markdown)
                    this.chatHistory[aiIndex].content = converter.makeHtml(rawText);
                    this.scrollToBottom();
                }

            } catch (e) {
                this.chatHistory.push({ role: 'ai', content: `<span class="text-red-500 font-bold">Error: ${e.message}</span>` });
            } finally {
                this.isChatting = false;
                this.scrollToBottom();
            }
        },

        scrollToBottom() {
            this.$nextTick(() => {
                const container = document.getElementById('data-chat-container');
                if (container) container.scrollTop = container.scrollHeight;
            });
        },
        
        openAdvisor() {
            this.activeTab = 'chat';
            this.sendDataChat("Saya ingin konsultasi tentang uji statistik yang cocok untuk data ini.");
        },

        // ====================================================================
        // 8. REPORT GENERATOR (ULTIMATE FIX)
        // ====================================================================
        generateReportHTML(type, data) {
            const fmt = (n) => (n!=null && !isNaN(n)) ? Number(n).toLocaleString('en-US',{minimumFractionDigits:3,maximumFractionDigits:3}) : '-';
            const fmtP = (p) => { const v=parseFloat(p); if(v<0.001)return'< .001'; return v.toFixed(3); };
            const badge = (p) => {
                const v = parseFloat(p);
                if (isNaN(v)) return '-';
                return v < 0.05 
                    ? '<span class="bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded font-bold">Sig.</span>' 
                    : '<span class="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded">Not Sig.</span>';
            };

            // 1. Ekstrak Narasi AI & Data Utama
            let narrative = data.ai_narrative_summary || null;
            let realData = data;
            
            // Handle wrapper 'details'
            if (!Array.isArray(data) && data.details && (Array.isArray(data.details) || typeof data.details === 'object')) {
                realData = data.details;
            }

            let html = `<div class="bg-white rounded-xl border border-slate-200 shadow-sm mb-8 overflow-hidden">
                <div class="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                    <div><h2 class="text-xl font-bold text-slate-800 uppercase tracking-wide">${type.replace(/-/g, ' ')}</h2><p class="text-xs text-slate-500 mt-1">OnThesis Pro Analysis</p></div>
                    <div class="px-3 py-1 bg-white border border-slate-200 rounded text-xs font-mono text-slate-500">${new Date().toLocaleTimeString()}</div>
                </div>
                <div class="p-6">`;

            // 2. Tampilkan AI Insight
            if (narrative) {
                html += `<div class="mb-6 bg-indigo-50 border border-indigo-100 p-4 rounded-lg flex gap-3 items-start animate-in fade-in slide-in-from-top-2">
                    <div class="bg-indigo-100 p-1.5 rounded text-indigo-600 mt-0.5"><i data-lucide="sparkles" class="w-4 h-4"></i></div>
                    <div><h4 class="text-xs font-bold text-indigo-800 uppercase mb-1">AI Smart Insight</h4>
                    <p class="text-sm text-indigo-900 leading-relaxed italic">"${narrative}"</p></div>
                </div>`;
            }

            // --- RENDERER LOGIC ---
            
            // A. DESCRIPTIVE
            if (type === 'descriptive-analysis') {
                let rows = Object.entries(realData)
                    .filter(([k]) => k !== 'ai_narrative_summary' && k !== 'details')
                    .map(([k, v]) => `<tr><td class="p-3 border-b font-medium">${v.label||k}</td><td class="p-3 border-b text-center">${v.n}</td><td class="p-3 border-b text-right font-mono">${fmt(v.stats?.mean)}</td><td class="p-3 border-b text-right font-mono">${fmt(v.stats?.std)}</td><td class="p-3 border-b text-right font-mono">${fmt(v.stats?.min)}</td><td class="p-3 border-b text-right font-mono">${fmt(v.stats?.max)}</td></tr>`).join('');
                html += `<div class="overflow-x-auto rounded-lg border border-slate-200"><table class="w-full text-sm text-left"><thead><tr class="bg-slate-50 border-b"><th class="p-3">Var</th><th class="p-3 text-center">N</th><th class="p-3 text-right">Mean</th><th class="p-3 text-right">Std.Dev</th><th class="p-3 text-right">Min</th><th class="p-3 text-right">Max</th></tr></thead><tbody>${rows}</tbody></table></div>`;
            }
            
            // B. NORMALITY
            else if (type === 'normality') {
                let rows = Array.isArray(realData) ? realData.map(r => `<tr><td class="p-3 border-b font-medium">${r.label}</td><td class="p-3 border-b text-right font-mono">${fmt(r.shapiro?.stat)}</td><td class="p-3 border-b text-right font-bold ${parseFloat(r.shapiro?.sig)>0.05?'text-green-600':'text-red-500'}">${fmtP(r.shapiro?.sig)}</td><td class="p-3 border-b text-center"><span class="px-2 py-0.5 rounded text-xs font-bold ${r.normal?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}">${r.normal?'Normal':'Tidak Normal'}</span></td></tr>`).join('') : '';
                html += `<div class="overflow-x-auto rounded-lg border border-slate-200"><table class="w-full text-sm text-left"><thead><tr class="bg-slate-50 border-b"><th class="p-3">Var</th><th class="p-3 text-right">Statistic (SW)</th><th class="p-3 text-right">Sig.</th><th class="p-3 text-center">Status</th></tr></thead><tbody>${rows}</tbody></table></div>`;
            }
            
            // C. COMPARISON (T-TEST, MANN-WHITNEY, WILCOXON, PAIRED)
            else if (['independent-ttest', 'mann-whitney', 'paired-ttest', 'wilcoxon'].includes(type)) {
                let rows = '';
                // Handle struktur data yang mungkin beda dikit antar test
                const entries = Array.isArray(realData) ? realData : Object.entries(realData);
                
                for(let item of entries) {
                    let k = Array.isArray(item) ? item[0] : (item.pair || item.variable || 'Var');
                    let v = Array.isArray(item) ? item[1] : item;
                    
                    if(k === 'ai_narrative_summary' || k === 'details') continue;
                    if(v.error) continue;

                    let stat = v.t_stat || v.u_stat || v.w_stat || v.statistic; 
                    let sig = v.sig || v.p_value || v.sig_2tailed;
                    
                    rows += `<tr><td class="p-3 border-b font-medium">${v.label||k}</td><td class="p-3 border-b text-right font-mono">${fmt(stat)}</td><td class="p-3 border-b text-right font-bold text-blue-600">${fmtP(sig)}</td><td class="p-3 border-b text-center">${badge(sig)}</td></tr>`;
                }
                html += `<div class="overflow-x-auto rounded-lg border border-slate-200"><table class="w-full text-sm text-left"><thead><tr class="bg-slate-50 border-b"><th class="p-3">Variable / Pair</th><th class="p-3 text-right">Statistic</th><th class="p-3 text-right">Sig.</th><th class="p-3 text-center">Conclusion</th></tr></thead><tbody>${rows}</tbody></table></div>`;
            }

            // D. ANOVA & KRUSKAL-WALLIS
            else if (['oneway-anova', 'kruskal-wallis'].includes(type)) {
                // ANOVA biasanya return single object bukan list of objects
                let stat = realData.f_value || realData.statistic || realData.H_stat;
                let sig = realData.sig || realData.p_value;
                let df = realData.df_between ? `${realData.df_between}, ${realData.df_within}` : (realData.df || '-');
                
                html += `<div class="mb-4 flex gap-4">
                    <div class="p-4 bg-slate-50 border rounded flex-1 text-center"><strong>Statistic (F/H)</strong><br><span class="text-lg">${fmt(stat)}</span></div>
                    <div class="p-4 bg-slate-50 border rounded flex-1 text-center"><strong>df</strong><br><span class="text-lg">${df}</span></div>
                    <div class="p-4 ${parseFloat(sig)<0.05?'bg-green-50 border-green-200':'bg-red-50 border-red-200'} border rounded flex-1 text-center"><strong>Sig.</strong><br><span class="text-lg font-bold">${fmtP(sig)}</span></div>
                </div>`;
                
                // Jika ada post-hoc atau detail groups, bisa ditambah di sini nanti
            }
            
            // E. REGRESSION
            else if (type === 'linear-regression') {
                let rows = data.coefficients.map(c => `<tr><td class="p-3 border-b font-medium">${c.variable}</td><td class="p-3 border-b text-right font-bold">${fmt(c.B)}</td><td class="p-3 border-b text-right">${fmt(c.t)}</td><td class="p-3 border-b text-right font-bold ${parseFloat(c.sig)<0.05?'text-green-600':''}">${fmtP(c.sig)}</td></tr>`).join('');
                html += `<div class="mb-4 p-4 bg-slate-50 rounded border border-slate-200 flex gap-8"><div class="text-center"><strong>R Square</strong><br>${fmt(data.r_square)}</div><div class="text-center"><strong>F Stat</strong><br>${fmt(data.f_val)}</div><div class="text-center"><strong>Sig. F</strong><br>${fmtP(data.sig_f)}</div></div>`;
                html += `<div class="overflow-x-auto rounded-lg border border-slate-200"><table class="w-full text-sm text-left"><thead><tr class="bg-slate-50 border-b"><th class="p-3">Model</th><th class="p-3 text-right">B (Coeff)</th><th class="p-3 text-right">t</th><th class="p-3 text-right">Sig.</th></tr></thead><tbody>${rows}</tbody></table></div>`;
            }
            
            // F. CORRELATION
            else if (type === 'correlation-analysis') {
                let matrix = data.matrix || realData; 
                let vars = Object.keys(matrix).filter(k => k!=='ai_narrative_summary');
                
                let head = `<tr><th class="p-3 bg-slate-100 border">Matrix</th>${vars.map(v=>`<th class="p-3 bg-slate-50 border">${v}</th>`).join('')}</tr>`;
                let body = vars.map(v1 => `<tr><td class="p-3 font-bold border bg-slate-50">${v1}</td>${vars.map(v2 => {
                    let cell = matrix[v1][v2];
                    if(v1===v2) return '<td class="p-3 border text-center bg-slate-50 text-slate-300">-</td>';
                    let rVal = cell.r || cell; // Handle format lama/baru
                    let pVal = cell.p || cell.sig || 0;
                    let bold = parseFloat(pVal)<0.05 ? 'font-bold text-blue-700 bg-blue-50/30' : '';
                    return `<td class="p-3 border text-center ${bold}">${fmt(rVal)}<br><span class="text-[10px] font-normal text-slate-400">p=${fmtP(pVal)}</span></td>`;
                }).join('')}</tr>`).join('');
                html += `<div class="overflow-x-auto rounded-lg border border-slate-200"><table class="w-full text-sm">${head}${body}</table></div>`;
            }
            
            // G. RELIABILITY & VALIDITY (Sudah oke sebelumnya, kita pertahankan)
            else if (type === 'reliability') {
                html += `<div class="flex gap-4 mb-4"><div class="p-4 bg-green-50 border border-green-200 rounded flex-1 text-center"><h4 class="font-bold text-green-800 text-xl">${fmt(data.cronbach_alpha)}</h4><span class="text-xs text-green-600 uppercase font-bold">Cronbach's Alpha</span></div><div class="p-4 bg-slate-50 border border-slate-200 rounded flex-1 text-center"><h4 class="font-bold text-slate-800 text-xl">${data.n_items}</h4><span class="text-xs text-slate-500 uppercase font-bold">Items</span></div><div class="p-4 bg-slate-50 border border-slate-200 rounded flex-1 text-center"><h4 class="font-bold text-slate-800 text-xl">${data.conclusion}</h4><span class="text-xs text-slate-500 uppercase font-bold">Verdict</span></div></div>`;
                let items = data.items || [];
                let rows = items.map(i => `<tr><td class="p-3 border-b font-medium">${i.item}</td><td class="p-3 border-b text-right">${fmt(i.citc)}</td><td class="p-3 border-b text-right font-mono">${fmt(i.alpha_if_deleted)}</td></tr>`).join('');
                html += `<div class="overflow-x-auto rounded-lg border border-slate-200"><table class="w-full text-sm text-left"><thead><tr class="bg-slate-50 border-b"><th class="p-3">Item</th><th class="p-3 text-right">Corrected Item-Total Corr.</th><th class="p-3 text-right">Alpha if Deleted</th></tr></thead><tbody>${rows}</tbody></table></div>`;
            }
            else if (type === 'validity') {
                let sourceItems = Array.isArray(realData) ? realData : (data.items || []);
                let rows = sourceItems.map(i => `<tr><td class="p-3 border-b font-medium">${i.item}</td><td class="p-3 border-b text-right font-mono ${i.valid?'text-green-600 font-bold':'text-red-500'}">${fmt(i.r_hitung)}</td><td class="p-3 border-b text-right font-mono text-slate-400">${fmt(i.r_tabel)}</td><td class="p-3 border-b text-center"><span class="px-2 py-0.5 rounded text-xs font-bold ${i.valid?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}">${i.valid?'Valid':'Invalid'}</span></td></tr>`).join('');
                html += `<div class="overflow-x-auto rounded-lg border border-slate-200"><table class="w-full text-sm text-left"><thead><tr class="bg-slate-50 border-b"><th class="p-3">Item</th><th class="p-3 text-right">r-Hitung</th><th class="p-3 text-right">r-Tabel</th><th class="p-3 text-center">Status</th></tr></thead><tbody>${rows}</tbody></table></div>`;
            }
            
            // H. FALLBACK (Raw JSON tapi lebih rapi)
            else {
                html += `<div class="p-4 bg-slate-50 rounded border border-slate-200 text-xs font-mono overflow-auto max-h-96">${JSON.stringify(realData, null, 2)}</div>`;
            }

            html += `</div><div class="bg-indigo-50 px-6 py-4 border-t border-indigo-100 flex justify-between items-center"><div><h4 class="text-sm font-bold text-indigo-900">Lanjut ke Bab 4?</h4><p class="text-xs text-indigo-700">AI akan menyusun narasi dari data ini.</p></div><button onclick="window.location.href='/writing-assistant?id=${new URLSearchParams(window.location.search).get('id')}'" class="px-5 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition shadow-md">Buka Studio</button></div></div>`;
            return html;
        },        
        // ====================================================================
        // 9. UTILITIES
        // ====================================================================
        // fetchHistory dihapus agar tidak bentrok dengan loadServerHistory
        loadHistoryItem(item) { this.currentHistoryId=item.id; this.activeTab='output'; this.outputHtml=this.generateReportHTML(item.type, item.result); this.$nextTick(()=>lucide.createIcons()); },
        async deleteHistoryItem(id) { if(confirm("Hapus?")){ await fetch(`/api/analysis-history/delete/${id}`,{method:'DELETE'}); this.history=this.history.filter(h=>h.id!==id); if(this.currentHistoryId===id)this.outputHtml=''; } },
        async clearHistory() { if(confirm("Hapus Semua?")){ await fetch('/api/analysis-history/clear',{method:'DELETE'}); this.history=[]; this.outputHtml=''; } },
        
        showToast(title, message, type='info') {
            const id=Date.now(); let icon='';
            if(type==='success') icon='<i data-lucide="check-circle" class="w-5 h-5 text-green-500"></i>';
            else if(type==='error') icon='<i data-lucide="alert-circle" class="w-5 h-5 text-red-500"></i>';
            else if(type==='warning') icon='<i data-lucide="alert-triangle" class="w-5 h-5 text-amber-500"></i>';
            else icon='<i data-lucide="info" class="w-5 h-5 text-blue-500"></i>';
            this.toasts.push({id,title,message,type,icon,visible:true});
            this.$nextTick(()=>lucide.createIcons());
            setTimeout(()=>this.removeToast(id), 4000);
        },
        removeToast(id) { 
            const idx=this.toasts.findIndex(t=>t.id===id); 
            if(idx>-1) { this.toasts[idx].visible=false; setTimeout(()=>{this.toasts=this.toasts.filter(t=>t.id!==id)},300); }
        },
        generateEmptyRows(r,c) { return Array(r).fill().map(()=>Array(c).fill(null)); },
        formatTime(iso) { return new Date(iso).toLocaleString('id-ID'); },
        formatTitle(t) { return t.replace(/-/g,' ').toUpperCase(); },
        getIconForMeasure(m) { return m==='nominal'?'component':(m==='ordinal'?'bar-chart-2':'ruler'); },
        handleShortcut(e) { if((e.ctrlKey||e.metaKey)&&e.key==='s'){ e.preventDefault(); this.showToast('Saved','Data tersimpan otomatis.','success'); } },
        exportPDF() { const el=document.getElementById('output-content'); const opt={margin:10,filename:`Analysis_${Date.now()}.pdf`,image:{type:'jpeg',quality:0.98},html2canvas:{scale:2},jsPDF:{unit:'mm',format:'a4',orientation:'portrait'}}; html2pdf().set(opt).from(el).save(); },
        
        // ============================================================
        // [BARU] 10. KONEKSI KE BACKEND (AUTO SAVE & LOAD)
        // ============================================================
        async loadServerHistory() {
            try {
                const res = await fetch('/api/my-analyses');
                const data = await res.json();
                
                if (data.status === 'success') {
                    // Gabungkan data server dengan data lokal (jika perlu)
                    // Atau load ulang history
                    const serverHistory = data.history.map(item => ({
                        id: item.id,
                        title: (item.analysis_type || 'Unknown').toUpperCase(),
                        type: item.analysis_type,
                        timestamp: item.timestamp,
                        result: item.result,
                        // Gunakan fungsi generateReportHTML yang sudah ada (fix bug sebelumnya)
                        outputHtml: this.generateReportHTML(item.analysis_type, item.result),
                        aiNarrative: item.ai_narrative || ''
                    }));
                    
                    // Masukkan ke variable history Alpine
                    this.history = serverHistory;
                }
            } catch (error) {
                console.error("Gagal load history server:", error);
            }
        },

        async uploadAnalysis(type, headers, rows) {
            try {
                // 1. Buat CSV Virtual dari Data Handsontable
                const csvContent = [headers, ...rows]
                    .map(e => e.join(","))
                    .join("\n");

                // 2. Bungkus jadi File
                const blob = new Blob([csvContent], { type: 'text/csv' });
                const formData = new FormData();
                formData.append('file', blob, 'analysis_data.csv');
                formData.append('type', type);

                // 3. Kirim ke Python Flask (/api/analyze)
                const res = await fetch('/api/analyze', {
                    method: 'POST',
                    body: formData
                });
                
                const data = await res.json();
                if (data.status === 'success') {
                    return data.data; // Mengembalikan data record dari Firestore
                }
                return null;
            } catch (e) {
                console.warn("Auto-save gagal (mungkin offline), tapi analisis tetap jalan di browser.");
                return null;
            }
        },

    }));
});

window.app = { askAI: () => alert("Buka Writing Studio untuk fitur ini.") };