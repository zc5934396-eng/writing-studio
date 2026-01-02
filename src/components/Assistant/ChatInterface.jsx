import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, RotateCcw, Sparkles, Eraser } from 'lucide-react';
// Path imports disesuaikan dengan struktur folder
import { useProject } from '../../context/ProjectContext.jsx';
import { api } from '../../api/client.js';

const ChatInterface = () => {
  const { project, isPro, setShowUpgradeModal } = useProject();
  
  // Default Message
  const defaultMsg = { 
    role: 'system', 
    content: `Halo! Saya asisten skripsi Anda. Kita sedang membahas skripsi berjudul: "${project?.title || '...' }". Ada yang bisa saya bantu?` 
  };

  const [messages, setMessages] = useState([defaultMsg]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Reset Chat jika Project Berubah
  useEffect(() => {
    setMessages([{ 
        role: 'system', 
        content: `Halo! Saya siap membantu skripsi: "${project?.title || '...' }".` 
    }]);
  }, [project?.id]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    // Cek Limit Chat (UX Side)
    if (!isPro && messages.length > 10) { 
        setShowUpgradeModal(true);
        return;
    }

    const userMessage = { role: 'user', content: input };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // --- CONTEXT INJECTION AGAR AI PINTAR ---
      const contextPayload = {
          title: project?.title,
          problem: project?.problem_statement,
          method: project?.methodology,
          variables: project?.variables_indicators
      };

      // Kirim history 6 chat terakhir (agar hemat token tapi tetap nyambung)
      const recentHistory = messages.filter(m => m.role !== 'system').slice(-6);

      const response = await fetch('/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: input,
          history: recentHistory, // History dikirim
          context: JSON.stringify(contextPayload), // Konteks lengkap dikirim
          projectId: project?.id
        }),
      });

      // Handle Limit Backend
      if (response.status === 403) {
        const data = await response.json();
        if (data.error === 'LIMIT_REACHED') {
          setMessages(prev => [...prev, { role: 'system', content: "⚠️ " + data.message, isError: true }]);
          setShowUpgradeModal(true);
          setIsLoading(false);
          return;
        }
      }

      if (!response.ok) throw new Error('Network error');

      // Streaming Handler
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let botResponse = '';

      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        botResponse += chunk;
        
        setMessages(prev => {
          const newMsgs = [...prev];
          const lastMsg = newMsgs[newMsgs.length - 1];
          if (lastMsg.role === 'assistant') {
            lastMsg.content = botResponse;
          }
          return newMsgs;
        });
      }

    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { role: 'system', content: 'Maaf, terjadi kesalahan koneksi.', isError: true }]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
      setMessages([defaultMsg]);
  };

  return (
    <div className="flex flex-col h-full bg-[#0F1115]">
      {/* Header Kecil */}
      <div className="p-2 border-b border-white/5 flex justify-between items-center bg-[#16181D]">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider ml-2">Chat Assistant</span>
          <button onClick={clearChat} className="p-1 text-slate-500 hover:text-white" title="Reset Chat">
              <Eraser size={14} />
          </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
              msg.role === 'user' ? 'bg-[#6C5DD3]' : 'bg-[#252830]'
            }`}>
              {msg.role === 'user' ? <User size={14} className="text-white"/> : <Sparkles size={14} className="text-[#6C5DD3]"/>}
            </div>

            <div className={`p-3 rounded-2xl max-w-[85%] text-sm leading-relaxed ${
              msg.role === 'user' 
                ? 'bg-[#6C5DD3]/20 text-white border border-[#6C5DD3]/30 rounded-tr-none' 
                : msg.isError 
                  ? 'bg-red-900/20 text-red-200 border border-red-500/30'
                  : 'bg-[#1C1E24] text-slate-300 border border-white/10 rounded-tl-none'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <form onSubmit={handleSendMessage} className="p-4 border-t border-white/5 bg-[#16181D]">
        <div className="relative flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={project?.title ? `Tanya soal "${project.title.substring(0, 15)}..."` : "Tanya sesuatu..."}
            className="flex-1 bg-[#0D0F12] border border-white/10 text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-[#6C5DD3] transition-all placeholder-slate-600"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="p-3 bg-[#6C5DD3] hover:bg-[#5b4eb5] text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-[#6C5DD3]/20"
          >
            {isLoading ? <RotateCcw className="animate-spin" size={18} /> : <Send size={18} />}
          </button>
        </div>
        <div className="text-center mt-2 flex justify-between px-1">
           <span className="text-[10px] text-slate-500">
               {isPro ? "⚡ Mode Pro: Context Aware" : "Free Mode: Max 200 words"}
           </span>
        </div>
      </form>
    </div>
  );
};

export default ChatInterface;