import React from 'react';
import { Crown, Check, X } from 'lucide-react';

const UpgradeModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const handleUpgrade = () => {
    // Membuka halaman upgrade di tab baru agar editor tidak ter-refresh
    window.open('/upgrade', '_blank');
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#1A1D23] border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl relative overflow-hidden">
        
        {/* Decorative Background */}
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-purple-900/40 to-transparent pointer-events-none" />
        
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>

        <div className="p-8 text-center relative z-10">
          <div className="mx-auto w-16 h-16 bg-purple-900/50 rounded-full flex items-center justify-center mb-6 border border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.3)]">
            <Crown size={32} className="text-purple-400" />
          </div>

          <h2 className="text-2xl font-bold text-white mb-2">
            Kuota Harian Habis
          </h2>
          <p className="text-gray-400 mb-6 text-sm leading-relaxed">
            Anda telah mencapai batas penggunaan gratis hari ini. 
            Upgrade ke <span className="text-purple-400 font-semibold">Pro Plan</span> untuk akses tanpa batas ke fitur premium.
          </p>

          <div className="bg-[#13151A] rounded-xl p-4 mb-6 text-left space-y-3 border border-gray-800">
            <FeatureItem text="Unlimited Generator (Bab 1-5)" />
            <FeatureItem text="Akses GPT-5 Nano & GPT-5.2" />
            <FeatureItem text="Simulasi Sidang Skripsi AI" />
            <FeatureItem text="Prioritas Server (Tanpa Antri)" />
          </div>

          <button 
            onClick={handleUpgrade}
            className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-purple-900/20 transform hover:-translate-y-0.5"
          >
            Upgrade Sekarang
          </button>
          
          <button 
            onClick={onClose}
            className="mt-4 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Nanti saja, saya pakai besok
          </button>
        </div>
      </div>
    </div>
  );
};

const FeatureItem = ({ text }) => (
  <div className="flex items-center gap-3">
    <div className="w-5 h-5 rounded-full bg-green-900/30 flex items-center justify-center flex-shrink-0">
      <Check size={12} className="text-green-400" />
    </div>
    <span className="text-gray-300 text-sm">{text}</span>
  </div>
);

export default UpgradeModal;