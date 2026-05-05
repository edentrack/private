import { useState, useRef, useEffect } from 'react';
import { Info, ArrowRight } from 'lucide-react';
import { WHY_THIS_MATTERS, type WhyThisMattersTopicKey } from '../../content/whyThisMatters';

interface WhyThisMattersProps {
  topic: WhyThisMattersTopicKey;
  onNavigate: (view: string) => void;
}

export function WhyThisMatters({ topic, onNavigate }: WhyThisMattersProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const data = WHY_THIS_MATTERS[topic];

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const handleAskEden = () => {
    sessionStorage.setItem('eden_prefill_message', data.learnMorePrompt);
    setOpen(false);
    onNavigate('ai-assistant');
  };

  return (
    <div ref={ref} className="relative inline-flex items-center">
      <button
        onClick={() => setOpen(v => !v)}
        className="ml-1 text-gray-400 hover:text-indigo-500 transition-colors flex-shrink-0"
        aria-label={`Learn more about ${data.title}`}
        type="button"
      >
        <Info className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-white border border-gray-200 rounded-xl shadow-xl p-3 z-50">
          {/* caret */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-gray-200" />
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-[-1px] border-[4px] border-transparent border-t-white" />

          <p className="text-xs font-semibold text-gray-900 mb-1">{data.title}</p>
          <p className="text-xs text-gray-600 leading-relaxed">{data.summary}</p>

          {'formula' in data && data.formula && (
            <div className="mt-2 bg-gray-50 border border-gray-100 rounded-lg px-2 py-1.5">
              <p className="text-[10px] font-mono text-gray-700 leading-snug">{data.formula}</p>
            </div>
          )}

          <button
            onClick={handleAskEden}
            type="button"
            className="mt-2.5 flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
          >
            Ask Eden
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}
