import { useEffect, useMemo, useState, type FC } from 'react';
import {
  Activity,
  BadgeCheck,
  Beaker,
  BookOpen,
  BrainCircuit,
  Check,
  CircleHelp,
  Clipboard,
  Copy,
  ExternalLink,
  FileText,
  GitBranch,
  Lightbulb,
  ListChecks,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
} from 'lucide-react';
import { BranchContext } from '../types';
import {
  CONTENT_INTELLIGENCE_PROJECTS,
  ContentExperiment,
  ContentIntelligenceProject,
  ContentPerformanceEvent,
  ContentPost,
  ContentTopic,
} from '../services/contentIntelligenceRegistry';
import { fetchPublishedContentCandidates, PublishedContentCandidate } from '../services/contentPublicationReconciliationService';
import {
  approveContentRegistration,
  fetchApprovedContentRegistry,
  mergeContentRecords,
} from '../services/contentRegistrationService';
import { fetchImportedContentPerformance } from '../services/contentPerformanceImportService';
import {
  fetchHubContentExperiments,
  HubContentExperiment,
} from '../services/contentExperimentRegistryService';
import ContentExperimentWorkspace from '../components/ContentExperimentWorkspace';
import {
  approveContentLearning,
  ContentLearningPromotion,
  fetchContentLearningPromotions,
  LearningConfidence,
} from '../services/contentLearningPromotionService';

type Tab = 'overview' | 'guide' | 'topics' | 'assets' | 'experiments' | 'performance' | 'learnings' | 'workflow';

interface Props {
  branchContext: BranchContext;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const TABS: Array<{ id: Tab; label: string; icon: typeof BrainCircuit }> = [
  { id: 'overview', label: 'Overview', icon: BrainCircuit },
  { id: 'guide', label: 'How It Works', icon: BookOpen },
  { id: 'topics', label: 'Topics', icon: Search },
  { id: 'assets', label: 'Assets', icon: FileText },
  { id: 'experiments', label: 'Experiments', icon: Beaker },
  { id: 'performance', label: 'Performance', icon: Activity },
  { id: 'learnings', label: 'Learnings', icon: Lightbulb },
  { id: 'workflow', label: 'New Task', icon: Plus },
];

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  published: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  running: 'bg-sky-50 text-sky-700 border-sky-200',
  reviewed: 'bg-violet-50 text-violet-700 border-violet-200',
  planned: 'bg-amber-50 text-amber-700 border-amber-200',
  scheduled: 'bg-amber-50 text-amber-700 border-amber-200',
  draft: 'bg-slate-50 text-slate-600 border-slate-200',
  archived: 'bg-slate-50 text-slate-500 border-slate-200',
  paused: 'bg-amber-50 text-amber-700 border-amber-200',
  retired: 'bg-slate-50 text-slate-500 border-slate-200',
};

function labelFromSlug(slug: string) {
  return slug.split(/[-_]/).map(word => word ? word[0].toUpperCase() + word.slice(1) : '').join(' ');
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${STATUS_STYLES[status] || STATUS_STYLES.draft}`}>{status}</span>;
}

function EmptyState({ icon: Icon, title, detail, command }: { icon: typeof BrainCircuit; title: string; detail: string; command?: string }) {
  return (
    <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <Icon className="mx-auto h-9 w-9 text-slate-300" />
      <h3 className="mt-4 text-sm font-black uppercase tracking-tight text-slate-700">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">{detail}</p>
      {command && <code className="mt-4 inline-block max-w-full overflow-x-auto rounded-xl bg-slate-900 px-4 py-2 text-left text-xs text-emerald-300">{command}</code>}
    </div>
  );
}

function MarkdownPanel({ markdown, empty }: { markdown: string; empty: string }) {
  const lines = markdown.split(/\r?\n/).filter((line, index, all) => line.trim() || (index > 0 && all[index - 1].trim()));
  if (!markdown.trim()) return <p className="text-sm text-slate-400">{empty}</p>;
  return (
    <div className="space-y-2 text-sm leading-6 text-slate-600">
      {lines.map((line, index) => {
        if (line.startsWith('# ')) return <h2 key={index} className="text-xl font-black uppercase tracking-tight text-slate-800">{line.slice(2)}</h2>;
        if (line.startsWith('## ')) return <h3 key={index} className="pt-4 text-xs font-black uppercase tracking-widest text-emerald-700">{line.slice(3)}</h3>;
        if (line.startsWith('### ')) return <h4 key={index} className="pt-3 font-black text-slate-800">{line.slice(4)}</h4>;
        if (line.startsWith('- ')) return <p key={index} className="pl-4 before:-ml-4 before:mr-2 before:text-emerald-500 before:content-['•']">{line.slice(2).replace(/\*\*/g, '')}</p>;
        if (!line.trim()) return <div key={index} className="h-1" />;
        return <p key={index}>{line.replace(/\*\*/g, '').replace(/`/g, '')}</p>;
      })}
    </div>
  );
}

function TopicTable({ topics }: { topics: ContentTopic[] }) {
  if (!topics.length) return <EmptyState icon={Search} title="No topics registered" detail="Research a project-specific audience question, then register it in this project's canonical topic inventory." command="npm run content -- register-topic --project …" />;
  return (
    <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400"><tr><th className="px-5 py-4">Topic</th><th className="px-5 py-4">Cluster</th><th className="px-5 py-4">Intent</th><th className="px-5 py-4">Source</th><th className="px-5 py-4">Status</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {topics.map(topic => <tr key={topic.topic_id} className="hover:bg-slate-50/70"><td className="px-5 py-4"><p className="font-bold text-slate-800">{topic.title}</p><code className="text-[10px] text-slate-400">{topic.topic_id}</code></td><td className="px-5 py-4 text-slate-600">{topic.cluster || '—'}</td><td className="px-5 py-4 text-slate-600">{topic.intent || '—'}</td><td className="px-5 py-4 text-slate-600">{topic.source || '—'}</td><td className="px-5 py-4"><StatusBadge status={topic.status} /></td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AssetTable({ posts, topics }: { posts: ContentPost[]; topics: ContentTopic[] }) {
  const topicNames = new Map(topics.map(topic => [topic.topic_id, topic.title]));
  if (!posts.length) return <EmptyState icon={FileText} title="No assets registered" detail="Drafts stay task-local. Register an asset here only after it has a stable content identity; published assets require a real canonical URL and publication time." command="npm run content -- register-post --project …" />;
  return (
    <div className="grid gap-4">
      {posts.map(post => <article key={post.post_id} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{post.platform}</p><h3 className="mt-1 font-black text-slate-800">{post.title || topicNames.get(post.topic_id) || post.post_id}</h3><code className="text-[10px] text-slate-400">{post.post_id}</code></div><StatusBadge status={post.status} /></div><div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-500"><span>Topic: <strong className="text-slate-700">{topicNames.get(post.topic_id) || post.topic_id}</strong></span>{post.published_at && <span>Published: <strong className="text-slate-700">{new Date(post.published_at).toLocaleDateString()}</strong></span>}{post.task_id && <span>Task: <code>{post.task_id}</code></span>}</div>{post.canonical_url && <a href={post.canonical_url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-900">Open canonical asset <ExternalLink size={13} /></a>}</article>)}
    </div>
  );
}

const CandidateRegistrationCard: FC<{
  candidate: PublishedContentCandidate;
  topics: ContentTopic[];
  addToast: Props['addToast'];
  onApproved: (post: ContentPost, topic: ContentTopic) => void;
}> = ({ candidate, topics, addToast, onApproved }) => {
  const [topicChoice, setTopicChoice] = useState(topics.length ? '' : '__new');
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [newTopicId, setNewTopicId] = useState('');
  const [postId, setPostId] = useState(candidate.suggestedPostId);
  const [canonicalUrl, setCanonicalUrl] = useState('');
  const [taskId, setTaskId] = useState('');
  const [approving, setApproving] = useState(false);
  const firstLine = candidate.caption.split(/\r?\n/).find(line => line.trim())?.trim() || '';
  const title = firstLine.slice(0, 100);
  const selectedTopic = topics.find(topic => topic.topic_id === topicChoice);
  const topicId = topicChoice === '__new' ? newTopicId : topicChoice;
  const topicTitle = topicChoice === '__new' ? newTopicTitle : selectedTopic?.title || '';
  const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;
  const command = `npm run content -- register-post --project ${candidate.projectId} --post-id ${postId || 'required_post_id'} --topic-id ${topicId || 'required_topic_id'} --platform ${candidate.platform} --status published --canonical-url ${quote(canonicalUrl || 'Required canonical URL')} --published-at ${quote(candidate.publishedAt)}${taskId ? ` --task-id ${taskId}` : ''}${title ? ` --title ${quote(title)}` : ''} --source-record-id ${candidate.sourceRecordId}${candidate.externalPostId ? ` --external-post-id ${quote(candidate.externalPostId)}` : ''}`;
  const ready = Boolean(topicId && topicTitle && postId && canonicalUrl);

  const updateNewTopicTitle = (value: string) => {
    setNewTopicTitle(value);
    setNewTopicId(`topic_${value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 72)}`);
  };

  const approve = async () => {
    if (!ready) {
      addToast('Choose or create a topic, then enter the real canonical URL.', 'error');
      return;
    }
    setApproving(true);
    try {
      const post = await approveContentRegistration({ candidate, topicId, topicTitle, postId, canonicalUrl, taskId, title });
      const topic: ContentTopic = selectedTopic || {
        project_id: candidate.projectId,
        topic_id: topicId,
        title: topicTitle,
        cluster: '',
        intent: '',
        source: 'publication_review',
        status: 'active',
        notes: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      onApproved(post, topic);
      addToast('Publication approved and registered.', 'success');
    } catch (caught) {
      addToast(caught instanceof Error ? caught.message : 'Could not approve this publication.', 'error');
    } finally {
      setApproving(false);
    }
  };

  const copyCommand = async () => {
    if (!ready) {
      addToast('Choose a topic and enter the real canonical URL first.', 'error');
      return;
    }
    try {
      await navigator.clipboard.writeText(command);
      addToast('Post registration command copied.', 'success');
    } catch {
      addToast('Could not copy the registration command.', 'error');
    }
  };

  return (
    <article className="rounded-[2rem] border border-amber-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-amber-700">Needs registration</span><span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{candidate.platform} · {candidate.mediaType}</span></div><p className="mt-3 line-clamp-3 text-sm font-bold leading-6 text-slate-800">{candidate.caption || 'Published post with no caption'}</p><div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-400"><span>{new Date(candidate.publishedAt).toLocaleString()}</span><span>Source: {candidate.source}</span>{candidate.externalPostId && <span>External ID: <code>{candidate.externalPostId}</code></span>}</div></div>{candidate.mediaUrls[0] && <img src={candidate.mediaUrls[0]} alt="Published creative" className="h-24 w-24 rounded-2xl border border-slate-200 object-cover" />}</div>
      {candidate.insight && <div className="mt-4 flex flex-wrap gap-2">{Object.entries({ impressions: candidate.insight.impressions, reach: candidate.insight.reach, likes: candidate.insight.likes, comments: candidate.insight.comments, saves: candidate.insight.saves, shares: candidate.insight.shares }).filter(([, value]) => value !== null).map(([metric, value]) => <span key={metric} className="rounded-lg bg-slate-100 px-2.5 py-1 text-[10px] text-slate-500"><strong className="text-slate-800">{value}</strong> {metric}</span>)}</div>}
      <div className="mt-5 grid gap-3 md:grid-cols-2"><label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Topic<select value={topicChoice} onChange={event => setTopicChoice(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-slate-700 outline-none focus:border-emerald-500"><option value="">Choose canonical topic…</option>{topics.map(topic => <option key={topic.topic_id} value={topic.topic_id}>{topic.title} · {topic.topic_id}</option>)}<option value="__new">+ Create a new topic…</option></select></label><label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Canonical URL<input value={canonicalUrl} onChange={event => setCanonicalUrl(event.target.value)} placeholder="Paste the real public post URL" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium normal-case tracking-normal text-slate-700 outline-none focus:border-emerald-500" /></label>{topicChoice === '__new' && <><label className="text-[10px] font-black uppercase tracking-wider text-slate-500">New audience question or topic<input value={newTopicTitle} onChange={event => updateNewTopicTitle(event.target.value)} placeholder="What question does this asset answer?" className="mt-1.5 w-full rounded-xl border border-sky-200 bg-sky-50/40 px-3 py-2 text-sm font-medium normal-case tracking-normal text-slate-700 outline-none focus:border-sky-500" /></label><label className="text-[10px] font-black uppercase tracking-wider text-slate-500">New topic ID<input value={newTopicId} onChange={event => setNewTopicId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-sky-200 bg-sky-50/40 px-3 py-2 text-sm font-medium normal-case tracking-normal text-slate-700 outline-none focus:border-sky-500" /></label></>}<label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Post ID<input value={postId} onChange={event => setPostId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium normal-case tracking-normal text-slate-700 outline-none focus:border-emerald-500" /></label><label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Task ID (optional)<input value={taskId} onChange={event => setTaskId(event.target.value)} placeholder="content_project_topic_001" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium normal-case tracking-normal text-slate-700 outline-none focus:border-emerald-500" /></label></div>
      <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={approve} disabled={!ready || approving} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition ${ready && !approving ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-slate-100 text-slate-400'}`}><Check size={14} /> {approving ? 'Approving…' : 'Approve & register'}</button><button type="button" onClick={copyCommand} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-50"><Copy size={14} /> Copy CLI fallback</button></div>
    </article>
  );
};

function PublishedCandidateReview({
  projectId,
  posts,
  topics,
  addToast,
  onApproved,
}: {
  projectId: string;
  posts: ContentPost[];
  topics: ContentTopic[];
  addToast: Props['addToast'];
  onApproved: (post: ContentPost, topic: ContentTopic) => void;
}) {
  const [candidates, setCandidates] = useState<PublishedContentCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setCandidates(await fetchPublishedContentCandidates(projectId, posts));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Could not load published candidates.';
      setError(message);
      addToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [projectId, posts]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApproved = (post: ContentPost, topic: ContentTopic) => {
    setCandidates(current => current.filter(candidate => candidate.sourceRecordId !== post.source_record_id));
    onApproved(post, topic);
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-widest text-amber-600">Publication reconciliation</p><h2 className="mt-1 text-lg font-black text-slate-800">Published assets awaiting canonical registration</h2><p className="mt-1 text-sm text-slate-500">Read from the authenticated Post Scheduler history and matched by source/external identity. Nothing is registered without review.</p></div><button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh</button></div>
      {loading ? <div className="rounded-[2rem] border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">Checking published posts…</div> : error ? <div className="rounded-[2rem] border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">{error}</div> : candidates.length === 0 ? <div className="rounded-[2rem] border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800"><strong>Publication queue reconciled.</strong> No unregistered published assets were found for this project.</div> : <div className="grid gap-4">{candidates.map(candidate => <CandidateRegistrationCard key={candidate.sourceRecordId} candidate={candidate} topics={topics} addToast={addToast} onApproved={handleApproved} />)}</div>}
    </section>
  );
}

function PerformanceList({ events }: { events: ContentPerformanceEvent[] }) {
  if (!events.length) return <EmptyState icon={Activity} title="No performance history" detail="Append snapshots rather than replacing them. Each event preserves the metric date, capture time, source, post, and experiment provenance." command="npm run content -- append-performance --project …" />;
  return <div className="space-y-3">{[...events].sort((a, b) => b.metric_date.localeCompare(a.metric_date)).map(event => <article key={event.event_id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black text-slate-800">{event.post_id}</p><code className="text-[10px] text-slate-400">{event.event_id}</code></div><div className="text-right"><p className="text-xs font-bold text-slate-700">{event.metric_date}</p><p className="text-[10px] uppercase tracking-wider text-slate-400">{event.platform} · {event.source.replace('_', ' ')}</p></div></div><div className="mt-4 flex flex-wrap gap-2">{Object.entries(event.metrics).map(([metric, value]) => <span key={metric} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs"><strong className="text-slate-800">{String(value)}</strong> <span className="text-slate-400">{metric}</span></span>)}</div></article>)}</div>;
}

function PerformanceRegistry({ events, importedCount, loading, error, onRefresh }: { events: ContentPerformanceEvent[]; importedCount: number; loading: boolean; error: string | null; onRefresh: () => void }) {
  return <div className="space-y-5"><section className="flex flex-wrap items-center justify-between gap-4 rounded-[2rem] border border-sky-200 bg-sky-50 p-5"><div><p className="text-[10px] font-black uppercase tracking-widest text-sky-700">Automated platform history</p><h2 className="mt-1 font-black text-sky-950">{loading ? 'Loading scheduled snapshots…' : `${importedCount} API snapshot${importedCount === 1 ? '' : 's'} imported`}</h2><p className="mt-1 text-xs leading-5 text-sky-800">Approved Scheduler assets inherit every collected insight observation. Source rows remain append-only and authoritative.</p></div><button type="button" onClick={onRefresh} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-white px-3 py-2 text-xs font-bold text-sky-700 hover:bg-sky-100 disabled:opacity-50"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh snapshots</button></section>{error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}<PerformanceList events={events} /></div>;
}

function LearningPromotionWorkspace({ project, posts, performance, approved, loading, addToast, onApproved }: { project: ContentIntelligenceProject; posts: ContentPost[]; performance: ContentPerformanceEvent[]; approved: ContentLearningPromotion[]; loading: boolean; addToast: Props['addToast']; onApproved: (learning: ContentLearningPromotion) => void }) {
  const [hubLearningExperiments, setHubLearningExperiments] = useState<HubContentExperiment[]>([]);
  const eligibleExperiments = mergeContentRecords(project.experiments, hubLearningExperiments, 'experiment_id').filter(experiment => experiment.status === 'reviewed' && posts.some(post => post.post_id === experiment.post_id && post.source_record_id));
  const [experimentId, setExperimentId] = useState(eligibleExperiments[0]?.experiment_id || '');
  const [learningId, setLearningId] = useState(`learning_${project.projectId}_`);
  const [finding, setFinding] = useState('');
  const [confidence, setConfidence] = useState<LearningConfidence>('medium');
  const [conditions, setConditions] = useState('');
  const [application, setApplication] = useState('');
  const [selectedEvidence, setSelectedEvidence] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const experiment = eligibleExperiments.find(item => item.experiment_id === experimentId);
  const evidence = performance.filter(event => event.experiment_id === experimentId || (!!experiment?.post_id && event.post_id === experiment.post_id));

  useEffect(() => {
    let current = true;
    fetchHubContentExperiments(project.projectId)
      .then(items => { if (current) setHubLearningExperiments(items); })
      .catch(caught => { if (current) addToast(caught instanceof Error ? caught.message : 'Could not load reviewed Hub experiments.', 'error'); });
    return () => { current = false; };
  }, [project.projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setExperimentId(eligibleExperiments[0]?.experiment_id || '');
    setLearningId(`learning_${project.projectId}_`);
    setFinding('');
    setConfidence('medium');
    setConditions('');
    setApplication('');
    setSelectedEvidence([]);
  }, [project.projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!experimentId && eligibleExperiments[0]) setExperimentId(eligibleExperiments[0].experiment_id);
  }, [eligibleExperiments, experimentId]);

  const toggleEvidence = (eventId: string) => setSelectedEvidence(current => current.includes(eventId) ? current.filter(id => id !== eventId) : [...current, eventId]);
  const submit = async () => {
    if (!experiment) return addToast('Choose a reviewed experiment linked to an approved asset.', 'error');
    setSaving(true);
    try {
      const learning = await approveContentLearning({ projectId: project.projectId, learningId, experimentId: experiment.experiment_id, postId: experiment.post_id, evidenceEventIds: selectedEvidence, finding, confidence, conditions, application });
      onApproved(learning);
      setLearningId(`learning_${project.projectId}_`);
      setFinding('');
      setConditions('');
      setApplication('');
      setSelectedEvidence([]);
      addToast('Durable learning approved and saved.', 'success');
    } catch (caught) {
      addToast(caught instanceof Error ? caught.message : 'Could not approve the learning.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100';
  return <div className="space-y-6"><section className="rounded-[2rem] border border-emerald-200 bg-emerald-50 p-6"><div className="flex items-start gap-3"><BadgeCheck className="mt-0.5 text-emerald-700" size={22} /><div><p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Human approval gate</p><h2 className="mt-1 font-black text-emerald-950">Promote evidence, not impressions</h2><p className="mt-2 text-sm leading-6 text-emerald-900">Only reviewed experiments tied to approved Scheduler assets qualify. Every durable learning must cite at least one immutable performance event.</p></div></div></section>{approved.length > 0 && <section className="grid gap-4 lg:grid-cols-2">{approved.map(learning => <article key={learning.id} className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2"><code className="text-[10px] text-slate-400">{learning.learning_id}</code><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase text-emerald-700">{learning.confidence} confidence</span></div><p className="mt-4 text-sm font-bold leading-6 text-slate-800">{learning.finding}</p><p className="mt-3 text-xs leading-5 text-slate-500"><strong>Use when:</strong> {learning.conditions}</p><p className="mt-2 text-xs leading-5 text-slate-500"><strong>Next action:</strong> {learning.application}</p><div className="mt-4 flex flex-wrap gap-2">{learning.evidence_event_ids.map(id => <code key={id} className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] text-slate-500">{id}</code>)}</div></article>)}</section>}<section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm"><div><p className="text-[10px] font-black uppercase tracking-widest text-violet-600">Approval form</p><h2 className="mt-1 text-lg font-black text-slate-900">Create a durable learning</h2></div>{loading ? <p className="mt-5 text-sm text-slate-500">Loading approved learnings…</p> : eligibleExperiments.length === 0 ? <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm leading-6 text-slate-600">No eligible experiment yet. Review an experiment that references an approved Scheduler asset, then return here with its performance evidence.</div> : <div className="mt-5 grid gap-4 lg:grid-cols-2"><label className="text-xs font-bold text-slate-600">Reviewed experiment<select className={inputClass} value={experimentId} onChange={event => { setExperimentId(event.target.value); setSelectedEvidence([]); }}>{eligibleExperiments.map(item => <option key={item.experiment_id} value={item.experiment_id}>{item.experiment_id}</option>)}</select></label><label className="text-xs font-bold text-slate-600">Learning ID<input className={inputClass} value={learningId} onChange={event => setLearningId(event.target.value)} /></label><label className="text-xs font-bold text-slate-600 lg:col-span-2">Bounded finding<textarea className={`${inputClass} min-h-24`} value={finding} onChange={event => setFinding(event.target.value)} placeholder="What did the evidence support—and no more than that?" /></label><label className="text-xs font-bold text-slate-600">Confidence<select className={inputClass} value={confidence} onChange={event => setConfidence(event.target.value as LearningConfidence)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label><label className="text-xs font-bold text-slate-600">Conditions<input className={inputClass} value={conditions} onChange={event => setConditions(event.target.value)} placeholder="Audience, platform, timing, limitations" /></label><label className="text-xs font-bold text-slate-600 lg:col-span-2">How to apply or retest<textarea className={`${inputClass} min-h-20`} value={application} onChange={event => setApplication(event.target.value)} /></label><fieldset className="lg:col-span-2"><legend className="text-xs font-bold text-slate-600">Evidence events</legend><div className="mt-2 grid max-h-52 gap-2 overflow-y-auto rounded-2xl border border-slate-200 p-3">{evidence.length === 0 ? <p className="text-xs text-amber-700">No performance events are linked to this experiment or post yet.</p> : evidence.map(event => <label key={event.event_id} className="flex cursor-pointer items-start gap-3 rounded-xl bg-slate-50 p-3"><input type="checkbox" checked={selectedEvidence.includes(event.event_id)} onChange={() => toggleEvidence(event.event_id)} className="mt-0.5" /><span><code className="text-[10px] text-slate-700">{event.event_id}</code><span className="mt-1 block text-[10px] text-slate-400">{event.platform} · {event.metric_date}</span></span></label>)}</div></fieldset><div className="lg:col-span-2"><button type="button" onClick={submit} disabled={saving || evidence.length === 0} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"><BadgeCheck size={15} /> {saving ? 'Approving…' : 'Approve durable learning'}</button></div></div>}</section></div>;
}

function UsageGuide({ projectId }: { projectId: string }) {
  const steps = [
    { title: 'Choose the project', detail: 'Start inside the branch whose audience and strategy own the work. Never use another branch as a shortcut.' },
    { title: 'Register the question', detail: 'Create or reuse one stable topic ID for the audience question. Similar questions in different projects stay separate.' },
    { title: 'Create the task', detail: 'Use New Task to define the audience, platform, measurable hypothesis, and success metrics before drafting.' },
    { title: 'Research and draft', detail: 'Keep evidence, variants, and abandoned directions in the branch-local task folder. Follow the project strategy and channel rules.' },
    { title: 'Publish and register', detail: 'Publish through the external channel, then register the real asset with its stable post ID, canonical URL, publication time, task, and branch.' },
    { title: 'Measure and review', detail: 'Append metric snapshots at the declared windows. Compare the observed result with the original hypothesis and record confounders.' },
    { title: 'Promote the lesson', detail: 'Move only durable, evidence-backed findings into this project’s learnings. A retrospective alone is not canonical guidance.' },
  ];
  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-emerald-200 bg-emerald-50 p-6 lg:p-8">
        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">The operating rule</p>
        <h2 className="mt-2 text-2xl font-black uppercase tracking-tight text-emerald-950">Shared workflow. Separate intelligence.</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-emerald-900">Every branch uses the same lifecycle and record shapes, but topics, strategy, experiments, performance, and learnings remain inside that branch’s project partition. The selected project is <strong>{projectId}</strong>.</p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm"><p className="text-[10px] font-black uppercase tracking-widest text-sky-600">Working material</p><h3 className="mt-2 font-black text-slate-800">Task-local files</h3><p className="mt-2 text-sm leading-6 text-slate-500">PRD, research, drafts, results, and retrospective live under <code>.trellis/tasks/&lt;task-id&gt;</code>. They can change on a branch and may include ideas that never ship.</p></article>
        <article className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm"><p className="text-[10px] font-black uppercase tracking-widest text-violet-600">Durable truth</p><h3 className="mt-2 font-black text-slate-800">Canonical project knowledge</h3><p className="mt-2 text-sm leading-6 text-slate-500">Stable topics, real assets, experiments, and metric history live under <code>.trellis/knowledge/projects/{projectId}</code>. Reviewed guidance lives in the matching project spec.</p></article>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm lg:p-8"><div className="flex items-center gap-3"><div className="rounded-xl bg-slate-900 p-2 text-white"><ListChecks size={18} /></div><div><h2 className="font-black text-slate-800">The seven-step loop</h2><p className="text-xs text-slate-400">Follow it in order so results can be compared with what you originally expected.</p></div></div><div className="mt-6 grid gap-3">{steps.map((step, index) => <div key={step.title} className="flex gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-black text-white">{index + 1}</span><div><h3 className="text-sm font-black text-slate-800">{step.title}</h3><p className="mt-1 text-sm leading-5 text-slate-500">{step.detail}</p></div></div>)}</div></section>

      <section className="grid gap-6 xl:grid-cols-2"><article className="rounded-[2rem] bg-slate-900 p-6 text-white shadow-xl"><p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Before merging canonical changes</p><div className="mt-4 space-y-3 text-sm text-slate-300">{['Every record has the selected project_id.', 'Published posts have a real URL and publication time.', 'Performance events are appended, not overwritten.', 'Evidence IDs support every promoted learning.', 'Unrelated records from parallel branches were preserved.'].map(item => <p key={item} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-emerald-400" />{item}</p>)}</div><code className="mt-6 block rounded-xl bg-black/30 px-4 py-3 text-xs text-emerald-300">npm run content -- validate</code></article><article className="rounded-[2rem] border border-amber-200 bg-amber-50 p-6"><p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Still reviewed by a person</p><h3 className="mt-2 font-black text-amber-950">Approval is one click after the facts are confirmed</h3><p className="mt-3 text-sm leading-6 text-amber-900">The Assets tab detects successful publications and writes the approved topic and post atomically to the Hub. A reviewer still supplies the audience question and real public URL. Scheduled analytics imports and guided learning promotion remain the next integration phase.</p></article></section>
    </div>
  );
}

function TaskCommandBuilder({ project, addToast }: { project: ContentIntelligenceProject; addToast: Props['addToast'] }) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const [taskId, setTaskId] = useState(`content_${project.projectId}_${date}_001`);
  const [audience, setAudience] = useState('');
  const [topic, setTopic] = useState('');
  const [platform, setPlatform] = useState('instagram');
  const [hypothesis, setHypothesis] = useState('');
  const [metrics, setMetrics] = useState('impressions,saves,clicks');

  useEffect(() => setTaskId(`content_${project.projectId}_${date}_001`), [project.projectId, date]);

  const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;
  const command = `npm run content -- create-task --project ${project.projectId} --task ${taskId || 'required_task_id'} --audience ${quote(audience || 'Required audience')} --topic ${quote(topic || 'Required audience question')} --platform ${platform || 'required_platform'} --hypothesis ${quote(hypothesis || 'Required measurable hypothesis')} --success-metrics ${metrics || 'required_metric'}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      addToast('Task command copied.', 'success');
    } catch {
      addToast('Could not copy the task command.', 'error');
    }
  };

  const inputClass = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100';
  return <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]"><section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-3"><div className="rounded-xl bg-emerald-100 p-2 text-emerald-700"><ListChecks size={18} /></div><div><h2 className="font-black text-slate-800">Create a branch-local task</h2><p className="text-xs text-slate-400">Required ownership and hypothesis fields are built into the command.</p></div></div><div className="mt-6 grid gap-4 md:grid-cols-2"><label className="text-xs font-bold text-slate-600">Task ID<input value={taskId} onChange={event => setTaskId(event.target.value)} className={inputClass} /></label><label className="text-xs font-bold text-slate-600">Platform<input value={platform} onChange={event => setPlatform(event.target.value)} className={inputClass} /></label><label className="text-xs font-bold text-slate-600 md:col-span-2">Target audience<input value={audience} onChange={event => setAudience(event.target.value)} placeholder="Who is this specifically for?" className={inputClass} /></label><label className="text-xs font-bold text-slate-600 md:col-span-2">Topic or question<input value={topic} onChange={event => setTopic(event.target.value)} placeholder="What real question will the asset answer?" className={inputClass} /></label><label className="text-xs font-bold text-slate-600 md:col-span-2">Hypothesis<textarea value={hypothesis} onChange={event => setHypothesis(event.target.value)} placeholder="What should change, compared with what, and why?" className={`${inputClass} min-h-24`} /></label><label className="text-xs font-bold text-slate-600 md:col-span-2">Success metrics<input value={metrics} onChange={event => setMetrics(event.target.value)} className={inputClass} /></label></div></section><aside className="rounded-[2rem] bg-slate-900 p-6 text-white shadow-xl"><p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Copy-ready PowerShell command</p><code className="mt-4 block break-words text-xs leading-6 text-slate-200">{command}</code><button type="button" onClick={copy} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white transition hover:bg-emerald-400"><Clipboard size={15} /> Copy command</button><p className="mt-5 text-xs leading-5 text-slate-400">Run this from the repository. The validated helper creates the task files; the browser cannot write into Git working trees.</p></aside></div>;
}

export default function ContentIntelligence({ branchContext, addToast }: Props) {
  const configured = CONTENT_INTELLIGENCE_PROJECTS;
  const initialProject = configured.find(project => branchContext.activeBranchSlugs.includes(project.projectId)) || configured[0];
  const [projectId, setProjectId] = useState(initialProject?.projectId || '');
  const [tab, setTab] = useState<Tab>('overview');
  const [approvedPosts, setApprovedPosts] = useState<ContentPost[]>([]);
  const [approvedTopics, setApprovedTopics] = useState<ContentTopic[]>([]);
  const [importedPerformance, setImportedPerformance] = useState<ContentPerformanceEvent[]>([]);
  const [performanceLoading, setPerformanceLoading] = useState(false);
  const [performanceError, setPerformanceError] = useState<string | null>(null);
  const [performanceRefresh, setPerformanceRefresh] = useState(0);
  const [approvedLearnings, setApprovedLearnings] = useState<ContentLearningPromotion[]>([]);
  const [learningsLoading, setLearningsLoading] = useState(false);
  const [hubExperiments, setHubExperiments] = useState<HubContentExperiment[]>([]);
  const project = configured.find(item => item.projectId === projectId) || configured[0];

  useEffect(() => {
    let current = true;
    setApprovedPosts([]);
    setApprovedTopics([]);
    if (!projectId) return () => { current = false; };
    fetchApprovedContentRegistry(projectId)
      .then(registry => {
        if (!current) return;
        setApprovedPosts(registry.posts);
        setApprovedTopics(registry.topics);
      })
      .catch(caught => {
        if (current) addToast(caught instanceof Error ? caught.message : 'Could not load the approved content registry.', 'error');
      });
    return () => { current = false; };
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const posts = useMemo(
    () => mergeContentRecords(project?.posts || [], approvedPosts, 'post_id'),
    [project, approvedPosts],
  );
  const topics = useMemo(
    () => mergeContentRecords(project?.topics || [], approvedTopics, 'topic_id'),
    [project, approvedTopics],
  );
  const experiments = useMemo(
    () => mergeContentRecords(project?.experiments || [], hubExperiments, 'experiment_id'),
    [project, hubExperiments],
  );
  const projectImportedPerformance = useMemo(
    () => importedPerformance.filter(event => event.project_id === projectId),
    [importedPerformance, projectId],
  );
  const performance = useMemo(
    () => mergeContentRecords(project?.performance || [], projectImportedPerformance, 'event_id'),
    [project, projectImportedPerformance],
  );

  useEffect(() => {
    let current = true;
    setPerformanceLoading(true);
    setPerformanceError(null);
    setImportedPerformance([]);
    fetchImportedContentPerformance(posts, experiments)
      .then(events => { if (current) setImportedPerformance(events); })
      .catch(caught => {
        if (!current) return;
        setImportedPerformance([]);
        setPerformanceError(caught instanceof Error ? caught.message : 'Could not import platform snapshots.');
      })
      .finally(() => { if (current) setPerformanceLoading(false); });
    return () => { current = false; };
  }, [projectId, posts, experiments, performanceRefresh]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let current = true;
    setHubExperiments([]);
    if (!projectId) return () => { current = false; };
    fetchHubContentExperiments(projectId)
      .then(items => { if (current) setHubExperiments(items); })
      .catch(caught => { if (current) addToast(caught instanceof Error ? caught.message : 'Could not load Hub experiments.', 'error'); });
    return () => { current = false; };
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let current = true;
    setLearningsLoading(true);
    setApprovedLearnings([]);
    if (!projectId) return () => { current = false; };
    fetchContentLearningPromotions(projectId)
      .then(learnings => { if (current) setApprovedLearnings(learnings); })
      .catch(caught => { if (current) addToast(caught instanceof Error ? caught.message : 'Could not load approved learnings.', 'error'); })
      .finally(() => { if (current) setLearningsLoading(false); });
    return () => { current = false; };
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApproved = (post: ContentPost, topic: ContentTopic) => {
    setApprovedPosts(current => mergeContentRecords(current, [post], 'post_id'));
    setApprovedTopics(current => mergeContentRecords(current, [topic], 'topic_id'));
  };

  const branchLabels = useMemo(() => new Map(branchContext.allBranches.map(branch => [branch.slug, branch.name])), [branchContext.allBranches]);
  const missingPartitions = branchContext.allBranches.filter(branch => !configured.some(projectItem => projectItem.projectId === branch.slug));
  const projectName = project ? branchLabels.get(project.projectId) || labelFromSlug(project.projectId) : 'Content Intelligence';
  const publishedCount = posts.filter(post => post.status === 'published').length;
  const runningCount = experiments.filter(experiment => experiment.status === 'running').length;

  if (!project) return <div className="p-6 lg:p-10"><EmptyState icon={BrainCircuit} title="No content partitions configured" detail="Add a project strategy and knowledge partition under .trellis, then rebuild the app." /></div>;

  return (
    <div className="space-y-6 p-5 lg:p-10">
      <header className="rounded-[2rem] bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 p-6 text-white shadow-xl lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5"><div className="flex items-start gap-4"><div className="rounded-2xl bg-emerald-400/15 p-3 text-emerald-300 ring-1 ring-emerald-300/20"><BrainCircuit size={28} /></div><div><p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-300">Closed-loop project memory</p><h1 className="mt-1 text-2xl font-black uppercase tracking-tight lg:text-3xl">Content Intelligence</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">One shared experimentation workflow. Separate strategy, evidence, and durable learnings for every branch.</p></div></div><label className="min-w-52 text-[10px] font-black uppercase tracking-widest text-slate-400">Project<select value={project.projectId} onChange={event => { setProjectId(event.target.value); setTab('overview'); }} className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-3 py-2.5 text-sm font-bold normal-case tracking-normal text-white outline-none"><option className="text-slate-900" value={project.projectId}>{projectName}</option>{configured.filter(item => item.projectId !== project.projectId).map(item => <option className="text-slate-900" key={item.projectId} value={item.projectId}>{branchLabels.get(item.projectId) || labelFromSlug(item.projectId)}</option>)}</select></label></div>
        <div className="mt-7 flex flex-wrap gap-2">{TABS.map(item => <button type="button" key={item.id} onClick={() => setTab(item.id)} className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition ${tab === item.id ? 'bg-white text-slate-900 shadow' : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'}`}><item.icon size={14} />{item.label}</button>)}</div>
      </header>

      {project.loadErrors.length > 0 && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"><strong>Some canonical records could not be loaded.</strong>{project.loadErrors.map(error => <p key={error} className="mt-1 text-xs">{error}</p>)}</div>}

      {tab === 'overview' && <div className="space-y-6"><section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
        { label: 'Canonical topics', value: topics.length, icon: Search, color: 'text-sky-600 bg-sky-50' },
        { label: 'Published assets', value: publishedCount, icon: FileText, color: 'text-emerald-600 bg-emerald-50' },
        { label: 'Running experiments', value: runningCount, icon: Beaker, color: 'text-violet-600 bg-violet-50' },
        { label: 'Metric snapshots', value: performance.length, icon: Activity, color: 'text-amber-600 bg-amber-50' },
      ].map(item => <article key={item.label} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm"><div className={`inline-flex rounded-xl p-2.5 ${item.color}`}><item.icon size={19} /></div><p className="mt-5 text-3xl font-black text-slate-800">{item.value}</p><p className="mt-1 text-[10px] font-black uppercase tracking-widest text-slate-400">{item.label}</p></article>)}</section><div className="grid gap-6 xl:grid-cols-2"><section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm"><MarkdownPanel markdown={project.topicClusters} empty="No topic landscape documented." /></section><section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm"><MarkdownPanel markdown={project.openQuestions} empty="No open questions documented." /></section></div>{missingPartitions.length > 0 && <section className="rounded-[2rem] border border-amber-200 bg-amber-50 p-6"><div className="flex items-start gap-3"><GitBranch className="mt-0.5 text-amber-600" size={20} /><div><h2 className="font-black text-amber-950">Branches awaiting a content partition</h2><p className="mt-1 text-sm text-amber-800">The framework supports them; each needs its own strategy and empty canonical knowledge files before tracking begins.</p><div className="mt-4 grid gap-2">{missingPartitions.map(branch => <code key={branch.slug} className="overflow-x-auto rounded-xl bg-white/70 px-3 py-2 text-xs text-amber-900">npm run content -- create-project --project {branch.slug} --name '{branch.name.replace(/'/g, "''")}'</code>)}</div></div></div></section>}</div>}
      {tab === 'guide' && <UsageGuide projectId={project.projectId} />}
      {tab === 'topics' && <TopicTable topics={topics} />}
      {tab === 'assets' && <div className="space-y-8"><PublishedCandidateReview projectId={project.projectId} posts={posts} topics={topics} addToast={addToast} onApproved={handleApproved} /><section><div className="mb-4"><p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Canonical registry</p><h2 className="mt-1 text-lg font-black text-slate-800">Registered assets</h2></div><AssetTable posts={posts} topics={topics} /></section></div>}
      {tab === 'experiments' && <ContentExperimentWorkspace projectId={project.projectId} experiments={experiments} hubExperiments={hubExperiments} posts={posts} addToast={addToast} onRegistered={experiment => setHubExperiments(current => mergeContentRecords(current, [experiment], 'experiment_id'))} onReviewed={experiment => setHubExperiments(current => mergeContentRecords(current, [experiment], 'experiment_id'))} />}
      {tab === 'performance' && <PerformanceRegistry events={performance} importedCount={projectImportedPerformance.length} loading={performanceLoading} error={performanceError} onRefresh={() => setPerformanceRefresh(value => value + 1)} />}
      {tab === 'learnings' && <div className="space-y-6"><LearningPromotionWorkspace project={project} posts={posts} performance={performance} approved={approvedLearnings} loading={learningsLoading} addToast={addToast} onApproved={learning => setApprovedLearnings(current => [learning, ...current])} /><div className="grid gap-6 xl:grid-cols-2"><section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm"><div className="mb-5 flex items-center gap-2 text-emerald-700"><Lightbulb size={18} /><span className="text-[10px] font-black uppercase tracking-widest">Versioned learnings</span></div><MarkdownPanel markdown={project.contentLearnings} empty="No durable learnings exported to the repository." /></section><div className="space-y-6"><section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm"><div className="mb-5 flex items-center gap-2 text-sky-700"><BookOpen size={18} /><span className="text-[10px] font-black uppercase tracking-widest">Project strategy</span></div><MarkdownPanel markdown={project.contentStrategy} empty="No content strategy found." /></section><section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm"><div className="mb-5 flex items-center gap-2 text-violet-700"><Sparkles size={18} /><span className="text-[10px] font-black uppercase tracking-widest">SEO and social rules</span></div><MarkdownPanel markdown={project.seoSocialRules} empty="No channel rules found." /></section></div></div></div>}
      {tab === 'workflow' && <TaskCommandBuilder project={project} addToast={addToast} />}

      <footer className="flex flex-wrap items-center justify-between gap-3 px-2 text-xs text-slate-400"><span className="inline-flex items-center gap-1.5"><Check size={13} className="text-emerald-500" /> Registry combines reviewed Hub approvals with <code>.trellis/knowledge/projects/{project.projectId}</code></span><span className="inline-flex items-center gap-1.5"><CircleHelp size={13} /> Run <code>npm run content -- validate</code> before merging versioned knowledge.</span></footer>
    </div>
  );
}
