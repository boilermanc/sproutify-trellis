
import React, { useState, useRef, useEffect } from 'react';
import { Info, X } from 'lucide-react';

interface PageInfoTooltipProps {
  title: string;
  description: React.ReactNode;
  /** Match the light or dark chrome of the page it sits in. Defaults to 'light'. */
  variant?: 'light' | 'dark';
}

// A small "what is this page for" popover that sits beside a page's <h1>.
// Uses a closing state (rather than an instant unmount) so the exit
// animation defined in index.css (.page-info-pop-out) can actually play.
const ANIMATION_MS = 160;

const PageInfoTooltip: React.FC<PageInfoTooltipProps> = ({ title, description, variant = 'light' }) => {
  const [isMounted, setIsMounted] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const close = () => {
    if (!isMounted || isClosing) return;
    setIsClosing(true);
    window.setTimeout(() => {
      setIsMounted(false);
      setIsClosing(false);
    }, ANIMATION_MS);
  };

  useEffect(() => {
    if (!isMounted) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMounted]);

  const isDark = variant === 'dark';

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        type="button"
        onClick={() => (isMounted ? close() : setIsMounted(true))}
        aria-label={`About ${title}`}
        aria-expanded={isMounted}
        className={`p-1 rounded-full transition-colors shrink-0 ${
          isDark
            ? 'text-white/40 hover:text-emerald-300 hover:bg-white/10'
            : 'text-slate-300 hover:text-emerald-600 hover:bg-emerald-50'
        }`}
      >
        <Info size={16} />
      </button>

      {isMounted && (
        <div
          className={`absolute z-50 top-full left-0 mt-2 w-80 max-w-[min(20rem,85vw)] bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 ${
            isClosing ? 'page-info-pop-out' : 'page-info-pop-in'
          }`}
        >
          <div className="flex items-start justify-between mb-2 gap-2">
            <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-800">{title}</h4>
            <button
              onClick={close}
              className="text-slate-300 hover:text-slate-600 -mt-1 -mr-1 shrink-0 transition-colors"
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </div>
          <div className="text-xs text-slate-600 leading-relaxed space-y-2">{description}</div>
        </div>
      )}
    </div>
  );
};

export default PageInfoTooltip;
