import React, { useEffect, useState, forwardRef, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

// --- LEXICAL CORE ---
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { AutoFocusPlugin } from '@lexical/react/LexicalAutoFocusPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin'; // WAJIB UNTUK LIST
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';

// --- NODES & COMMANDS ---
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListItemNode, ListNode } from '@lexical/list';
import { 
    $getRoot, $insertNodes, $getSelection, $isRangeSelection, $createParagraphNode,
    FORMAT_TEXT_COMMAND, FORMAT_ELEMENT_COMMAND,
    CLEAR_HISTORY_COMMAND, UNDO_COMMAND, REDO_COMMAND,
    CAN_UNDO_COMMAND, CAN_REDO_COMMAND
} from 'lexical';
import { $createHeadingNode, $createQuoteNode } from '@lexical/rich-text';
import { $setBlocksType } from '@lexical/selection';
import { INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND } from '@lexical/list';
import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html';
import { mergeRegister } from '@lexical/utils';

// --- ICONS (LENGKAP) ---
import { 
    Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, AlignJustify,
    BookOpen, Undo, Redo, Heading1, Heading2, Quote, List, ListOrdered,
    Type, MoreVertical, LayoutList
} from 'lucide-react';

// --- CUSTOM PLUGINS ---
import AISlashPlugin from './plugins/AISlashPlugin'; 
import ReviewPlugin from './plugins/ReviewPlugin'; 
import AutoSavePlugin from './plugins/AutoSavePlugin'; 
import FloatingToolbarPlugin from './plugins/FloatingToolbarPlugin'; 
import { ReviewNode } from './nodes/ReviewNode';

// ==========================================
// 1. THEME CONFIGURATION (THEME-AWARE)
// ==========================================
const theme = {
  paragraph: 'mb-3 text-[var(--text-secondary)] leading-relaxed text-base font-serif', 
  heading: {
    h1: 'text-3xl font-bold text-[var(--text-primary)] mb-4 mt-6 border-b border-[var(--border-secondary)] pb-2',
    h2: 'text-2xl font-bold text-[var(--text-primary)] mb-3 mt-5',
    h3: 'text-xl font-bold text-[var(--text-primary)] mb-2 mt-4',
  },
  text: {
    bold: 'font-bold text-[var(--text-primary)]',
    italic: 'italic text-[var(--text-secondary)]',
    underline: 'underline decoration-[var(--text-tertiary)] underline-offset-4',
    strikethrough: 'line-through text-[var(--text-tertiary)]',
  },
  list: {
    ul: 'list-disc list-outside mb-4 ml-8 text-[var(--text-secondary)]',
    ol: 'list-decimal list-outside mb-4 ml-8 text-[var(--text-secondary)]',
    listitem: 'pl-1',
  },
  quote: 'border-l-4 border-[var(--accent-primary)] pl-4 italic text-[var(--text-tertiary)] my-4 bg-[color-mix(in_srgb,_var(--bg-primary)_50%,_transparent)] py-2 rounded-r',
};

// ==========================================
// 2. HELPER PLUGINS (INTERNAL)
// ==========================================

// --- A. AUTO LOAD PLUGIN (STABILIZED) ---
function AutoLoadPlugin({ content }) {
    const [editor] = useLexicalComposerContext();
    const loadedRef = useRef(false);

    useEffect(() => {
        if (!content || loadedRef.current) return;

        editor.update(() => {
            const root = $getRoot();
            const currentText = root.getTextContent();
            if (currentText.trim() !== '') return;

            const parser = new DOMParser();
            const dom = parser.parseFromString(content, 'text/html');
            const nodes = $generateNodesFromDOM(editor, dom);
            
            root.clear();
            $insertNodes(nodes);
            editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
        });

        loadedRef.current = true;
    }, [content, editor]);

    return null;
}

// --- B. CITATION PICKER PLUGIN (Sama seperti sebelumnya) ---
function CitationPickerPlugin({ references = [] }) {
    const [editor] = useLexicalComposerContext();
    const [match, setMatch] = useState(null); 

    useEffect(() => {
        return editor.registerUpdateListener(({ editorState }) => {
            editorState.read(() => {
                const selection = $getSelection();
                if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
                    setMatch(null); return;
                }
                const node = selection.anchor.getNode();
                const offset = selection.anchor.offset;
                const textContent = node.getTextContent();
                
                if (textContent[offset - 1] === '@') {
                    const range = window.getSelection().getRangeAt(0);
                    const rect = range.getBoundingClientRect();
                    setMatch({ 
                        coords: { top: rect.top + window.scrollY + 25, left: rect.left + window.scrollX } 
                    });
                } else {
                    setMatch(null);
                }
            });
        });
    }, [editor]);

    const insertCitation = (ref) => {
        editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
                const node = selection.anchor.getNode();
                const text = node.getTextContent();
                node.setTextContent(text.slice(0, selection.anchor.offset - 1) + text.slice(selection.anchor.offset));
                const authorLast = ref.author ? ref.author.split(',')[0].split(' ').pop() : 'Anonim';
                selection.insertText(` (${authorLast}, ${ref.year || 'n.d.'}) `);
            }
        });
        setMatch(null);
    };

    if (!match) return null;

    return createPortal(
        <div style={{ top: match.coords.top, left: match.coords.left }} className="absolute z-50 w-64 max-h-48 overflow-y-auto bg-[#1C1E24] rounded-lg shadow-2xl border border-white/10 animate-in fade-in zoom-in-95 custom-scrollbar">
            <div className="px-3 py-2 text-[10px] font-bold text-slate-500 bg-[#16181D] border-b border-white/5 flex items-center gap-1 sticky top-0"><BookOpen size={10}/> Insert Citation</div>
            {references.map((ref, i) => (
                <button key={i} onClick={() => insertCitation(ref)} className="w-full text-left px-3 py-2 text-xs hover:bg-[#6C5DD3] text-slate-300 hover:text-white transition-colors border-b border-white/5 last:border-0">
                    <div className="font-bold truncate">{ref.title}</div>
                    <div className="text-[10px] opacity-60">{ref.author} • {ref.year}</div>
                </button>
            ))}
        </div>, document.body
    );
}

// --- C. TOOLBAR PLUGIN (THE ULTIMATE MS WORD BAR) ---
function ToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [blockType, setBlockType] = useState('paragraph');

  // Update Toolbar State saat seleksi berubah
  const updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      const anchorNode = selection.anchor.getNode();
      const element = anchorNode.getKey() === 'root' ? anchorNode : anchorNode.getTopLevelElementOrThrow();
      const elementKey = element.getKey();
      const elementDOM = editor.getElementByKey(elementKey);
      
      if (elementDOM !== null) {
        if (element.getType() === 'heading') setBlockType(element.getTag());
        else if (element.getType() === 'list') setBlockType(element.getTag() === 'ol' ? 'ol' : 'ul');
        else setBlockType('paragraph');
      }
    }
  }, [editor]);

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => updateToolbar());
      }),
      editor.registerCommand(CAN_UNDO_COMMAND, (payload) => { setCanUndo(payload); return false; }, 1),
      editor.registerCommand(CAN_REDO_COMMAND, (payload) => { setCanRedo(payload); return false; }, 1)
    );
  }, [editor, updateToolbar]);

  // Block Formatting Helper
  const formatBlock = (type) => {
    if (blockType === type) return;
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        if (type === 'h1') $setBlocksType(selection, () => $createHeadingNode('h1'));
        else if (type === 'h2') $setBlocksType(selection, () => $createHeadingNode('h2'));
        else if (type === 'quote') $setBlocksType(selection, () => $createQuoteNode());
        else if (type === 'ul') editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND);
        else if (type === 'ol') editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND);
        else $setBlocksType(selection, () => $createParagraphNode());
      }
    });
  };

  const HeaderBtn = ({ onClick, icon: Icon, active, title, disabled }) => (
    <button onClick={onClick} disabled={disabled} title={title} className={`p-1.5 rounded-lg transition-all ${active ? 'bg-[#6C5DD3] text-white' : 'text-slate-400 hover:text-white hover:bg-[#252830]'} ${disabled ? 'opacity-30 cursor-not-allowed' : ''}`}>
        <Icon size={16} />
    </button>
  );

  const Divider = () => <div className="w-px h-5 bg-[#252830] mx-1" />;

  return (
    <div className="flex items-center flex-wrap gap-1 p-2 border-b border-[var(--border-primary)] bg-[var(--bg-secondary)] sticky top-0 z-20 rounded-t-lg select-none shadow-sm">
      {/* HISTORY */}
      <HeaderBtn onClick={() => editor.dispatchCommand(UNDO_COMMAND)} icon={Undo} disabled={!canUndo} title="Undo" />
      <HeaderBtn onClick={() => editor.dispatchCommand(REDO_COMMAND)} icon={Redo} disabled={!canRedo} title="Redo" />
      <Divider />
      
      {/* BLOCKS */}
      <HeaderBtn onClick={() => formatBlock('paragraph')} icon={Type} active={blockType === 'paragraph'} title="Normal Text" />
      <HeaderBtn onClick={() => formatBlock('h1')} icon={Heading1} active={blockType === 'h1'} title="Heading 1" />
      <HeaderBtn onClick={() => formatBlock('h2')} icon={Heading2} active={blockType === 'h2'} title="Heading 2" />
      <HeaderBtn onClick={() => formatBlock('quote')} icon={Quote} active={blockType === 'quote'} title="Quote" />
      <Divider />
      
      {/* TEXT FORMAT */}
      <HeaderBtn onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')} icon={Bold} title="Bold" />
      <HeaderBtn onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')} icon={Italic} title="Italic" />
      <HeaderBtn onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')} icon={Underline} title="Underline" />
      <Divider />
      
      {/* ALIGNMENT */}
      <HeaderBtn onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'left')} icon={AlignLeft} title="Rata Kiri" />
      <HeaderBtn onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'center')} icon={AlignCenter} title="Rata Tengah" />
      <HeaderBtn onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'right')} icon={AlignRight} title="Rata Kanan" />
      <HeaderBtn onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'justify')} icon={AlignJustify} title="Rata Kanan Kiri" />
      <Divider />

      {/* LISTS */}
      <HeaderBtn onClick={() => formatBlock('ul')} icon={List} active={blockType === 'ul'} title="Bullet List" />
      <HeaderBtn onClick={() => formatBlock('ol')} icon={ListOrdered} active={blockType === 'ol'} title="Numbered List" />
      
      {/* SPACING PLACEHOLDER (FITUR EXTRA) */}
      <div className="ml-auto flex items-center gap-2">
         <span className="text-[9px] text-[var(--text-tertiary)] font-bold px-2 py-1 bg-[var(--bg-primary)] rounded">MS WORD MODE</span>
      </div>
    </div>
  );
}

// --- D. EDITOR REF PLUGIN ---
const EditorRefPlugin = ({ editorRef }) => {
    const [editor] = useLexicalComposerContext();
    useEffect(() => {
        if (editorRef) {
            editorRef.current = {
                insertContent: (html) => {
                    editor.update(() => {
                        const parser = new DOMParser();
                        const dom = parser.parseFromString(html, 'text/html');
                        const nodes = $generateNodesFromDOM(editor, dom);
                        $insertNodes(nodes);
                    });
                },
                getHtml: () => {
                    let html = '';
                    editor.getEditorState().read(() => { html = $generateHtmlFromNodes(editor, null); });
                    return html;
                }
            };
        }
    }, [editor, editorRef]);
    return null;
};

// ==========================================
// 3. MAIN COMPONENT EXPORT (FINAL)
// ==========================================
const LexicalEditor = forwardRef(({ 
    initialContent, 
    onChange, 
    onSave,        
    isStreaming,   
    projectId, 
    activeChapterId, 
    projectContext 
}, ref) => {
  
  const [isGhostWriting, setIsGhostWriting] = useState(false);
  const isBusy = isStreaming || isGhostWriting;

  const initialConfig = {
    namespace: 'WritingStudio',
    theme,
    onError(error) { console.error("[Lexical Error]", error); },
    // REGISTER SEMUA NODE PENTING DISINI
    nodes: [
        HeadingNode, QuoteNode, ListItemNode, ListNode, ReviewNode
    ]
  };

  const handleEditorChange = (editorState, editor) => {
      editorState.read(() => {
          if (onChange) {
              const html = $generateHtmlFromNodes(editor, null);
              onChange(html); 
          }
      });
  };

  return (
    <div className="relative w-[816px] max-w-full min-h-[1056px] mx-auto bg-[var(--bg-primary)] border border-[var(--border-primary)] shadow-xl rounded-lg overflow-hidden flex flex-col transition-all duration-300 glass-panel">
      <LexicalComposer initialConfig={initialConfig}>
        
        {/* TOOLBAR SULTAN DI SINI */}
        <ToolbarPlugin />
        
        <div className="flex-1 relative bg-[var(--bg-primary)]">
          <RichTextPlugin
            contentEditable={
                <ContentEditable 
                    className="outline-none min-h-[900px] p-12 text-base focus:outline-none" 
                    style={{ fontFamily: '"Times New Roman", Times, serif', lineHeight: '1.6', color: 'var(--text-secondary)' }} 
                />
            }
            placeholder={
                <div className="absolute top-12 left-12 text-[var(--text-tertiary)] pointer-events-none select-none italic">
                    Mulai menulis bab ini...
                </div>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <AutoFocusPlugin />
          <ListPlugin /> {/* PLUGIN WAJIB UTK LIST */}
          
          {/* CORE LOGIC: LISTENER & AUTOSAVE */}
          <OnChangePlugin onChange={handleEditorChange} ignoreSelectionChange />
          <AutoSavePlugin projectId={projectId} onServerSave={onSave} isStreaming={isBusy} />
          <AutoLoadPlugin content={initialContent} />
          <EditorRefPlugin editorRef={ref} />
          
          {/* FEATURE PLUGINS */}
          <AISlashPlugin projectId={projectId} />
          <ReviewPlugin projectId={projectId} projectContext={projectContext} />
          <FloatingToolbarPlugin onStateChange={setIsGhostWriting} />
          <CitationPickerPlugin references={projectContext?.references || []} />

        </div>
      </LexicalComposer>
    </div>
  );
});

export default LexicalEditor;