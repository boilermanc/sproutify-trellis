// This reader uses aggregate reports only. It never sends connection credentials,
// raw events, or user profiles to an LLM, and never treats missing data as zero.

/** @typedef {{ branchIds: string[], all: boolean, windowDays: 7|30|90, topic: string }} PosthogConversation */
/** @typedef {{ allBranches?: import('../types').BranchInfo[], activeBranchSlugs?: string[], isAllSelected?: boolean, previous?: PosthogConversation|null }} ReportingOptions */
/** @typedef {{ listConnections: () => Promise<import('../types').PostHogConnection[]>, fetchAnalytics: (id: string, days: 7|30|90) => Promise<import('../types').PostHogAnalyticsResult> }} ReportingReaders */

const normalize = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const hasPhrase = (text, phrase) => phrase && ` ${text} `.includes(` ${normalize(phrase)} `);
const number = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const count = (value) => number(value) === null ? 'unavailable' : value.toLocaleString('en-US');

function aliases(branch) {
  return [branch.name, branch.slug, branch.website_url,
    branch.slug === 'rekkrd' ? 'rekkerd' : null].filter(Boolean);
}

function topicFor(text) {
  const topics = [];
  if (/\b(retention|retain\w*|returning|return visits?|repeat|coming back|come back|came back|stick\w*)\b/.test(text)) topics.push('retention');
  if (/\b(signups?|signed up|new users?|first record|onboard\w*|activat\w*|installs?|installed|identified|funnel|conversion|convert\w*|drop off)\b/.test(text)) topics.push('lifecycle');
  if (/\b(features?|adoption|milestones?|discogs|spins?|collection value)\b/.test(text)) topics.push('features');
  if (/\b(usage|active|dau|wau|mau|sessions?|visitors?|traffic)\b|\bhow many\b.*\busers?\b/.test(text)) topics.push('usage');
  return topics.length === 1 ? topics[0] : topics.length > 1 ? 'summary' : null;
}

function requestedWindow(text, previousWindow) {
  // Calendar periods and historical comparisons require a different query than
  // the current rolling snapshots. Never silently substitute a nearby window.
  if (/\b(yesterday|today|last week|last month|last quarter|last year|between|since|before|after|versus last|vs last|week over week|month over month|year over year)\b/.test(text)
    || /\b\d{4}\s+\d{1,2}\s+\d{1,2}\b/.test(text)
    || /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/.test(text)) return null;
  const windows = [...text.matchAll(/\b(\d+)\s*(days?|weeks?|months?|years?|hours?)\b/g)]
    .filter((match) => !/^\s+retention\b/.test(text.slice(match.index + match[0].length)))
    .map((match) => Number(match[1]) * (match[2].startsWith('week') ? 7 : match[2].startsWith('month') ? 30 : match[2].startsWith('day') ? 1 : Infinity));
  if (/\b(this week|past week|last seven days|past seven days)\b/.test(text)) windows.push(7);
  if (/\b(this month|past month|last thirty days|past thirty days)\b/.test(text)) windows.push(30);
  if (/\b(this quarter|past quarter|last ninety days|past ninety days)\b/.test(text)) windows.push(90);
  if (windows.some((days) => ![7, 30, 90].includes(days)) || new Set(windows).size > 1) return null;
  return windows[0] || previousWindow || 30;
}

function retentionLine(retention, days) {
  const cohort = number(retention?.[`cohort_${days}`]);
  const retained = number(retention?.[`retained_${days}`]);
  if (cohort === null || retained === null || retained > cohort) return `${days}-day repeat activity: unavailable.`;
  if (cohort === 0) return `${days}-day repeat activity: insufficient prior-period history (no users in the preceding ${days} days).`;
  return `${days}-day repeat activity: ${count(retained)} of ${count(cohort)} users (${(retained / cohort * 100).toFixed(1)}%) active in the preceding ${days} days also appeared in the most recent ${days} days.`;
}

function formatReport(connection, result, windowDays, topic) {
  const data = result.data;
  const lines = [`${connection.branch_name || connection.branch_slug || 'Unnamed branch'} · project ${connection.project_id}`];
  if (topic === 'summary' || topic === 'usage') {
    lines.push(`Active users: ${count(data.active_users?.daily)} in 24 hours; ${count(data.active_users?.weekly)} in 7 days; ${count(data.active_users?.monthly)} in 30 days.`);
    lines.push(`In ${windowDays} days: ${count(data.users?.total_in_window)} distinct users and ${count(data.sessions)} tracked sessions.`);
  }
  if (topic === 'summary' || topic === 'lifecycle') {
    const lifecycle = data.lifecycle_funnel;
    lines.push(`Lifecycle event users (${windowDays} days): ${lifecycle?.labels?.signed_up || 'Signed up'} ${count(lifecycle?.signed_up)}; ${lifecycle?.labels?.onboarded || 'Onboarded'} ${count(lifecycle?.onboarded)}; ${lifecycle?.labels?.activated || 'Activated'} ${count(lifecycle?.activated)}.`);
    if (connection.branch_slug === 'rekkrd') lines.push('Rekkrd does not yet emit a separate onboarding-completion event; that stage cannot establish onboarding success or failure.');
  }
  if (topic === 'summary' || topic === 'retention') {
    lines.push(retentionLine(data.retention, 7), retentionLine(data.retention, 30));
  }
  if (topic === 'summary' || topic === 'features') {
    // Only display event names that the connection already approves. These are
    // aggregate milestone names, never arbitrary properties or raw event text.
    const adoption = Array.isArray(data.feature_adoption) ? data.feature_adoption.filter((row) => connection.allowed_events.includes(row.event)) : null;
    lines.push(adoption === null ? 'Feature milestones: unavailable.' : adoption.length
      ? `Recorded feature milestones (${windowDays} days):\n${adoption.slice(0, 20).map((row) => `• ${row.event}: ${count(row.users)} users, ${count(row.events)} events`).join('\n')}`
      : 'No approved feature milestones were recorded in this window. This does not establish that features went unused.');
  }
  const fetchedAt = new Date(result.fetched_at);
  const dated = Number.isFinite(fetchedAt.getTime());
  const stale = result.stale || !dated || Date.now() - fetchedAt.getTime() > 90 * 60 * 1000;
  lines.push(`Source: PostHog ${stale ? 'STALE snapshot — latest data unavailable' : result.cached ? 'cached snapshot' : 'query'}; fetched ${dated ? fetchedAt.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC') : 'time unavailable'}.`);
  if (result.warning && !stale) lines.push('The reporting service flagged a warning. Check Reports → Product before relying on these figures.');
  return lines.join('\n');
}

/**
 * Deterministic factual reader, matching Sage's email/event reporting pattern.
 * @param {string} question
 * @param {ReportingOptions} options
 * @param {ReportingReaders} readers
 * @returns {Promise<{text: string, context: PosthogConversation|null}|null>}
 */
export async function answerPosthogQuestion(question, options, readers) {
  const text = normalize(question);
  const previous = options.previous;
  const branchMentions = (options.allBranches || []).filter((branch) => aliases(branch).some((alias) => hasPhrase(text, alias)));
  const capability = /\b(what|which)\b.*\b(live data|data sources)\b.*\b(access|connected|available|use)\b/.test(text);
  const topic = topicFor(text);
  const posthog = /\bposthog\b/.test(text);
  const followup = !!previous && (posthog || !!topic || /^(and|what about|how about|compare|same|those|them)\b/.test(text)
    || /^\d+ (days?|weeks?|months?)$/.test(text)
    || /\b(they|these apps|those apps|coming back|returning)\b/.test(text));
  const product = !!topic || /\b(product analytics|product events?|active users?|dau|wau|mau|sessions?|signups?|onboarding|activation|usage)\b/.test(text)
    || (/\b(users?|events?|performing|doing)\b/.test(text) && branchMentions.length > 0);
  // Leave campaign and registration workflows with their existing readers.
  if (!posthog && /\b(emails?|campaigns?|registrations?|registered|workshops?|attendees|tickets?)\b/.test(text)) return null;
  if (/^(write|draft|compose|create|send|schedule)\b/.test(text)) return null;
  if (!posthog && !capability && !product && !followup) return null;

  let connections;
  try { connections = await readers.listConnections(); }
  catch { return { text: 'I couldn’t read the PostHog connection list. Retry or check Settings → Integrations → PostHog. I won’t guess at product metrics.', context: null }; }
  const active = connections.filter((connection) => connection.status !== 'disconnected');
  const available = active.map((connection) => `${connection.branch_name || connection.branch_slug || 'Unnamed branch'} (project ${connection.project_id})`).join(', ');
  if (capability || /^(which|what)\b.*\b(properties|projects|branches|apps)\b.*\bconnected\b/.test(text)
    || /^(list|show)\b.*\bconnections\b/.test(text)) {
    return { text: `${capability ? 'I can check tracked Trellis email opens and ATL event registrations through their reporting connections.\n\n' : ''}PostHog properties connected: ${available || 'none'}.\n\nFor connected properties, I can read active users, sessions, lifecycle event counts, approved feature milestones, and repeat activity over 7 or 30 days. Reports use rolling 7-, 30-, or 90-day windows and show their freshness. Ask about one branch or all PostHog properties. Arbitrary property breakdowns, raw user lists, sequenced funnels, and revenue attribution are not available through this reader.`, context: null };
  }

  // Discover branches from both the branch selector and connection metadata;
  // future connections require no changes to Sage's branch list or prompt.
  const known = new Map((options.allBranches || []).map((branch) => [branch.id, branch]));
  for (const connection of connections) {
    if (!known.has(connection.branch_id)) known.set(connection.branch_id, { id: connection.branch_id, name: connection.branch_name || '', slug: connection.branch_slug || '', website_url: '' });
  }
  const named = [...known.values()].filter((branch) => aliases(branch).some((alias) => hasPhrase(text, alias))
    || connections.some((connection) => connection.branch_id === branch.id && hasPhrase(text, `project ${connection.project_id}`)));
  const all = /\b(all|every|each)\b(?:\s+\w+){0,3}\s+(properties|projects|apps|branches|sites)\b|\bacross the ecosystem\b/.test(text);
  const scopeChanged = all || named.length > 0 || /\b(selected|current)\s+(branches|branch|scope)\b/.test(text);
  const contextScope = followup && !scopeChanged ? previous : null;
  const allScope = all || (!named.length && (contextScope ? contextScope.all : options.isAllSelected !== false));
  const branchIds = named.length ? named.map((branch) => branch.id) : contextScope ? contextScope.branchIds
    : allScope ? active.map((connection) => connection.branch_id)
      : [...known.values()].filter((branch) => (options.activeBranchSlugs || []).includes(branch.slug)).map((branch) => branch.id);
  const selected = active.filter((connection) => allScope || branchIds.includes(connection.branch_id));
  const unresolvedProject = [...text.matchAll(/\bproject\s+(\d+)\b/g)].some((match) => !connections.some((connection) => connection.project_id === match[1]));
  const unknownNamedScope = !named.length && /\b(?:project|property|branch|app)\s+(?:named\s+)?([a-z0-9]+)\b/.exec(text);
  const unknownFollowup = !named.length && !all && !topic && /^(what|how) about\b/.test(text)
    && !/\b(\d+|days?|weeks?|months?|them|those|that|it|these|all)\b/.test(text);
  if (unresolvedProject || unknownFollowup || (unknownNamedScope && !['analytics', 'usage', 'data', 'events', 'activity', 'performance', 'is', 'are', 'with', 'for', 'in', 'from', 'connections'].includes(unknownNamedScope[1]))) {
    return { text: `I couldn’t match the requested PostHog property to a Trellis connection. Available: ${available || 'none'}. Name one of these branches or its project ID.`, context: null };
  }
  const selectedTopic = topic || (followup ? previous?.topic : null) || 'summary';
  const windowDays = requestedWindow(text, followup ? previous?.windowDays : null);
  if (windowDays === null) return { text: 'Sage’s PostHog reader currently supports one rolling window of 7, 30, or 90 days. Calendar dates, other durations, and historical period comparisons need a separate PostHog report. Which supported window should I use?', context: { branchIds, all: allScope, windowDays: previous?.windowDays || 30, topic: selectedTopic } };
  /** @type {PosthogConversation} */
  const context = { branchIds, all: allScope, windowDays, topic: selectedTopic };
  const missing = branchIds.filter((id) => !active.some((connection) => connection.branch_id === id));
  const missingLines = missing.map((id) => `${known.get(id)?.name || 'Requested branch'}: no connected PostHog property. Connect it in Settings → Integrations → PostHog.`);
  if (!selected.length) return { text: missingLines.join('\n') || (allScope ? 'No PostHog properties are connected. Add a connection in Settings → Integrations → PostHog.' : 'No PostHog property is selected. Select a branch, name a connected branch, or ask for all PostHog properties.'), context };

  const unsupported = /\b(revenue|attribution|attribut\w*|replay|recordings?|raw events?|user lists?|emails?|addresses|individual|who|breakdown|break down|platform|device|country|browser|utm|growth|increas\w*|decreas\w*|changed|change|trend)\b/.test(text)
    || /\b(event|person|user) properties\b/.test(text);
  if (unsupported) return { text: `For ${selected.map((connection) => connection.branch_name || connection.branch_slug).join(', ')}, Sage can currently read aggregate usage, lifecycle event counts, approved feature milestones, and repeat activity. That report does not contain the requested breakdown, user-level details, revenue attribution, or historical trend. Open PostHog for that analysis; I won’t infer it from summary totals.`, context };

  const results = await Promise.allSettled(selected.map(async (connection) => {
    const result = await readers.fetchAnalytics(connection.id, windowDays);
    if (!result?.data || result.connection_id !== connection.id || result.branch_id !== connection.branch_id || result.data.window_days !== windowDays) throw new Error('Mismatched analytics response');
    return formatReport(connection, result, windowDays, selectedTopic);
  }));
  const reports = results.map((result, index) => result.status === 'fulfilled' ? result.value
    : `${selected[index].branch_name || selected[index].branch_slug || 'Requested branch'} · project ${selected[index].project_id}: report unavailable. Retry or check Reports → Product; no numbers estimated.`);
  const notes = ['Counts use PostHog distinct IDs, which may include anonymous visitors.'];
  if (selected.length > 1) notes.push('Projects are shown separately; people are not deduplicated across properties.');
  if (selectedTopic === 'summary' || selectedTopic === 'lifecycle') notes.push('Lifecycle stages are independent event counts, not a sequenced conversion funnel. Zero recorded events can also mean missing instrumentation.');
  if (/\bnew users?\b/.test(text)) notes.push('The report’s “new” count is based on signup/install events; it does not measure first-time visitors.');
  if (selectedTopic === 'summary' || selectedTopic === 'retention') notes.push('Repeat activity compares adjacent periods, not exact day-7/day-30 retention after signup.');
  const scopeLabel = allScope ? 'all connected properties' : named.length ? 'named branches' : contextScope ? 'previously requested branches' : 'selected branches';
  return { text: `PostHog · rolling last ${windowDays} days · ${scopeLabel}\nWindows end at each report’s fetch time. Active-user and repeat-activity periods are labeled separately.\n\n${[...reports, ...missingLines].join('\n\n')}\n\n${notes.join(' ')}`, context };
}
