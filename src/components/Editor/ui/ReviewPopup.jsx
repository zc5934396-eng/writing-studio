// frontend/src/components/Editor/ui/ReviewPopup.jsx
import React, { useEffect, useState, useRef } from 'react';
import { X, Check, Trash2, AlertCircle, BookOpen, Lightbulb, GripHorizontal, ArrowDown, Search } from 'lucide-react';

export default function ReviewPopup({ review, position, onAccept, onDismiss, onFindReference, onClose }) {
  const popupRef = useRef(null);
  
  // State Dragging
  const [pos, setPos] = useState(position);
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  // 1. UPDATE POSISI AWAL
  useEffect(() => {
    if (position) {
      let startX = position.x;
      let startY = position.y + 14; 
      if (startX + 320 > window.innerWidth) startX = window.innerWidth - 340;
      if (startY + 300 > window.innerHeight) startY = window.innerHeight - 320;
      setPos({ x: startX, y: startY });
    }
  }, [position]);

  // 2. LOGIKA DRAG
  const handleMouseDown = (e) => {
    setIsDragging(true);
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };
  const handleMouseMove = (e) => {
    setPos({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y });
  };
  const handleMouseUp = () => {
    setIsDragging(false);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  if (!review || !pos) return null;

  // STYLE CONFIG
  const getStyle = (type) => {
    switch(type) {
      case 'critical': return { 
        headerBg: 'bg-red-600', borderColor: 'border-red-500', icon: AlertCircle, label: 'KRITIK FATAL' 
      };
      case 'citation': return { 
        headerBg: 'bg-blue-600', borderColor: 'border-blue-500', icon: BookOpen, label: 'BUTUH REFERENSI' 
      };
      default: return { 
        headerBg: 'bg-yellow-500', borderColor: 'border-yellow-400', icon: Lightbulb, label: 'SARAN PERBAIKAN' 
      };
    }
  };

  const style = getStyle(review.type);
  const Icon = style.icon;
  const isCitationError = review.type === 'citation';

  return (
    <div 
      ref={popupRef}
      className={`fixed z-50 w-[340px] bg-[#1a1a1a] rounded-xl shadow-[0_20px_60px_-10px_rgba(0,0,0,0.9)] flex flex-col font-sans overflow-hidden border-2 ${style.borderColor} animate-in fade-in zoom-in-95 duration-200`}
      style={{ top: pos.y, left: pos.x }}
    >
      {/* HEADER */}
      <div 
        onMouseDown={handleMouseDown}
        className={`${style.headerBg} flex justify-between items-center px-3 py-2 text-white cursor-grab active:cursor-grabbing select-none`}
      >
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest">
              <Icon size={14} strokeWidth={3} /> {style.label}
          </div>
          <div className="flex items-center gap-2">
             <GripHorizontal size={14} className="opacity-50" />
             <button onClick={onClose} className="text-white/70 hover:text-white" onMouseDown={(e) => e.stopPropagation()}>
                 <X size={14} strokeWidth={3} />
             </button>
          </div>
      </div>
      
      {/* BODY */}
      <div className="p-4 space-y-4">
        <div>
            <p className="text-white text-sm leading-relaxed font-medium">"{review.feedback}"</p>
        </div>

        {/* KOMPARASI (Hanya jika bukan citation, atau jika citation tapi ada saran teks) */}
        {!isCitationError && review.fix && (
            <div className="bg-black/40 rounded-lg border border-white/10 overflow-hidden">
                <div className="p-2 border-b border-white/5 bg-red-900/10">
                    <span className="text-[9px] text-red-400 font-bold block mb-1 uppercase">TEKS SAAT INI:</span>
                    <p className="text-red-200/70 text-xs line-through decoration-red-500 decoration-2 italic">"{review.target}"</p>
                </div>
                <div className="flex justify-center -my-2 relative z-10">
                    <div className="bg-[#1a1a1a] border border-white/10 rounded-full p-1 text-slate-400"><ArrowDown size={12} /></div>
                </div>
                <div className="p-2 bg-green-900/10">
                    <span className="text-[9px] text-green-400 font-bold block mb-1 uppercase">REKOMENDASI:</span>
                    <p className="text-green-300 text-sm font-bold leading-relaxed">"{review.fix}"</p>
                </div>
            </div>
        )}

        {/* PESAN KHUSUS CITATION */}
        {isCitationError && (
             <div className="bg-blue-900/20 p-3 rounded border border-blue-500/30 text-blue-200 text-xs italic text-center">
                "Klik tombol di bawah untuk mencari jurnal yang relevan dan menambahkannya otomatis."
             </div>
        )}

        {/* TOMBOL AKSI */}
        <div className="flex gap-2 pt-2 border-t border-white/10">
            <button 
                onClick={onDismiss}
                className="flex-1 py-2 rounded bg-[#2a2a2a] hover:bg-[#333] text-gray-400 hover:text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
            >
                <Trash2 size={12} /> Abaikan
            </button>

            {/* LOGIKA TOMBOL BERUBAH */}
            {isCitationError ? (
                <button 
                    onClick={onFindReference} // <--- Action Baru
                    className="flex-[1.5] py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-lg active:scale-95"
                >
                    <Search size={14} strokeWidth={3} /> Cari Referensi
                </button>
            ) : (
                <button 
                    onClick={onAccept}
                    className="flex-[1.5] py-2 rounded bg-white text-black hover:bg-gray-200 text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-lg active:scale-95"
                >
                    <Check size={14} strokeWidth={3} /> Terapkan Revisi
                </button>
            )}
        </div>
      </div>
    </div>
  );
}