import React, { useEffect, useState } from 'react';
import { AlertTriangle, Code2, Eye, FileText, Loader2, Mail, Send, ShieldAlert } from 'lucide-react';
import { Lead, LeadEmailEligibility } from '../../types';
import { buildLeadEmailHtml, LeadEmailBodyFormat } from '../../leadService';
import CrmModal from './CrmModal';
import { LEAD_EMAIL_TEMPLATES, applyLeadTemplate } from './leadEmailTemplates';

interface LeadEmailModalProps {
  lead: Lead;
  eligibility: LeadEmailEligibility | null;
  checkingEligibility: boolean;
  pending: boolean;
  testPending: boolean;
  testRecipient: string;
  ccRecipient?: string;
  scope?: string;
  eligibilityError: string;
  onClose: () => void;
  onSubmit: (input: { subject: string; body: string; bodyFormat: LeadEmailBodyFormat }) => Promise<void>;
  onSendTest: (input: { subject: string; body: string; bodyFormat: LeadEmailBodyFormat }) => Promise<void>;
}

const LeadEmailModal: React.FC<LeadEmailModalProps> = ({
  lead,
  eligibility,
  checkingEligibility,
  pending,
  testPending,
  testRecipient,
  ccRecipient,
  scope,
  eligibilityError,
  onClose,
  onSubmit,
  onSendTest,
}) => {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [bodyFormat, setBodyFormat] = useState<LeadEmailBodyFormat>('text');
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    setSubject('');
    setBody('');
    setTemplateId('');
    setBodyFormat('text');
    setShowPreview(false);
  }, [lead.id]);

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const template = LEAD_EMAIL_TEMPLATES.find(item => item.id === id);
    if (!template) return;
    const filled = applyLeadTemplate(template, lead.profile?.first_name);
    setBodyFormat('text');
    setSubject(filled.subject);
    setBody(filled.body);
  };

  const busy = pending || testPending;
  const blocked = Boolean(eligibility?.hardBlocked) || Boolean(eligibilityError);
  const hasBody = body.trim().length > 0;
  const composed = subject.trim().length > 0 && hasBody;
  // Real send respects consent/suppression; the test always goes to the operator's
  // own inbox, so it only needs a composed message (never gated by the lead's status).
  const valid = composed && !blocked && !checkingEligibility && !busy;
  const testValid = composed && !busy;
  const message = { subject: subject.trim(), body: body.trim(), bodyFormat };
  const previewHtml = hasBody
    ? buildLeadEmailHtml({ body: message.body, bodyFormat, recipientEmail: lead.profile?.email || '', scope })
    : '';

  return (
    <CrmModal title="Send Email" subtitle="One-to-one inquiry correspondence" icon={Mail} pending={busy} onClose={onClose} maxWidth="max-w-5xl">
      <form className="space-y-5 p-6" onSubmit={event => { event.preventDefault(); if (valid) void onSubmit(message); }}>
        {checkingEligibility && <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-400"><Loader2 className="animate-spin text-cyan-300" size={15} />Checking suppression and consent status…</div>}
        {eligibilityError && <div className="flex gap-3 rounded-xl border border-rose-400/25 bg-rose-400/[0.06] p-4 text-xs leading-5 text-rose-200"><ShieldAlert className="shrink-0" size={18} /><span><strong className="block text-white">Email eligibility could not be verified</strong>{eligibilityError} Sending is disabled.</span></div>}
        {eligibility?.hardBlocked && <div className="flex gap-3 rounded-xl border border-rose-400/25 bg-rose-400/[0.06] p-4 text-xs leading-5 text-rose-200"><ShieldAlert className="shrink-0" size={18} /><span><strong className="block text-white">Sending blocked</strong>This address has a {eligibility.hardBlockReasons.join(' and ')} suppression. Resolve the suppression outside this screen before contacting it.</span></div>}
        {eligibility?.marketingUnsubscribed && !eligibility.hardBlocked && <div className="flex gap-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-4 text-xs leading-5 text-amber-200"><AlertTriangle className="shrink-0" size={18} /><span>This contact has unsubscribed from marketing emails; keep this strictly about their inquiry.</span></div>}
        <label className="block space-y-2 text-xs font-bold text-slate-300">
          <span className="flex items-center gap-1.5"><FileText size={13} className="text-cyan-300" />Template</span>
          <select
            value={templateId}
            onChange={event => { if (event.target.value) applyTemplate(event.target.value); else setTemplateId(''); }}
            disabled={blocked}
            className="w-full appearance-none rounded-xl border border-white/10 bg-[#0A0E27] p-3 text-white outline-none focus:border-cyan-400/50 disabled:opacity-40"
          >
            <option value="">— Start from scratch —</option>
            {LEAD_EMAIL_TEMPLATES.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
          </select>
        </label>
        <label className="block space-y-2 text-xs font-bold text-slate-300">To<input value={lead.profile?.email || ''} readOnly className="w-full cursor-not-allowed rounded-xl border border-white/10 bg-white/[0.025] p-3 text-slate-400 outline-none" /></label>
        {ccRecipient && <label className="block space-y-2 text-xs font-bold text-slate-300">Cc<input value={ccRecipient} readOnly title="Automatically copied on lead sends (not on test sends)" className="w-full cursor-not-allowed rounded-xl border border-white/10 bg-white/[0.025] p-3 text-slate-400 outline-none" /></label>}
        <label className="block space-y-2 text-xs font-bold text-slate-300">Subject *<input autoFocus value={subject} onChange={event => setSubject(event.target.value)} disabled={blocked} className="w-full rounded-xl border border-white/10 bg-[#0A0E27] p-3 text-white outline-none focus:border-cyan-400/50 disabled:opacity-40" /></label>
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex rounded-xl border border-white/10 bg-[#0A0E27] p-1">
              <button type="button" onClick={() => setBodyFormat('text')} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-wider transition ${bodyFormat === 'text' ? 'bg-cyan-400/15 text-cyan-200' : 'text-slate-500 hover:text-slate-300'}`}><FileText size={13} />Plain text</button>
              <button type="button" onClick={() => { setBodyFormat('html'); setTemplateId(''); }} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-wider transition ${bodyFormat === 'html' ? 'bg-cyan-400/15 text-cyan-200' : 'text-slate-500 hover:text-slate-300'}`}><Code2 size={13} />HTML</button>
            </div>
            <button type="button" onClick={() => setShowPreview(current => !current)} disabled={!hasBody} className="flex items-center gap-2 rounded-xl border border-cyan-400/25 bg-cyan-400/[0.06] px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-cyan-200 transition hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-40"><Eye size={14} />{showPreview ? 'Hide preview' : 'Preview email'}</button>
          </div>
          <div className={showPreview ? 'grid gap-4 lg:grid-cols-2' : ''}>
            <label className="block space-y-2 text-xs font-bold text-slate-300">Message *<textarea rows={showPreview ? 18 : 9} value={body} onChange={event => setBody(event.target.value)} disabled={blocked} spellCheck={bodyFormat === 'text'} className={`w-full resize-y rounded-xl border border-white/10 bg-[#0A0E27] p-3 text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/50 disabled:opacity-40 ${bodyFormat === 'html' ? 'font-mono text-[12px] leading-5' : ''}`} placeholder={bodyFormat === 'html' ? 'Paste your email HTML here…' : 'Write a plain-text message about this inquiry…'} /></label>
            {showPreview && <div className="space-y-2"><p className="text-xs font-bold text-slate-300">Preview</p><iframe title="Lead email preview" sandbox="" srcDoc={previewHtml} className="h-[28rem] w-full rounded-xl border border-slate-200 bg-white" /></div>}
          </div>
        </section>
        <p className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-[11px] leading-5 text-slate-500">{bodyFormat === 'html' ? <>Paste the HTML that should be sent, then use <strong className="text-slate-300">Preview email</strong> to inspect it safely before sending.</> : <>Formatting: leave a blank line between paragraphs, and wrap text in <strong className="text-slate-300">**double asterisks**</strong> to bold it.</>} A Sproutify Farm footer (contact info, mailing address, unsubscribe link) is added automatically.</p>
        <div className="flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => { if (testValid) void onSendTest(message); }}
            disabled={!testValid}
            title={`Send a test copy to ${testRecipient}`}
            className="flex items-center justify-center gap-2 rounded-xl border border-cyan-400/25 bg-cyan-400/[0.06] px-4 py-3 text-xs font-black uppercase tracking-wider text-cyan-200 transition hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {testPending ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />} Send test to me
          </button>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} disabled={busy} className="rounded-xl px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-400 hover:bg-white/5 disabled:opacity-40">Cancel</button>
            <button type="submit" disabled={!valid} className="flex items-center gap-2 rounded-xl bg-[#00D9FF] px-5 py-3 text-xs font-black uppercase tracking-wider text-[#07101D] disabled:cursor-not-allowed disabled:opacity-40">{pending ? <Loader2 className="animate-spin" size={16} /> : <Mail size={16} />} Send email</button>
          </div>
        </div>
      </form>
    </CrmModal>
  );
};

export default LeadEmailModal;
