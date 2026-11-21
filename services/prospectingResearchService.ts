import { supabase } from '../lib/supabase';
import type { ProspectingClaim, ProspectingProspect } from '../types';

export type ResearchLocationKind = 'city' | 'county' | 'state' | 'zip';
export type ResearchRunStatus = 'queued' | 'running' | 'waiting' | 'completed' | 'partial' | 'failed' | 'cancelled';
export type ResearchCandidateStatus = 'pending' | 'approved' | 'corrected' | 'rejected' | 'imported' | 'merged';

export interface StartResearchInput {
  locationKind: ResearchLocationKind;
  locationValue: string;
  targetCount: number;
}

export interface ProspectingResearchRun {
  id: string;
  territory_id: string | null;
  location_kind: ResearchLocationKind;
  location_value: string;
  normalized_location: string;
  target_count: number;
  status: ResearchRunStatus;
  manus_task_id: string | null;
  manus_task_url: string | null;
  prompt_version: string;
  schema_version: string;
  error_message: string | null;
  attempt_count: number;
  poll_count: number;
  last_polled_at: string | null;
  next_poll_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ProspectingResearchSource {
  url: string;
  title: string | null;
  excerpt: string | null;
}

export interface ProspectingResearchCandidate {
  id: string;
  research_run_id: string;
  identity_key: string;
  company_name: string;
  normalized_company_name: string;
  website_state: string;
  official_domain: string | null;
  website_url: string | null;
  phone: string | null;
  address_line_1: string | null;
  city: string | null;
  state_code: string | null;
  postal_code: string | null;
  summary: string | null;
  sources: ProspectingResearchSource[];
  raw_candidate: Record<string, unknown>;
  review_status: ResearchCandidateStatus;
  founder_corrections: Record<string, unknown>;
  reviewed_by: string | null;
  reviewed_at: string | null;
  imported_prospect_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProspectingResearchSnapshot {
  fitScore: number | null;
  fitCategory: 'strong' | 'possible' | 'weak' | 'insufficient_evidence';
  fitScoreRubricVersion: 'spectiq-fit-v1';
  websitePresenceClass: string | null;
  phoneOnlyQuote: boolean | null;
  manualQuoteProcess: boolean | null;
  currentStack: string[];
  frictionPoint: string | null;
  opportunityHypothesis: string | null;
  draftPitch: string | null;
  evidenceStatus: 'candidate_reviewed' | 'claims_pending' | 'claims_reviewed';
  requiresFounderReview: true;
}

export interface ProspectingTerritoryMarketFactor {
  id: string;
  research_run_id: string;
  territory_id: string | null;
  title: string;
  summary: string;
  category: 'competition' | 'digital_maturity' | 'market_demand' | 'workflow' | 'regulatory' | 'other';
  source_url: string;
  source_type: string;
  source_excerpt: string | null;
  confidence: number;
  verification_decision: 'pending' | 'approved' | 'corrected' | 'rejected';
  founder_correction: string | null;
  verified_by: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProspectingResearchKpis {
  scored: number;
  strongFit: number;
  possibleFit: number;
  weakFit: number;
  insufficientEvidence: number;
  noOfficialWebsiteIdentified: number;
  phoneOnlyQuoteObserved: number;
  manualQuoteProcessObserved: number;
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function optionalScore(value: unknown): number | null {
  const score = Number(value);
  return Number.isInteger(score) && score >= 0 && score <= 100 ? score : null;
}

function optionalBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function fitCategory(value: unknown): ProspectingResearchSnapshot['fitCategory'] {
  return ['strong', 'possible', 'weak', 'insufficient_evidence'].includes(String(value))
    ? value as ProspectingResearchSnapshot['fitCategory']
    : 'insufficient_evidence';
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map(item => item.trim()).slice(0, 20)
    : [];
}

/** Advisory research fields. These never imply outreach approval or factual verification. */
export function getResearchCandidateSnapshot(candidate: ProspectingResearchCandidate): ProspectingResearchSnapshot {
  const raw = candidate.raw_candidate || {};
  return {
    fitScore: optionalScore(raw.fit_score),
    fitCategory: fitCategory(raw.fit_category),
    fitScoreRubricVersion: 'spectiq-fit-v1',
    websitePresenceClass: optionalText(raw.website_presence_class) || candidate.website_state || null,
    phoneOnlyQuote: optionalBoolean(raw.phone_only_quote),
    manualQuoteProcess: optionalBoolean(raw.manual_quote_process),
    currentStack: stringList(raw.current_stack),
    frictionPoint: optionalText(raw.friction_point),
    opportunityHypothesis: optionalText(raw.opportunity_hypothesis),
    draftPitch: optionalText(raw.draft_pitch),
    evidenceStatus: 'candidate_reviewed',
    requiresFounderReview: true,
  };
}

/**
 * Reads the durable imported snapshot, then falls back to reviewed claims where
 * possible. Draft copy stays explicitly advisory and is never an email action.
 */
export function getProspectResearchSnapshot(
  prospect: ProspectingProspect,
  claims: ProspectingClaim[] = [],
): ProspectingResearchSnapshot | null {
  const metadata = prospect.metadata && typeof prospect.metadata === 'object' ? prospect.metadata : {};
  const stored = metadata.research_snapshot && typeof metadata.research_snapshot === 'object'
    ? metadata.research_snapshot as Record<string, unknown>
    : null;
  const usableClaims = claims.filter(claim => ['approved', 'corrected'].includes(claim.verification_decision));
  const claimValue = (type: ProspectingClaim['claim_type']) => optionalText(usableClaims.find(claim => claim.claim_type === type)?.founder_correction)
    || optionalText(usableClaims.find(claim => claim.claim_type === type)?.display_value);
  if (!stored && usableClaims.length === 0) return null;
  const hasPendingClaims = claims.some(claim => claim.verification_decision === 'pending');
  return {
    fitScore: optionalScore(stored?.fit_score),
    fitCategory: fitCategory(stored?.fit_category),
    fitScoreRubricVersion: 'spectiq-fit-v1',
    websitePresenceClass: optionalText(stored?.website_presence_class) || prospect.website_state || null,
    phoneOnlyQuote: optionalBoolean(stored?.phone_only_quote),
    manualQuoteProcess: optionalBoolean(stored?.manual_quote_process),
    currentStack: stringList(stored?.current_stack).length
      ? stringList(stored?.current_stack)
      : usableClaims.filter(claim => claim.claim_type === 'services').map(claim => claim.founder_correction || claim.display_value).filter(Boolean).slice(0, 20),
    frictionPoint: optionalText(stored?.friction_point),
    opportunityHypothesis: optionalText(stored?.opportunity_hypothesis) || claimValue('opportunity'),
    draftPitch: optionalText(stored?.draft_pitch) || claimValue('outreach_angle'),
    evidenceStatus: hasPendingClaims ? 'claims_pending' : 'claims_reviewed',
    requiresFounderReview: true,
  };
}

export function getProspectingResearchKpis(candidates: ProspectingResearchCandidate[]): ProspectingResearchKpis {
  const snapshots = candidates.map(getResearchCandidateSnapshot);
  return {
    scored: snapshots.filter(item => item.fitScore !== null).length,
    strongFit: snapshots.filter(item => item.fitCategory === 'strong').length,
    possibleFit: snapshots.filter(item => item.fitCategory === 'possible').length,
    weakFit: snapshots.filter(item => item.fitCategory === 'weak').length,
    insufficientEvidence: snapshots.filter(item => item.fitCategory === 'insufficient_evidence').length,
    noOfficialWebsiteIdentified: snapshots.filter(item => item.websitePresenceClass === 'official_website_not_identified').length,
    phoneOnlyQuoteObserved: snapshots.filter(item => item.phoneOnlyQuote === true).length,
    manualQuoteProcessObserved: snapshots.filter(item => item.manualQuoteProcess === true).length,
  };
}

export interface ProspectingResearchDetail {
  run: ProspectingResearchRun;
  candidates: ProspectingResearchCandidate[];
  marketFactors: ProspectingTerritoryMarketFactor[];
}

export interface ReviewResearchCandidateInput {
  decision: 'approved' | 'corrected' | 'rejected';
  corrections?: Partial<Pick<ProspectingResearchCandidate,
    'company_name' | 'website_url' | 'phone' | 'address_line_1' | 'city' | 'state_code' | 'postal_code' | 'summary'>>;
}

export interface ImportResearchCandidateInput {
  territoryId: string;
  mode: 'create' | 'merge';
  prospectId?: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireUuid(value: string, label: string): string {
  if (!UUID_PATTERN.test(value)) throw new Error(`${label} must be a valid ID.`);
  return value;
}

function parseFunctionResponse<T>(data: unknown, fallback: string): T {
  const payload = data as { ok?: boolean; error?: string } | null;
  if (!payload || payload.ok !== true) throw new Error(payload?.error || fallback);
  return data as T;
}

export function validateResearchInput(input: StartResearchInput): StartResearchInput {
  if (!['city', 'county', 'state', 'zip'].includes(input.locationKind)) throw new Error('Choose city, county, state, or ZIP.');
  const locationValue = input.locationValue.replace(/\s+/g, ' ').trim();
  if (!locationValue || locationValue.length > 160) throw new Error('Enter a valid location.');
  if (!Number.isInteger(input.targetCount) || input.targetCount < 1 || input.targetCount > 100) throw new Error('Target count must be from 1 to 100.');
  if (input.locationKind === 'state' && !/^(?:[A-Za-z]{2}|[A-Za-z][A-Za-z .'-]{1,29})$/.test(locationValue)) throw new Error('Use a state abbreviation or full state name.');
  if (input.locationKind === 'zip' && !/^\d{5}(?:-\d{4})?$/.test(locationValue)) throw new Error('Enter a five-digit ZIP or ZIP+4.');
  return { ...input, locationValue: input.locationKind === 'state' && locationValue.length === 2 ? locationValue.toUpperCase() : locationValue };
}

export async function startProspectingResearch(input: StartResearchInput): Promise<ProspectingResearchRun> {
  const valid = validateResearchInput(input);
  const { data, error } = await supabase.functions.invoke('spectiq-prospect-research', { body: { op: 'start', ...valid } });
  if (error) throw new Error(`Could not start research: ${error.message}`);
  return parseFunctionResponse<{ run: ProspectingResearchRun }>(data, 'Could not start research.').run;
}

export async function listProspectingResearchRuns(limit = 30): Promise<ProspectingResearchRun[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const { data, error } = await supabase.from('spectiq_prospect_research_runs').select([
    'id', 'territory_id', 'location_kind', 'location_value', 'normalized_location', 'target_count', 'status',
    'manus_task_id', 'manus_task_url', 'prompt_version', 'schema_version', 'error_message', 'attempt_count',
    'poll_count', 'last_polled_at', 'next_poll_at', 'started_at', 'completed_at', 'created_by', 'created_at', 'updated_at',
  ].join(',')).order('created_at', { ascending: false }).limit(safeLimit);
  if (error) throw new Error(`Could not load research runs: ${error.message}`);
  return (data || []) as unknown as ProspectingResearchRun[];
}

export async function getProspectingResearchRun(runId: string): Promise<ProspectingResearchDetail | null> {
  const id = requireUuid(runId, 'Research run');
  const [runResult, candidateResult, factorResult] = await Promise.all([
    supabase.from('spectiq_prospect_research_runs').select('*').eq('id', id).maybeSingle(),
    supabase.from('spectiq_prospect_research_candidates').select('*').eq('research_run_id', id).order('company_name'),
    supabase.from('spectiq_territory_market_factors').select('*').eq('research_run_id', id).order('created_at'),
  ]);
  if (runResult.error) throw new Error(`Could not load research run: ${runResult.error.message}`);
  if (candidateResult.error) throw new Error(`Could not load research candidates: ${candidateResult.error.message}`);
  if (factorResult.error) throw new Error(`Could not load territory market factors: ${factorResult.error.message}`);
  if (!runResult.data) return null;
  return {
    run: runResult.data as ProspectingResearchRun,
    candidates: (candidateResult.data || []) as ProspectingResearchCandidate[],
    marketFactors: (factorResult.data || []) as ProspectingTerritoryMarketFactor[],
  };
}

export async function pollProspectingResearchRun(runId: string): Promise<ProspectingResearchDetail> {
  const { data, error } = await supabase.functions.invoke('spectiq-prospect-research', { body: { op: 'poll', runId: requireUuid(runId, 'Research run') } });
  if (error) throw new Error(`Could not refresh research: ${error.message}`);
  const payload = parseFunctionResponse<{ run: ProspectingResearchRun; candidates: ProspectingResearchCandidate[]; marketFactors?: ProspectingTerritoryMarketFactor[] }>(data, 'Could not refresh research.');
  return { run: payload.run, candidates: payload.candidates || [], marketFactors: payload.marketFactors || [] };
}

export async function reviewProspectingTerritoryMarketFactor(
  factorId: string,
  input: { decision: 'approved' | 'corrected' | 'rejected'; correction?: string },
): Promise<ProspectingTerritoryMarketFactor> {
  if (input.decision === 'corrected' && !input.correction?.trim()) throw new Error('Add a market-factor correction.');
  const { data, error } = await supabase.rpc('review_spectiq_territory_market_factor', {
    p_factor_id: requireUuid(factorId, 'Market factor'),
    p_decision: input.decision,
    p_correction: input.correction?.trim() || null,
  });
  if (error) throw new Error(`Could not review market factor: ${error.message}`);
  return (Array.isArray(data) ? data[0] : data) as ProspectingTerritoryMarketFactor;
}

export async function listProspectingTerritoryMarketFactors(
  territoryId?: string,
): Promise<ProspectingTerritoryMarketFactor[]> {
  let query = supabase.from('spectiq_territory_market_factors').select('*').order('created_at', { ascending: false });
  if (territoryId) query = query.eq('territory_id', requireUuid(territoryId, 'Territory'));
  const { data, error } = await query.limit(100);
  if (error) throw new Error(`Could not load territory market factors: ${error.message}`);
  return (data || []) as ProspectingTerritoryMarketFactor[];
}

export async function retryProspectingResearchRun(runId: string): Promise<ProspectingResearchRun> {
  const { data, error } = await supabase.functions.invoke('spectiq-prospect-research', { body: { op: 'retry', runId: requireUuid(runId, 'Research run') } });
  if (error) throw new Error(`Could not retry research: ${error.message}`);
  return parseFunctionResponse<{ run: ProspectingResearchRun }>(data, 'Could not retry research.').run;
}

export async function reviewProspectingResearchCandidate(candidateId: string, input: ReviewResearchCandidateInput): Promise<ProspectingResearchCandidate> {
  const corrections = input.decision === 'corrected' ? (input.corrections || {}) : {};
  if (!['approved', 'corrected', 'rejected'].includes(input.decision)) throw new Error('Choose a valid candidate decision.');
  if (input.decision === 'corrected' && Object.keys(corrections).length === 0) throw new Error('Add at least one correction.');
  const { data, error } = await supabase.rpc('review_spectiq_research_candidate', {
    p_candidate_id: requireUuid(candidateId, 'Candidate'), p_decision: input.decision, p_corrections: corrections,
  });
  if (error) throw new Error(`Could not review candidate: ${error.message}`);
  return (Array.isArray(data) ? data[0] : data) as ProspectingResearchCandidate;
}

export async function importProspectingResearchCandidate(
  candidateId: string,
  input: ImportResearchCandidateInput,
): Promise<{ candidate: ProspectingResearchCandidate; prospect: ProspectingProspect }> {
  const territoryId = requireUuid(input.territoryId, 'Territory');
  if (input.mode === 'merge' && !input.prospectId) throw new Error('Choose a prospect to merge into.');
  if (input.mode === 'create' && input.prospectId) throw new Error('A prospect is not allowed for a create import.');
  const { data, error } = await supabase.rpc('import_spectiq_research_candidate', {
    p_candidate_id: requireUuid(candidateId, 'Candidate'), p_territory_id: territoryId,
    p_mode: input.mode, p_prospect_id: input.prospectId ? requireUuid(input.prospectId, 'Prospect') : null,
  });
  if (error) throw new Error(`Could not import candidate: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.candidate || !row?.prospect) throw new Error('Candidate import did not return a prospect.');
  return row as { candidate: ProspectingResearchCandidate; prospect: ProspectingProspect };
}
