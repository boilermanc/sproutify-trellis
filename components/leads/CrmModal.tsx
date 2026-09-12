import React, { useEffect, useId } from 'react';
import { X } from 'lucide-react';

interface CrmModalProps {
  title: string;
  subtitle?: string;
  icon: React.ElementType;
  pending?: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}

const CrmModal: React.FC<CrmModalProps> = ({
  title,
  subtitle,
  icon: Icon,
  pending = false,
  onClose,
  children,
  maxWidth = 'max-w-xl',
}) => {
  const titleId = useId();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, pending]);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-[#050713]/85 p-4 backdrop-blur-sm"
      onMouseDown={event => { if (event.target === event.currentTarget && !pending) onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className={`max-h-[92vh] w-full overflow-y-auto rounded-sm border border-emerald-400/15 bg-[#10142E]   ${maxWidth}`}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#10142E]/95 px-6 py-5 backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-sm bg-emerald-400/10 text-emerald-300"><Icon size={21} /></span>
            <span>
              <h2 id={titleId} className="text-lg font-black   text-white">{title}</h2>
              {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
            </span>
          </div>
          <button type="button" onClick={onClose} disabled={pending} className="rounded-sm p-2 text-slate-400 transition hover:bg-white/10 hover:text-white disabled:opacity-40" aria-label="Close"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
};

export default CrmModal;
