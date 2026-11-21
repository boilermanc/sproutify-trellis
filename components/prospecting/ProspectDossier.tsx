import React, { useMemo } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  Check,
  ExternalLink,
  Globe2,
  Lightbulb,
  Phone,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
} from 'lucide-react';
import type {
  ProspectingClaim,
  ProspectingEvidenceDecision,
  ProspectingProspectDetail,
} from '../../types';
import type {
  ProspectingResearchCandidate,
  ProspectingResearchSource,
} from '../../services/prospectingResearchService';

type DossierRecord = ProspectingProspectDetail | ProspectingResearchCandidate;

export interface ProspectDossierProps {
  record: DossierRecord;
  kind: 'prospect' | 'candidate';
  territoryIntel?: ProspectTerritoryIntelItem[];
  busy?: boolean;
  onReviewClaim?: (
    claimId: string,
    decision: Exclude<ProspectingEvidenceDecision, 'pending'>,
    correction?: string,
  ) => void;
  onReviewCandidate?: (decision: 'approved' | 'corrected' | 'rejected') => void;
  onRequestPitchReady?: () => void;
}

export interface ProspectTerritoryIntelItem {
  id: string;
  title: string;
  category: string;
  summary: string;
  confidence?: number | null;
  status?: 'observed' | 'hypothesis' | 'needs_verification';
  sources: Array<{ url: string; title?: string | null; excerpt?: string | null }>;
}

type Metadata = Record<string, unknown>;

const words = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());

const textValue = (metadata: Metadata, keys: string[]) => {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
};

const numberValue = (metadata: Metadata, keys: string[]) => {
  for (const key of keys) {
    const value = Number(metadata[key]);
    if (Number.isFinite(value)) return Math.max(0, Math.min(100, Math.round(value)));
  }
  return null;
};

const metadataOf = (record: DossierRecord): Metadata => {
  if (!('metadata' in record) || !record.metadata || typeof record.metadata !== 'object') return {};
  const metadata = record.metadata as Metadata;
  const snapshot = metadata.research_snapshot;
  return snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
    ? { ...metadata, ...(snapshot as Metadata) }
    : metadata;
};

const claimsOf = (record: DossierRecord): ProspectingClaim[] =>
  'claims' in record && Array.isArray(record.claims) ? record.claims : [];

const candidateSourcesOf = (record: DossierRecord): ProspectingResearchSource[] =>
  'sources' in record && Array.isArray(record.sources) ? record.sources : [];

const claimValue = (claims: ProspectingClaim[], types: string[]) => {
  const claim = claims.find(item => types.includes(item.claim_type));
  return claim?.founder_correction || claim?.display_value || claim?.normalized_value || null;
};

const SourceLink = ({ url, title, excerpt }: { url: string; title?: string | null; excerpt?: string | null }) => (
  <div className="rounded-sm border border-slate-200 bg-white p-3">
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-black text-blue-700 hover:text-blue-900">
      {title || 'Open source'} <ExternalLink size={12} />
    </a>
    {excerpt && <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{excerpt}</p>}
  </div>
);

export default function ProspectDossier({
  record,
  kind,
  territoryIntel = [],
  busy = false,
  onReviewClaim,
  onReviewCandidate,
  onRequestPitchReady,
}: ProspectDossierProps) {
  const metadata = metadataOf(record);
  const claims = claimsOf(record);
  const candidateSources = candidateSourcesOf(record);
  const location = [record.city, record.state_code, record.postal_code].filter(Boolean).join(', ');
  const fitScore = numberValue(metadata, ['fit_score', 'spectiq_fit_score']);
  const stackValue = metadata.current_stack;
  const currentStack = Array.isArray(stackValue)
    ? stackValue.filter(item => typeof item === 'string' && item.trim()).join(' · ') || null
    : textValue(metadata, ['current_stack', 'software_stack', 'observed_stack']);
  const fitRationale = textValue(metadata, ['fit_rationale', 'spectiq_fit_rationale']);
  const opportunity = textValue(metadata, ['opportunity_hypothesis', 'opportunity'])
    || claimValue(claims, ['opportunity']);
  const friction = textValue(metadata, ['friction_point', 'key_friction_point']);
  const suggestedPitch = textValue(metadata, ['suggested_pitch', 'pitch_draft'])
    || claimValue(claims, ['outreach_angle']);
  const evidenceReviewed = claims.length > 0 && claims.every(claim => claim.verification_decision !== 'pending');
  const canRequestPitchReady = kind === 'prospect'
    && 'verification_state' in record
    && record.verification_state === 'outreach_approved'
    && evidenceReviewed;

  const sourceCards = useMemo(() => {
    if (candidateSources.length) return candidateSources;
    return claims
      .filter(claim => claim.source_url)
      .map(claim => ({
        url: claim.source_url,
        title: words(claim.claim_type),
        excerpt: claim.source_excerpt || claim.display_value,
      }));
  }, [candidateSources, claims]);

  return <div className="space-y-5">
    <section className="overflow-hidden rounded-sm border border-slate-200 bg-white">
      <div className="border-b border-slate-100 bg-slate-950 p-5 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-300">SpectIQ dossier</p>
            <h2 className="mt-2 text-xl font-black">{record.company_name}</h2>
            <p className="mt-1 text-xs font-semibold text-slate-300">{location || 'Location needs verification'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {fitScore !== null && <span className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-black">Fit hypothesis · {fitScore}</span>}
            <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-black">{kind === 'candidate' ? 'Research candidate' : words('sales_state' in record ? record.sales_state : 'new')}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <div className="rounded-sm bg-slate-50 p-4">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400"><Building2 size={14} />Observed current stack</p>
          <p className="mt-2 text-sm font-bold text-slate-800">{currentStack || 'Not established by the available evidence'}</p>
        </div>
        <div className="rounded-sm bg-slate-50 p-4">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400"><Globe2 size={14} />Website status</p>
          <p className="mt-2 text-sm font-bold text-slate-800">{words(record.website_state)}</p>
          {record.website_url && <a href={record.website_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-black text-blue-700">Visit official URL <ExternalLink size={11} /></a>}
        </div>
        <div className="rounded-sm bg-slate-50 p-4">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400"><Phone size={14} />Public phone</p>
          <p className="mt-2 text-sm font-bold text-slate-800">{record.phone || 'Not identified'}</p>
        </div>
        <div className="rounded-sm bg-slate-50 p-4">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400"><ShieldCheck size={14} />Evidence state</p>
          <p className="mt-2 text-sm font-bold text-slate-800">{claims.length ? `${claims.length} field-level claim${claims.length === 1 ? '' : 's'}` : `${sourceCards.length} research source${sourceCards.length === 1 ? '' : 's'}`}</p>
        </div>
      </div>
    </section>

    {territoryIntel.length > 0 && <section className="rounded-sm border border-slate-200 bg-white p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-sm bg-blue-50 p-2 text-blue-700"><Lightbulb size={17} /></div>
        <div><h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Territory market intelligence</h3><p className="mt-1 text-xs leading-relaxed text-slate-500">Evidence-grounded local context. Hypotheses must be verified before they shape a pitch.</p></div>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {territoryIntel.map(item => {
          const status = item.status || 'needs_verification';
          const confidence = typeof item.confidence === 'number' ? Math.max(0, Math.min(100, Math.round(item.confidence * (item.confidence <= 1 ? 100 : 1)))) : null;
          return <article key={item.id} className="rounded-sm border border-slate-200 bg-slate-50/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><p className="text-[10px] font-black uppercase tracking-widest text-blue-700">{item.category}</p><h4 className="mt-1 text-sm font-black text-slate-900">{item.title}</h4></div>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${status === 'observed' ? 'bg-emerald-100 text-emerald-800' : status === 'hypothesis' ? 'bg-orange-100 text-orange-800' : 'bg-amber-100 text-amber-800'}`}>{words(status)}{confidence !== null ? ` · ${confidence}%` : ''}</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">{item.summary}</p>
            <div className="mt-3 space-y-2">
              {item.sources.length > 0 ? item.sources.map((source, index) => <div key={`${item.id}-${source.url}-${index}`}><SourceLink {...source} /></div>) : <p className="rounded-sm border border-dashed border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-800">No citation attached. Treat this only as an unverified prompt for further research.</p>}
            </div>
          </article>;
        })}
      </div>
    </section>}

    <section className="rounded-sm border border-orange-200 bg-orange-50/60 p-5">
      <div className="flex items-center gap-2 text-orange-800"><Sparkles size={16} /><h3 className="text-xs font-black uppercase tracking-widest">Sales interpretation · advisory</h3></div>
      <p className="mt-2 text-xs leading-relaxed text-orange-900">These are working hypotheses generated from public evidence. Verify them before using them in a pitch.</p>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-sm border border-orange-200 bg-white p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-orange-700">Why it may fit</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">{fitRationale || 'No fit rationale has been documented yet.'}</p>
        </div>
        <div className="rounded-sm border border-orange-200 bg-white p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-orange-700">Opportunity hypothesis</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">{opportunity || 'No opportunity hypothesis has been documented yet.'}</p>
        </div>
        <div className="rounded-sm border border-amber-200 bg-amber-50 p-4 lg:col-span-2">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-amber-800"><AlertTriangle size={13} />Key friction to verify</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">{friction || 'No specific friction point is supported yet.'}</p>
        </div>
      </div>
    </section>

    <section className="rounded-sm border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Suggested pitch draft</h3><p className="mt-1 text-xs text-slate-500">Internal drafting aid only. Nothing here is sent automatically.</p></div>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-amber-800">Draft · not approved</span>
      </div>
      <p className="mt-4 whitespace-pre-wrap rounded-sm bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">{suggestedPitch || 'No suggested pitch has been drafted.'}</p>
      {onRequestPitchReady && <button disabled={busy || !canRequestPitchReady} onClick={onRequestPitchReady} className="mt-4 inline-flex items-center gap-2 rounded-sm bg-slate-950 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white disabled:cursor-not-allowed disabled:opacity-40"><BadgeCheck size={14} />Mark pitch ready</button>}
      {onRequestPitchReady && !canRequestPitchReady && <p className="mt-2 text-xs font-semibold text-amber-700">Review every evidence claim and explicitly approve outreach before enabling pitch-ready.</p>}
    </section>

    <section className="rounded-sm border border-slate-200 bg-white p-5">
      <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Sources and field-level evidence</h3>
      <div className="mt-4 space-y-3">
        {claims.length > 0 ? claims.map(claim => <div key={claim.id} className="rounded-sm border border-slate-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><p className="text-sm font-black text-slate-800">{words(claim.claim_type)}</p><p className="mt-1 text-sm text-slate-600">{claim.founder_correction || claim.display_value}</p></div>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${claim.verification_decision === 'approved' ? 'bg-emerald-100 text-emerald-800' : claim.verification_decision === 'rejected' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>{words(claim.verification_decision)}</span>
          </div>
          {claim.source_excerpt && <p className="mt-3 border-l-2 border-slate-200 pl-3 text-xs leading-relaxed text-slate-500">{claim.source_excerpt}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a href={claim.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-black text-blue-700">Open source <ExternalLink size={11} /></a>
            {onReviewClaim && <>
              <button disabled={busy} onClick={() => onReviewClaim(claim.id, 'approved')} className="inline-flex items-center gap-1 rounded-sm bg-emerald-50 px-2.5 py-1.5 text-[10px] font-black uppercase text-emerald-800 disabled:opacity-50"><Check size={11} />Approve</button>
              <button disabled={busy} onClick={() => { const correction = window.prompt('Enter the corrected claim value'); if (correction?.trim()) onReviewClaim(claim.id, 'corrected', correction.trim()); }} className="rounded-sm bg-blue-50 px-2.5 py-1.5 text-[10px] font-black uppercase text-blue-800 disabled:opacity-50">Correct</button>
              <button disabled={busy} onClick={() => onReviewClaim(claim.id, 'rejected')} className="inline-flex items-center gap-1 rounded-sm bg-rose-50 px-2.5 py-1.5 text-[10px] font-black uppercase text-rose-800 disabled:opacity-50"><ThumbsDown size={11} />Reject</button>
            </>}
          </div>
        </div>) : sourceCards.length > 0 ? sourceCards.map((source, index) => <SourceLink key={`${source.url}-${index}`} {...source} />) : <div className="rounded-sm border border-dashed border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-800">No supporting sources are attached. Do not treat this dossier as verified.</div>}
      </div>
      {kind === 'candidate' && onReviewCandidate && <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        <button disabled={busy} onClick={() => onReviewCandidate('approved')} className="rounded-sm bg-emerald-600 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50">Approve candidate</button>
        <button disabled={busy} onClick={() => onReviewCandidate('corrected')} className="rounded-sm bg-blue-600 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50">Correct candidate</button>
        <button disabled={busy} onClick={() => onReviewCandidate('rejected')} className="rounded-sm bg-rose-50 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-rose-800 disabled:opacity-50">Reject candidate</button>
      </div>}
    </section>
  </div>;
}
