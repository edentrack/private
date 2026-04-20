import React, { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import HelpModal from './HelpModal';

interface HelpButtonProps {
  currentPage?: string;
}

export default function HelpButton({ currentPage }: HelpButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-16 h-16 bg-gradient-to-br from-neon-400 to-neon-500 text-agri-brown-900 rounded-2xl shadow-xl shadow-neon-500/40 hover:shadow-2xl hover:shadow-neon-500/50 transition-all duration-300 hover:scale-110 active:scale-95 flex items-center justify-center z-40 group border-2 border-neon-300/50 backdrop-blur-sm"
        title="Get Help"
        aria-label="Open help center"
      >
        <HelpCircle className="w-7 h-7 text-agri-brown-900 group-hover:rotate-12 transition-transform duration-300" strokeWidth={2.5} />
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-agri-brown-600 rounded-full animate-pulse border-2 border-white shadow-md" />
        <span className="absolute inset-0 bg-gradient-to-br from-white/30 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </button>

      <HelpModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        currentPage={currentPage}
      />
    </>
  );
}
