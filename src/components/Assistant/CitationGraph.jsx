// FILE: src/components/Assistant/CitationGraph.jsx

import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { Maximize2, Info, MousePointer2 } from 'lucide-react';

export default function CitationGraph({ references = [] }) {
    const graphRef = useRef();
    const containerRef = useRef(null);
    const [dimensions, setDimensions] = useState({ w: 400, h: 300 });
    const [highlightNodes, setHighlightNodes] = useState(new Set());
    const [highlightLinks, setHighlightLinks] = useState(new Set());
    const [hoverNode, setHoverNode] = useState(null);

    // ==========================================
    // 1. DATA PROCESSOR
    // ==========================================
    const graphData = useMemo(() => {
        if (!references || references.length === 0) return { nodes: [], links: [] };

        const nodes = [];
        const links = [];
        const topics = {};
        
        // Palette Warna Modern
        const colors = ['#8B5CF6', '#10B981', '#F59E0B', '#3B82F6', '#EC4899'];

        references.forEach((ref, idx) => {
            const refId = `ref-${idx}`;
            
            // PAPER NODE
            nodes.push({
                id: refId,
                name: ref.title,
                author: ref.author,
                year: ref.year,
                val: 5, // Hitbox radius
                type: 'paper',
                color: '#E2E8F0' // Slate 200
            });

            // TOPIC EXTRACTION
            const words = ref.title
                .toLowerCase()
                .replace(/[^\w\s]/gi, '')
                .split(' ')
                .filter(w => w.length > 4 && !['study', 'analysis', 'using', 'based', 'review', 'effect', 'impact'].includes(w))
                .slice(0, 2); 

            words.forEach((word) => {
                const topicId = `topic-${word}`;
                if (!topics[word]) {
                    topics[word] = { 
                        id: topicId, 
                        name: word.toUpperCase(), 
                        val: 12, 
                        type: 'topic', 
                        color: colors[Object.keys(topics).length % colors.length] 
                    };
                    nodes.push(topics[word]);
                }
                
                links.push({
                    source: refId,
                    target: topicId,
                    color: topics[word].color 
                });
            });
        });

        return { nodes, links };
    }, [references]);

    // ==========================================
    // 2. RESIZE HANDLER
    // ==========================================
    useEffect(() => {
        if (!containerRef.current) return;
        const ro = new ResizeObserver((entries) => {
            const { width, height } = entries[0].contentRect;
            setDimensions({ w: width, h: height });
        });
        ro.observe(containerRef.current);
        return () => ro.disconnect();
    }, []);

    useEffect(() => {
        if (graphRef.current) {
            graphRef.current.d3Force('charge').strength(-150); 
            graphRef.current.d3Force('link').distance(60);
            setTimeout(() => graphRef.current.zoomToFit(400, 40), 500);
        }
    }, [graphData]);

    // ==========================================
    // 3. INTERACTION
    // ==========================================
    const handleNodeHover = (node) => {
        if ((!node && !highlightNodes.size) || (node && hoverNode === node)) return;

        const newHighlights = new Set();
        const newLinkHighlights = new Set();

        if (node) {
            newHighlights.add(node);
            graphData.links.forEach(link => {
                if (link.source.id === node.id || link.target.id === node.id) {
                    newLinkHighlights.add(link);
                    newHighlights.add(link.source);
                    newHighlights.add(link.target);
                }
            });
        }

        setHoverNode(node || null);
        setHighlightNodes(newHighlights);
        setHighlightLinks(newLinkHighlights);
        
        if(containerRef.current) {
            containerRef.current.style.cursor = node ? 'pointer' : 'move';
        }
    };

    // ==========================================
    // 4. RENDERER (LABEL SELALU MUNCUL)
    // ==========================================
    const paintNode = useCallback((node, ctx, globalScale) => {
        const isHover = node === hoverNode;
        const isNeighbor = highlightNodes.has(node);
        const isDimmed = hoverNode && !isHover && !isNeighbor;

        // --- 1. GAMBAR NODE ---
        const size = node.type === 'topic' ? 5 : 2.5; // Visual size (tetap)
        
        ctx.globalAlpha = isDimmed ? 0.15 : 1; 
        
        // Glow Effect (Hanya jika tidak dimmed)
        if (!isDimmed) {
            ctx.shadowColor = node.color;
            ctx.shadowBlur = isHover ? 15 : 0;
        } else {
            ctx.shadowBlur = 0;
        }

        ctx.beginPath();
        ctx.arc(node.x, node.y, size, 0, 2 * Math.PI, false);
        ctx.fillStyle = node.color;
        ctx.fill();

        // Reset Effects
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;

        // --- 2. GAMBAR LABEL (ALWAYS ON) ---
        // Trik Zoom: Kita TIDAK membagi dengan globalScale untuk ukuran font dasar
        // Ini membuat font ikut membesar/mengecil sesuai zoom level (seperti peta asli)
        
        const labelFull = node.name;
        // Jika tidak hover, potong teks biar rapi saat zoom out
        const label = (!isHover && labelFull.length > 15 && node.type !== 'topic') 
            ? labelFull.substring(0, 12) + '...' 
            : labelFull;

        // Ukuran font fixed relative terhadap dunia grafik
        // Topic lebih besar (4.5), Paper lebih kecil (3.5)
        const fontSize = node.type === 'topic' ? 4.5 : 3.5;
        
        // Font Weight: Bold kalau Topic atau Hover
        const fontWeight = (node.type === 'topic' || isHover) ? '600' : '400';
        
        ctx.font = `${fontWeight} ${fontSize}px Inter, sans-serif`;
        
        const textWidth = ctx.measureText(label).width;
        const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.4); 

        // Background Label (Agar terbaca di atas garis)
        ctx.fillStyle = isDimmed ? 'rgba(15, 17, 21, 0.3)' : 'rgba(15, 17, 21, 0.8)';
        
        // Posisi Label
        const xPos = node.x - bckgDimensions[0] / 2;
        const yPos = node.type === 'topic' 
            ? node.y + size + 1 // Di bawah untuk topik
            : node.y - size - bckgDimensions[1] - 1; // Di atas untuk paper

        // Draw Rect
        ctx.beginPath();
        const r = 1; 
        ctx.roundRect(xPos, yPos, bckgDimensions[0], bckgDimensions[1], r);
        ctx.fill();

        // Border Label saat Hover (Highlight)
        if (isHover) {
            ctx.strokeStyle = node.color;
            ctx.lineWidth = 0.2;
            ctx.stroke();
        }

        // Draw Text
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Warna Teks
        if (isDimmed) {
            ctx.fillStyle = 'rgba(203, 213, 225, 0.3)'; // Redup
        } else {
            ctx.fillStyle = isHover ? '#FFFFFF' : (node.type === 'topic' ? node.color : '#CBD5E1');
        }
        
        ctx.fillText(label, node.x, yPos + bckgDimensions[1]/2);

    }, [hoverNode, highlightNodes]);

    if (references.length === 0) {
        return (
            <div className="h-64 flex flex-col items-center justify-center border border-dashed border-[#252830] rounded-xl bg-[#0F1115]/50 text-slate-500">
                <Info size={24} className="mb-2 opacity-50"/>
                <p className="text-xs">Data referensi kosong.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-[#0F1115] rounded-xl border border-[#252830] overflow-hidden relative group shadow-lg">
            
            {/* Overlay Info */}
            <div className="absolute top-3 left-3 z-10 pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity">
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/20 border border-white/5 backdrop-blur-sm">
                    <MousePointer2 size={10} className="text-[#6C5DD3]"/>
                    <span className="text-[9px] font-medium text-slate-400">Scroll to Zoom</span>
                </div>
            </div>

            {/* Reset Zoom */}
            <div className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <button onClick={() => graphRef.current.zoomToFit(500)} className="p-1.5 bg-[#1C1E24] text-slate-400 hover:text-white rounded-md border border-white/10 hover:bg-[#6C5DD3] transition-colors">
                    <Maximize2 size={12}/>
                </button>
            </div>

            {/* Canvas */}
            <div ref={containerRef} className="flex-1 min-h-[350px] cursor-move bg-[#0F1115]">
                <ForceGraph2D
                    ref={graphRef}
                    width={dimensions.w}
                    height={dimensions.h}
                    graphData={graphData}
                    backgroundColor="#0F1115"
                    nodeLabel="" 
                    
                    // Link Styling
                    linkColor={link => highlightLinks.has(link) ? link.color : '#252830'}
                    linkWidth={link => highlightLinks.has(link) ? 1 : 0.5} 
                    
                    // Renderer
                    nodeCanvasObject={paintNode}
                    
                    // Events
                    onNodeHover={handleNodeHover}
                    onNodeClick={node => {
                        graphRef.current.centerAt(node.x, node.y, 1000);
                        graphRef.current.zoom(6, 1000);
                    }}
                    
                    // Engine
                    cooldownTicks={100}
                    onEngineStop={() => graphRef.current.zoomToFit(400)}
                />
            </div>
            
            {/* Footer Stats */}
            <div className="bg-[#1C1E24] p-2 text-[9px] text-slate-500 flex justify-between items-center border-t border-[#252830]">
                <span>Knowledge Graph</span>
                <span className="flex gap-3">
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#6C5DD3]"></span> Keyword</span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span> Paper</span>
                </span>
            </div>
        </div>
    );
}