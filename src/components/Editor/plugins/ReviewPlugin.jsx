// FILE: src/components/Editor/plugins/ReviewPlugin.jsx

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getRoot,
  $createTextNode,
  createCommand,
  COMMAND_PRIORITY_EDITOR,
  $nodesOfType
} from 'lexical';
import { $createReviewNode, ReviewNode } from '../nodes/ReviewNode';
import ReviewPopup from '../ui/ReviewPopup';
import ReferenceSearchModal from '../../ReferenceSearchModal';
import * as ReactDOM from 'react-dom';

export const SCAN_DOCUMENT_COMMAND = createCommand('SCAN_DOCUMENT_COMMAND');

// Utility Debounce untuk Passive Scan
const useDebounce = (callback, delay) => {
    const timeoutRef = useRef(null);
    return useCallback((...args) => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => callback(...args), delay);
    }, [callback, delay]);
};

export default function ReviewPlugin({ projectId, projectContext }) {
  const [editor] = useLexicalComposerContext();
  const [activeReview, setActiveReview] = useState(null);
  const [popupPos, setPopupPos] = useState(null);
  
  // Status Scanning
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanContent, setLastScanContent] = useState(''); // Cek perubahan konten
  
  // State RAG / Cari Referensi
  const [isRefModalOpen, setIsRefModalOpen] = useState(false);

  // ----------------------------------------------------------------------
  // 1. CLICK LISTENER (OPEN REVIEW POPUP)
  // ----------------------------------------------------------------------
  useEffect(() => {
    const rootElement = editor.getRootElement();
    if (!rootElement) return;

    const handleClick = (e) => {
      const target = e.target;
      // Cek node highlight (dataset.review)
      if (target?.dataset?.review) {
        try {
          const reviewData = JSON.parse(target.dataset.review);
          const rect = target.getBoundingClientRect();
          
          setActiveReview({
            ...reviewData,
            targetNodeKey: target['__lexicalKey_'] 
          });
          
          setPopupPos({
            x: rect.left,
            y: rect.bottom + window.scrollY
          });
        } catch (err) {
          console.error("Gagal parse review data", err);
        }
      } else {
        setActiveReview(null);
      }
    };

    rootElement.addEventListener('click', handleClick);
    return () => rootElement.removeEventListener('click', handleClick);
  }, [editor]);

  // ----------------------------------------------------------------------
  // 2. CORE LOGIC: SCAN DOCUMENT (AUTO & MANUAL)
  // ----------------------------------------------------------------------
  const scanDocument = useCallback(async (isPassive = false) => {
    // Jika manual (klik tombol), reset popup. Jika passive, biarkan.
    if (!isPassive) setActiveReview(null); 

    let fullText = "";
    editor.getEditorState().read(() => {
        fullText = $getRoot().getTextContent();
    });

    // Optimasi: Jangan scan jika teks belum berubah signifikan atau terlalu pendek
    if (!fullText.trim() || fullText === lastScanContent) return;
    if (fullText.length < 50) return; // Terlalu pendek gak usah scan

    // Set loading hanya jika manual (agar tidak mengganggu saat mengetik)
    if (!isPassive) setIsScanning(true);

    try {
        const methodMode = projectContext?.methodology || 'quantitative'; // Default Safe

        // Panggil "Polisi Metode" (Method Compliance Check)
        // Kita hanya pakai Method Check untuk passive scan biar ringan
        const response = await fetch('/api/check-method-compliance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: fullText, method_mode: methodMode })
        });

        const data = await response.json();
        
        // Simpan konten terakhir yang discan
        setLastScanContent(fullText);

        if (data.status === 'success' && Array.isArray(data.issues)) {
            // Mapping format issue
            const reviews = data.issues.map(issue => ({
                target: issue.target,
                type: 'critical', // Method violation selalu merah/critical
                issue: issue.feedback,
                fix: issue.fix
            }));

            // Terapkan highlight tanpa memutus fokus user
            if (reviews.length > 0) {
                applyHighlights(reviews);
                if(!isPassive) alert(`Ditemukan ${reviews.length} isu metodologi.`);
            }
        }

    } catch (error) {
        console.error("Passive Scan Error:", error);
        if (!isPassive) alert("Gagal scan: " + error.message);
    } finally {
        if (!isPassive) setIsScanning(false);
    }
  }, [editor, projectContext, lastScanContent]);

  // ----------------------------------------------------------------------
  // 3. PASSIVE LISTENER (DEBOUNCED)
  // ----------------------------------------------------------------------
  const debouncedScan = useDebounce(() => {
      // Jalankan scan passive (tanpa loading screen)
      scanDocument(true); 
      console.log("🕵️‍♂️ Passive Method Scan running...");
  }, 3000); // Scan 3 detik setelah user berhenti mengetik

  useEffect(() => {
      return editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves }) => {
          // Hanya trigger jika ada konten yang berubah
          if (dirtyElements.size > 0 || dirtyLeaves.size > 0) {
              debouncedScan();
          }
      });
  }, [editor, debouncedScan]);


  // ----------------------------------------------------------------------
  // 4. HIGHLIGHTING HELPER
  // ----------------------------------------------------------------------
  const applyHighlights = (reviews) => {
    editor.update(() => {
        // 1. Bersihkan highlight lama
        const existingReviews = $nodesOfType(ReviewNode);
        existingReviews.forEach((node) => {
            const text = node.getTextContent();
            const textNode = $createTextNode(text);
            node.replace(textNode);
        });

        // 2. Scan & Replace baru
        const root = $getRoot();
        const textNodes = [];
        const collectTextNodes = (node) => {
            if (node.getType() === 'text') {
                textNodes.push(node);
            } else if (node.getChildren) {
                node.getChildren().forEach(collectTextNodes);
            }
        };
        root.getChildren().forEach(collectTextNodes);

        reviews.forEach((review) => {
            const targetText = review.target.trim();
            if (!targetText) return;

            for (let node of textNodes) {
                const nodeText = node.getTextContent();
                const index = nodeText.indexOf(targetText);

                if (index !== -1) {
                    // Split Logic
                    let targetNode;
                    if (index === 0) {
                        const split = node.splitText(targetText.length);
                        targetNode = split[0];
                    } else {
                        const split = node.splitText(index, index + targetText.length);
                        targetNode = split[1]; 
                    }

                    if (targetNode) {
                        const reviewNode = $createReviewNode(targetText, {
                            type: review.type,
                            issue: review.issue,
                            fix: review.fix
                        });
                        targetNode.replace(reviewNode);
                    }
                    break; 
                }
            }
        });
    });
  };

  // ----------------------------------------------------------------------
  // 5. REGISTER MANUAL COMMAND (Untuk Tombol Scan Manual)
  // ----------------------------------------------------------------------
  useEffect(() => {
    return editor.registerCommand(
      SCAN_DOCUMENT_COMMAND,
      () => {
        scanDocument(false); // Manual Mode (Show Loading)
        return true;
      },
      COMMAND_PRIORITY_EDITOR
    );
  }, [editor, scanDocument]);

  // ----------------------------------------------------------------------
  // POPUP HANDLERS
  // ----------------------------------------------------------------------
  const handleAccept = () => {
    if (!activeReview) return;
    editor.update(() => {
        const nodes = $nodesOfType(ReviewNode);
        for (let node of nodes) {
             if (node.getTextContent() === activeReview.target) {
                 const textNode = $createTextNode(activeReview.fix);
                 node.replace(textNode);
                 break;
             }
        }
    });
    setActiveReview(null);
  };

  const handleDismiss = () => {
    if (!activeReview) return;
    editor.update(() => {
        const nodes = $nodesOfType(ReviewNode);
        for (let node of nodes) {
             if (node.getTextContent() === activeReview.target) {
                 const textNode = $createTextNode(activeReview.target);
                 node.replace(textNode);
                 break;
             }
        }
    });
    setActiveReview(null);
  };

  const handleReferenceAdded = (ref) => {
    if (!activeReview) return;
    const author = ref.author?.split(' ').pop()?.replace(',', '') || 'Anonim';
    const year = ref.year || 'n.d.';
    const newText = activeReview.target + ` (${author}, ${year})`;

    editor.update(() => {
        const nodes = $nodesOfType(ReviewNode);
        for (let node of nodes) {
             if (node.getTextContent() === activeReview.target) {
                 const textNode = $createTextNode(newText);
                 node.replace(textNode);
                 break;
             }
        }
    });
    setIsRefModalOpen(false);
    setActiveReview(null);
  };

  // ----------------------------------------------------------------------
  // RENDER UI
  // ----------------------------------------------------------------------
  return (
    <>
      {/* 1. INDICATOR SCANNING (MANUAL ONLY) */}
      {isScanning && (
        <div className="absolute top-24 right-10 z-50 animate-in fade-in zoom-in duration-300">
            <div className="bg-[#16181D]/95 text-white px-5 py-3 rounded-xl border border-red-500/50 shadow-2xl flex items-center gap-3 backdrop-blur-sm">
                <div className="relative">
                    <div className="absolute inset-0 bg-red-500 blur opacity-20 animate-pulse rounded-full"></div>
                    <div className="h-2 w-2 bg-red-500 rounded-full animate-ping"></div>
                </div>
                <div>
                    <div className="text-xs font-bold text-red-400 tracking-widest uppercase">SYSTEM SCANNING</div>
                    <div className="text-[10px] text-slate-400">Memeriksa Logika & Metode...</div>
                </div>
            </div>
        </div>
      )}

      {/* 2. REVIEW POPUP */}
      {activeReview && popupPos && !isRefModalOpen && ReactDOM.createPortal(
          <ReviewPopup
            review={activeReview}
            position={popupPos}
            onAccept={handleAccept}
            onDismiss={handleDismiss}
            onFindReference={() => setIsRefModalOpen(true)}
            onClose={() => setActiveReview(null)}
          />,
          document.body
      )}

      {/* 3. MODAL REFERENSI */}
      <ReferenceSearchModal
        isOpen={isRefModalOpen}
        onClose={() => setIsRefModalOpen(false)}
        projectId={projectId}
        onReferenceAdded={handleReferenceAdded}
      />
    </>
  );
}