import { useEffect, useRef, useState, type ReactNode, type FC } from 'react';
import { Plus, RefreshCw, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { evaluateBriefReadiness } from '../services/opportunityBrief.mjs';
import { briefContent, emptyBriefContent, opportunityBriefRequest, type BriefContent, type BriefFact, type BriefSnapshot } from '../services/opportunityBriefService';

const inputClass = 'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 disabled:bg-slate-50';
const buttonClass = 'inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold disabled:opacity-40';
const lines = (value: string) => value.split('\n').map(item => item.trim()).filter(Boolean);
const uid = () => crypto.randomUUID();
const dateValue = (value: string) => value ? value.slice(0, 10) : '';
const isoDate = (value: string) => value ? `${value}T00:00:00.000Z` : '';
function newFact(): BriefFact {
  const today = isoDate(new Date().toISOString().slice(0, 10));
  return { id: uid(), claim: '', status: 'proposed', reviewer_id: null, approved_at: null, offering_ids: [], last_confirmed_at: today, review_due_at: '',
    evidence: [{ id: uid(), source_url: '', title: '', captured_at: today, excerpt: null, record_reference: null }] };
}
const Field: FC<{ label: string; value: string; onChange: (value: string) => void; multiline?: boolean; type?: string }> = ({ label, value, onChange, multiline = false, type = 'text' }) => {
  // Keep newlines while editing list fields; their canonical array value omits empty rows.
  const [buffer, setBuffer] = useState(value);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setBuffer(value); }, [value]);
  return <label className="block text-xs font-bold text-slate-600">{label}{multiline ? <textarea aria-label={label} className={inputClass} rows={3} value={buffer} onFocus={() => { focused.current = true; }} onBlur={() => { focused.current = false; setBuffer(value); }} onChange={event => { setBuffer(event.target.value); onChange(event.target.value); }} /> : <input aria-label={label} className={inputClass} type={type} value={value} onChange={event => onChange(event.target.value)} />}</label>;
};
const Item: FC<{ title: string; children: ReactNode }> = ({ title, children }) => {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => { if (!title && ref.current) ref.current.open = true; }, []);
  return <details ref={ref} name="brief-items" className="rounded-xl border border-slate-200 p-3">
    <summary className="cursor-pointer text-sm font-bold text-slate-800">{title || 'New item'}</summary>
    <div className="mt-4 space-y-3">{children}</div>
  </details>;
};
function Section({ title, children, add }: { title: string; children: ReactNode; add?: () => void }) {
  return <section className="space-y-4 rounded-[2rem] border border-slate-200 bg-white p-5"><div className="flex items-center justify-between gap-3"><h3 className="font-black text-slate-800">{title}</h3>{add && <button type="button" className={buttonClass} onClick={add}><Plus size={14} />Add</button>}</div>{children}</section>;
}
function OfferingChoices({ offerings, selected, onChange }: { offerings: BriefContent['offerings']; selected: string[]; onChange: (ids: string[]) => void }) {
  return <div className="space-y-2"><p className="text-xs font-bold text-slate-600">Associated offerings (optional)</p>{!offerings.length && <p className="text-xs text-slate-500">Add an offering first.</p>}{offerings.map(offering => <label key={offering.id} className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={selected.includes(offering.id)} onChange={event => onChange(event.target.checked ? [...selected, offering.id] : selected.filter(id => id !== offering.id))} />{offering.name || 'Unnamed offering'}</label>)}</div>;
}

const PriorityPolicy: FC<{ priority: BriefContent['priorities'][number]; onChange: (update: Partial<BriefContent['priorities'][number]>) => void }> = ({ priority, onChange }) => {
  const [weight, setWeight] = useState(priority.weight === null ? '' : String(priority.weight));
  useEffect(() => { setWeight(priority.weight === null ? '' : String(priority.weight)); }, [priority.id]);
  return <div className="space-y-3 border-t pt-3"><p className="text-sm font-bold text-slate-800">{priority.outcome || 'Untitled priority'}</p><label className="block text-xs font-bold text-slate-600">Relative weight (0–1; blank means unset)<input aria-label="Relative weight (0–1; blank means unset)" className={inputClass} type="number" min="0" max="1" step="0.01" value={weight} onChange={event => { setWeight(event.target.value); onChange({ weight: event.target.value === '' ? null : Number(event.target.value) }); }} /></label><div className="grid gap-3 md:grid-cols-2"><Field label="Priority starts (optional, UTC)" type="date" value={dateValue(priority.starts_at || '')} onChange={value => onChange({ starts_at: value ? isoDate(value) : null })} /><Field label="Priority ends (optional, exclusive UTC)" type="date" value={dateValue(priority.ends_at || '')} onChange={value => onChange({ ends_at: value ? isoDate(value) : null })} /></div></div>;
};

export default function OpportunityBriefPanel({ projectId, addToast, onDirtyChange }: { projectId: string; addToast: (message: string, type?: 'success' | 'error' | 'info') => void; onDirtyChange?: (dirty: boolean) => void }) {
  const [editing, setEditing] = useState(false);
  const [step, setStep] = useState(0);
  const [brandId, setBrandId] = useState('');
  const [snapshot, setSnapshot] = useState<BriefSnapshot | null>(null);
  const [content, setContent] = useState<BriefContent>(emptyBriefContent);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [approveChecked, setApproveChecked] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const epoch = useRef(0);
  const currentScope = useRef('');
  currentScope.current = `${projectId}:${brandId}`;
  useEffect(() => {
    const token = ++epoch.current;
    const controller = new AbortController();
    setEditing(false); setStep(0); setSnapshot(null); setContent(emptyBriefContent()); setDirty(false); setError(''); setBusy(true); setConfirmed([]); setApproveChecked(false);
    opportunityBriefRequest(projectId, 'list', brandId ? { brand_id: brandId } : {}, controller.signal)
      .then(data => {
        if (epoch.current !== token) return;
        setSnapshot(data); setContent(data.current ? briefContent(data.current) : emptyBriefContent());
      })
      .catch(caught => { if (epoch.current === token && !controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Could not load brand brief.'); })
      .finally(() => { if (epoch.current === token) setBusy(false); });
    return () => { ++epoch.current; controller.abort(); };
  }, [projectId, brandId, refresh]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const edit = (update: (previous: BriefContent) => BriefContent) => { setContent(update); setDirty(true); setConfirmed([]); setApproveChecked(false); };
  const factEdit = (index: number, update: Partial<BriefFact>) => edit(previous => ({ ...previous, facts: previous.facts.map((fact, i) => i === index ? { ...fact, ...update, status: 'proposed', reviewer_id: null, approved_at: null } : fact) }));
  const withdrawFact = (fact: BriefFact, status: 'revoked' | 'retired') => {
    const saved = snapshot?.current?.facts.find(item => item.id === fact.id);
    if (!saved) return;
    if (JSON.stringify(saved) !== JSON.stringify(fact) && !window.confirm('Discard unsaved edits to this fact and withdraw its saved version? Its attribution will be preserved.')) return;
    edit(previous => ({ ...previous, facts: previous.facts.map(item => item.id === fact.id ? { ...structuredClone(saved), status } : item) }));
  };
  const selectedBrandId = snapshot?.scope?.brand_id || brandId;
  const canEdit = Boolean(snapshot?.can_manage && selectedBrandId && !busy);
  const save = async (action: 'save' | 'approve') => {
    if (!snapshot?.scope || busy) return;
    const token = epoch.current;
    const scope = currentScope.current;
    setBusy(true); setError('');
    try {
      const data = await opportunityBriefRequest(projectId, action, { brand_id: snapshot.scope.brand_id, expected_version_id: snapshot.current?.version_id || null,
        ...(action === 'save' ? { brief: content } : { confirmed_fact_ids: confirmed }) });
      if (token !== epoch.current || scope !== currentScope.current) return;
      setSnapshot(data); setContent(data.current ? briefContent(data.current) : emptyBriefContent()); setDirty(false); setConfirmed([]); setApproveChecked(false);
      if (action === 'approve') setEditing(false);
      addToast(action === 'save' ? 'Draft saved. Review it when you are ready.' : 'Brand brief approved.', 'success');
    } catch (caught) {
      if (token !== epoch.current || scope !== currentScope.current) return;
      const message = caught instanceof Error ? caught.message : 'Brand brief request failed.';
      setError(message); addToast(message, 'error');
    } finally { if (token === epoch.current && scope === currentScope.current) setBusy(false); }
  };
  const reload = () => { if (!dirty || window.confirm('Discard unsaved brief edits and reload?')) setRefresh(value => value + 1); };
  const readiness = snapshot?.current && snapshot.scope ? {
    research: evaluateBriefReadiness(snapshot.current, { expectedScope: snapshot.scope, now: new Date().toISOString(), workflow: 'research' }),
    drafting: evaluateBriefReadiness(snapshot.current, { expectedScope: snapshot.scope, now: new Date().toISOString(), workflow: 'drafting' }),
  } : null;
  const closeSetup = () => {
    if (dirty && !window.confirm('Discard unsaved brief edits?')) return;
    setContent(snapshot?.current ? briefContent(snapshot.current) : emptyBriefContent());
    setDirty(false); setConfirmed([]); setApproveChecked(false); setEditing(false);
  };
  const steps = ['Business', 'Goals', 'Facts & review'];
  const issues = readiness ? Array.from(new Set([...readiness.research.issues, ...readiness.drafting.issues].map((issue: { message: string }) => issue.message))) as string[] : [];
  return <div className="space-y-4">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-bold text-slate-900">Brand brief</h2><p className="mt-1 text-sm text-slate-600">What you sell, who you serve, and what you want to grow.</p></div>
      <button type="button" disabled={busy} onClick={reload} className={buttonClass}><RefreshCw size={14} />Reload</button>
    </header>
    {snapshot && snapshot.brands.length > 1 && <label className="block max-w-md text-xs font-bold text-slate-600">Marketing brand<select aria-label="Marketing brand" disabled={busy} className={inputClass} value={selectedBrandId} onChange={event => { if (!dirty || window.confirm('Discard unsaved edits and switch brand?')) setBrandId(event.target.value); }}><option value="">Choose a brand</option>{snapshot.brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label>}
    {error && <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">{error}{dirty && ' Your unsaved edits are retained. Reload before retrying an uncertain write.'}</div>}
    {busy && <p role="status" className="text-sm text-slate-500">Loading or saving brand brief…</p>}
    {snapshot && !snapshot.brands.length && <Section title="Marketing profile required"><p className="text-sm text-slate-600">First create a profile in Brand Profiles and link it to this branch. Then come back and reload.</p></Section>}
    {snapshot && snapshot.brands.length > 0 && !snapshot.scope && <p className="text-sm text-slate-600">Choose a marketing brand to continue.</p>}
    {snapshot?.scope && <>
      {!snapshot.can_manage && <p className="text-sm text-amber-800">Read-only access. A brand manager must save changes.</p>}
      {!editing ? <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="font-bold text-slate-900">{snapshot.current ? snapshot.brands.find(brand => brand.id === selectedBrandId)?.name || 'Your brand' : 'Start with your business'}</h3>
        {snapshot.current ? <>
          <p className="text-sm text-slate-600">Version {snapshot.current.version} · {snapshot.current.status} · {content.offerings.length} offerings · {content.facts.length} facts</p>
          <p className="text-sm text-slate-700">{readiness?.research.ready ? 'Brief ready for research.' : 'Next: finish and approve your business brief.'} {readiness?.drafting.ready ? 'Facts ready for drafting.' : 'Add verified facts when you are ready for content drafting.'}</p>
          <p className="text-xs text-slate-500">This prepares your brand context. It does not start research or publish content.</p>
        </> : <p className="max-w-xl text-sm text-slate-600">Tell Trellis what matters to this brand before looking for relevant trends. Start with your offerings and audience; verified facts can come later.</p>}
        <button type="button" disabled={busy} className={`${buttonClass} bg-emerald-700 text-white`} onClick={() => { setStep(0); setEditing(true); }}>{snapshot.can_manage ? snapshot.current ? 'Edit brief' : 'Start setup' : snapshot.current ? 'View brief' : 'View setup'}</button>
      </section> : <>
        <nav aria-label="Brief setup steps" className="flex flex-wrap gap-2">{steps.map((label, index) => <button type="button" key={label} id={`brief-step-${index}`} aria-current={step === index ? 'step' : undefined} className={`${buttonClass} ${step === index ? 'bg-slate-900 text-white' : 'bg-white text-slate-700'}`} onClick={() => setStep(index)}>{index + 1}. {label}</button>)}</nav>
        <p className="text-sm text-slate-600">{step === 0 ? 'Add at least one offering and the audience it serves. Each offering needs a name, type, and source URL before saving.' : step === 1 ? 'Choose a business goal and the topics and markets to research.' : 'Save and approve the business brief. Verified facts and a writing style are only needed for drafting content.'}</p>
        <fieldset disabled={!canEdit} className="space-y-4 disabled:opacity-75">
          {step === 0 && <>
        <Section title="Offerings" add={() => edit(previous => ({ ...previous, offerings: [...previous.offerings, { id: uid(), name: '', type: '', source_url: '', availability: 'unknown', markets: [] }] }))}>
          {!content.offerings.length && <p className="text-sm text-slate-500">Add the products, services, or experiences this brand actually offers.</p>}
          {content.offerings.map((item, index) => <Item key={item.id} title={item.name}><div className="grid gap-3 md:grid-cols-2">{(['name', 'type', 'source_url'] as const).map(key => <Field key={key} label={key === 'source_url' ? 'Source / catalog URL' : key === 'name' ? 'Offering name' : 'Product or service type'} value={item[key]} onChange={value => edit(previous => ({ ...previous, offerings: previous.offerings.map((entry, i) => i === index ? { ...entry, [key]: value } : entry) }))} />)}<label className="text-xs font-bold text-slate-600">Availability<select className={inputClass} value={item.availability} onChange={event => edit(previous => ({ ...previous, offerings: previous.offerings.map((entry, i) => i === index ? { ...entry, availability: event.target.value as typeof item.availability } : entry) }))}>{['unknown', 'available', 'limited', 'unavailable'].map(value => <option key={value}>{value}</option>)}</select></label><button type="button" className={buttonClass} onClick={() => edit(previous => ({ ...previous, offerings: previous.offerings.filter(entry => entry.id !== item.id), audiences: previous.audiences.map(entry => ({ ...entry, offering_ids: entry.offering_ids.filter(id => id !== item.id) })), facts: previous.facts.map(entry => entry.offering_ids.includes(item.id) ? { ...entry, offering_ids: entry.offering_ids.filter(id => id !== item.id), status: 'proposed', reviewer_id: null, approved_at: null } : entry) }))}><Trash2 size={14} />Remove offering</button></div></Item>)}
        </Section>
        <Section title="Audiences" add={() => edit(previous => ({ ...previous, audiences: [...previous.audiences, { id: uid(), description: '', needs: [], offering_ids: [], exclusions: [] }] }))}>{content.audiences.map((item, index) => <Item key={item.id} title={item.description}><Field label="Audience description" value={item.description} onChange={value => edit(previous => ({ ...previous, audiences: previous.audiences.map((entry, i) => i === index ? { ...entry, description: value } : entry) }))} /><Field label="Needs (one per line)" multiline value={item.needs.join('\n')} onChange={value => edit(previous => ({ ...previous, audiences: previous.audiences.map((entry, i) => i === index ? { ...entry, needs: lines(value) } : entry) }))} /><button type="button" className={buttonClass} onClick={() => edit(previous => ({ ...previous, audiences: previous.audiences.filter(entry => entry.id !== item.id) }))}>Remove audience</button></Item>)}</Section>

          </>}
          {step === 1 && <>
        <Section title="Business priorities" add={() => edit(previous => ({ ...previous, priorities: [...previous.priorities, { id: uid(), outcome: '', weight: null, starts_at: null, ends_at: null }] }))}>{content.priorities.map((item, index) => <Item key={item.id} title={item.outcome}><Field label="Desired outcome" value={item.outcome} onChange={value => edit(previous => ({ ...previous, priorities: previous.priorities.map((entry, i) => i === index ? { ...entry, outcome: value } : entry) }))} /><button type="button" className={buttonClass} onClick={() => edit(previous => ({ ...previous, priorities: previous.priorities.filter(entry => entry.id !== item.id) }))}>Remove priority</button></Item>)}</Section>

            <Section title="Research focus">{(['markets', 'languages', 'topic_seeds'] as const).map(key => <Field key={key} label={`${({ markets: 'Markets to reach', languages: 'Content languages', topic_seeds: 'Topics to research' })[key]} (one per line)`} multiline value={content.research_context[key].join('\n')} onChange={value => edit(previous => ({ ...previous, research_context: { ...previous.research_context, [key]: lines(value) } }))} />)}</Section>
          </>}
          {step === 2 && <>
            <details className="rounded-xl border p-4"><summary className="cursor-pointer font-bold text-sm">Facts and evidence ({content.facts.length})</summary><div className="mt-3">
        <Section title="Facts and evidence" add={() => edit(previous => ({ ...previous, facts: [...previous.facts, newFact()] }))}>
          <p className="text-xs text-slate-500">Do not enter customer data or credentials. A URL alone is not evidence: include the supporting excerpt or a record reference. Changed facts require fresh approval.</p>
          {content.facts.map((fact, index) => <Item key={fact.id} title={fact.claim}><p className="text-xs font-bold text-slate-500">{fact.status} · {Date.parse(fact.review_due_at) <= Date.now() ? 'Review overdue' : 'Review date below'}</p><Field label="Exact claim" multiline value={fact.claim} onChange={value => factEdit(index, { claim: value })} /><div className="grid gap-3 md:grid-cols-2"><Field label="Last confirmed" type="date" value={dateValue(fact.last_confirmed_at)} onChange={value => factEdit(index, { last_confirmed_at: isoDate(value) })} /><Field label="Review due" type="date" value={dateValue(fact.review_due_at)} onChange={value => factEdit(index, { review_due_at: isoDate(value) })} /></div>{fact.evidence.map((evidence, evidenceIndex) => <div key={evidence.id} className="space-y-3 border-t pt-3">{(['title', 'source_url', 'excerpt', 'record_reference'] as const).map(key => <Field key={key} label={key.replaceAll('_', ' ')} multiline={key === 'excerpt'} value={evidence[key] || ''} onChange={value => factEdit(index, { evidence: fact.evidence.map((entry, i) => i === evidenceIndex ? { ...entry, [key]: value || (key === 'excerpt' || key === 'record_reference' ? null : '') } : entry) })} />)}<Field label="Evidence captured" type="date" value={dateValue(evidence.captured_at)} onChange={value => factEdit(index, { evidence: fact.evidence.map((entry, i) => i === evidenceIndex ? { ...entry, captured_at: isoDate(value) } : entry) })} /></div>)}<button type="button" className={buttonClass} onClick={() => edit(previous => ({ ...previous, facts: previous.facts.filter(entry => entry.id !== fact.id) }))}>Remove fact from new version</button></Item>)}
        </Section>

            </div></details>
            <details className="rounded-xl border p-4"><summary className="cursor-pointer font-bold text-sm">Voice and draft destinations</summary><div className="mt-3 space-y-4"><Field label="Brand voice" multiline value={content.voice.tone} onChange={value => edit(previous => ({ ...previous, voice: { ...previous.voice, tone: value } }))} />
        <Section title="Draft destinations"><Field label="Allowed channels (one per line)" multiline value={content.content_context.allowed_channels.join('\n')} onChange={value => edit(previous => ({ ...previous, content_context: { ...previous.content_context, allowed_channels: lines(value) } }))} />{content.content_context.calls_to_action.map((cta, index) => <div key={index} className="grid gap-3 md:grid-cols-2">{(['label', 'url'] as const).map(key => <Field key={key} label={`Call to action ${key}`} value={cta[key]} onChange={value => edit(previous => ({ ...previous, content_context: { ...previous.content_context, calls_to_action: previous.content_context.calls_to_action.map((entry, i) => i === index ? { ...entry, [key]: value } : entry) } }))} />)}<button type="button" className={buttonClass} onClick={() => edit(previous => ({ ...previous, content_context: { ...previous.content_context, calls_to_action: previous.content_context.calls_to_action.filter((_, i) => i !== index) } }))}>Remove CTA</button></div>)}<button type="button" className={buttonClass} onClick={() => edit(previous => ({ ...previous, content_context: { ...previous.content_context, calls_to_action: [...previous.content_context.calls_to_action, { label: '', url: '' }] } }))}><Plus size={14} />Add call to action</button></Section>

            </div></details>
            <details className="rounded-xl border p-4"><summary className="cursor-pointer font-bold text-sm">Advanced settings</summary><div className="mt-3 space-y-4">
              <Field label="Prohibited claims (one per line)" multiline value={content.restrictions.prohibited_claims.join('\n')} onChange={value => edit(previous => ({ ...previous, restrictions: { ...previous.restrictions, prohibited_claims: lines(value) } }))} />
              <Field label="seasonal context (one per line)" multiline value={content.research_context.seasonal_context.join('\n')} onChange={value => edit(previous => ({ ...previous, research_context: { ...previous.research_context, seasonal_context: lines(value) } }))} />
        <Section title="Priority weights and active dates">
          <p className="text-xs text-slate-500">Weights are owner choices, not AI confidence. Leave them blank when undecided. Priorities without dates remain active; an end date stops the priority at midnight UTC on that date.</p>
          {content.priorities.map((item, index) => <PriorityPolicy key={`${snapshot.current?.version_id || 'new'}:${item.id}`} priority={item} onChange={update => edit(previous => ({ ...previous, priorities: previous.priorities.map((entry, i) => i === index ? { ...entry, ...update } : entry) }))} />)}
        </Section>
        <Section title="Audience offering associations">
          {content.audiences.map((audience, index) => <div key={audience.id} className="space-y-3 border-t pt-3"><p className="text-sm font-bold text-slate-800">{audience.description || 'Unnamed audience'}</p><OfferingChoices offerings={content.offerings} selected={audience.offering_ids} onChange={ids => edit(previous => ({ ...previous, audiences: previous.audiences.map((entry, i) => i === index ? { ...entry, offering_ids: ids } : entry) }))} /></div>)}
        </Section>
        <Section title="Fact offering associations and withdrawal">
          <p className="text-xs text-slate-500">Changing an association requires fresh fact approval. Revoke an unsupported claim or retire one no longer in use. Withdrawal changes only the saved fact's status and preserves its reviewer, evidence, and dates in the new draft version.</p>
          {content.facts.map((fact, index) => <div key={fact.id} className="space-y-3 border-t pt-3"><p className="text-sm font-bold text-slate-800">{fact.claim || 'Untitled fact'} · {fact.status}</p><OfferingChoices offerings={content.offerings} selected={fact.offering_ids} onChange={ids => factEdit(index, { offering_ids: ids })} /><div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} disabled={!snapshot.current?.facts.some(item => item.id === fact.id) || fact.status === 'revoked'} onClick={() => withdrawFact(fact, 'revoked')}>Revoke saved fact</button><button type="button" className={buttonClass} disabled={!snapshot.current?.facts.some(item => item.id === fact.id) || fact.status === 'retired'} onClick={() => withdrawFact(fact, 'retired')}>Retire saved fact</button></div></div>)}
        </Section>
        <Section title="Canonical pages and required caveats">
          <Field label="Canonical page URLs (one per line)" multiline value={content.content_context.canonical_urls.join('\n')} onChange={value => edit(previous => ({ ...previous, content_context: { ...previous.content_context, canonical_urls: lines(value) } }))} />
          <Field label="Required caveats (one per line)" multiline value={content.restrictions.required_caveats.join('\n')} onChange={value => edit(previous => ({ ...previous, restrictions: { ...previous.restrictions, required_caveats: lines(value) } }))} />
        </Section>

            </div></details>
          </>}
        </fieldset>
        {step === 2 && <>
          {issues.length > 0 && <details className="rounded-xl border p-4"><summary className="cursor-pointer text-sm font-bold">What still needs attention ({issues.length})</summary><p className="mt-2 text-xs text-slate-500">Based on the saved version, not your unsaved edits.</p><ul className="mt-2 list-inside list-disc text-sm text-slate-600">{issues.map(message => <li key={message}>{message}</li>)}</ul></details>}
          <details className="rounded-xl border p-4"><summary className="cursor-pointer text-sm font-bold">Human approval</summary><div className="mt-3">
      <Section title="Human approval"><p className="text-sm text-slate-600">Save edits first, then explicitly confirm each fact you have checked. Approval does not trigger research, publication, or email.</p>{snapshot.current?.facts.filter(fact => ['proposed', 'approved'].includes(fact.status)).map(fact => <label key={fact.id} className="flex items-start gap-3 text-sm text-slate-700"><input type="checkbox" className="mt-1" disabled={!snapshot.can_approve || busy || dirty} checked={confirmed.includes(fact.id)} onChange={event => { setConfirmed(previous => event.target.checked ? [...previous, fact.id] : previous.filter(id => id !== fact.id)); setApproveChecked(false); }} />I verified the evidence and dates for: {fact.claim}</label>)}<label className="flex items-start gap-3 text-sm font-bold text-slate-700"><input type="checkbox" className="mt-1" disabled={!snapshot.can_approve || busy || dirty || !snapshot.current} checked={approveChecked} onChange={event => setApproveChecked(event.target.checked)} />I approve this saved brief and the checked facts for this brand.</label><button type="button" className={`${buttonClass} bg-slate-900 text-white`} disabled={!snapshot.can_approve || busy || dirty || !approveChecked || !snapshot.current || snapshot.current.status === 'approved'} onClick={() => save('approve')}><ShieldCheck size={16} />Approve saved brief</button>{!snapshot.can_approve && <p className="text-xs text-amber-800">Your role cannot approve this brief.</p>}</Section>

          </div></details>
        </>}
        <footer className="sticky bottom-2 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <span role="status" className="mr-auto text-xs text-slate-600">{dirty ? 'Unsaved changes' : snapshot.current ? 'Saved' : 'Not saved yet'}</span>
          <button type="button" onClick={closeSetup} disabled={busy} className={buttonClass}>Close setup</button>
          <button type="button" onClick={() => save('save')} disabled={!canEdit || (!dirty && Boolean(snapshot.current))} className={`${buttonClass} bg-emerald-700 text-white`}><Save size={14} />Save draft</button>
          {step < 2 && <button type="button" onClick={() => { setStep(value => value + 1); document.getElementById(`brief-step-${step + 1}`)?.focus(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className={buttonClass}>Next</button>}
        </footer>
      </>}
      {!editing && snapshot.versions.length > 0 && <details className="rounded-xl border p-3"><summary className="cursor-pointer text-sm text-slate-600">Version history</summary><div className="mt-3">
      <Section title="Version history">{!snapshot.versions.length && <p className="text-sm text-slate-500">No saved versions yet.</p>}{snapshot.versions.map(({ brief }) => <details key={brief.version_id} className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-bold text-slate-700">Version {brief.version} · {brief.status} · {new Date(brief.created_at).toLocaleString()}</summary><p className="mt-2 text-xs text-slate-500">Author: {brief.author_id} · Reviewer: {brief.reviewer_id || 'Not approved'}</p><pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs text-slate-600">{JSON.stringify(brief, null, 2)}</pre></details>)}</Section>
      </div></details>}
    </>}
  </div>;
}
