import React, { useEffect, useRef } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';

interface ConfirmationModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ open, title, message, confirmLabel, cancelLabel = 'Cancel', tone = 'primary', busy = false, onCancel, onConfirm }) => {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, busy, onCancel]);

  if (!open) return null;
  const confirmClass = tone === 'danger' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700';

  return <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" role="presentation">
    <button type="button" aria-label="Close confirmation" disabled={busy} onClick={onCancel} className="absolute inset-0 bg-slate-950/65 disabled:cursor-wait" />
    <section role="alertdialog" aria-modal="true" aria-labelledby="confirmation-title" aria-describedby="confirmation-message" className="relative w-full max-w-md border border-slate-200 bg-white p-6 shadow-xl sm:p-7">
      <button type="button" aria-label="Close" disabled={busy} onClick={onCancel} className="absolute right-5 top-5 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"><X size={18} /></button>
      <div className={`flex h-11 w-11 items-center justify-center border ${tone === 'danger' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}><AlertTriangle size={22} /></div>
      <h2 id="confirmation-title" className="mt-5 pr-8 text-xl font-black tracking-tight text-slate-900">{title}</h2>
      <p id="confirmation-message" className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
      <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button ref={cancelRef} type="button" disabled={busy} onClick={onCancel} className="min-h-11 border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{cancelLabel}</button>
        <button type="button" disabled={busy} onClick={onConfirm} className={`inline-flex min-h-11 items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 ${confirmClass}`}>{busy && <Loader2 size={16} className="animate-spin" />}{busy ? 'Working…' : confirmLabel}</button>
      </div>
    </section>
  </div>;
};

export default ConfirmationModal;
