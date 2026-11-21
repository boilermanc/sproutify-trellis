import React from 'react';
import { createRoot } from 'react-dom/client';
import XTrackingPanel from '../../components/XTrackingPanel';
import '../../index.css';
const posts = [
  { id: 'post', post_id: '1848765432109876543', is_own: true, is_mention: false, text: 'Garden update across our projects', published_at: '2026-10-20T12:00:00Z', project_tags: [], mention_status: 'new', metrics: { like_count: 0, impression_count: 120 }, last_synced_at: '2026-10-20T14:00:00Z', last_error: null },
  { id: 'mention', post_id: '1848765432109876544', is_own: false, is_mention: true, text: '@boilermanc When can we order seedlings?', published_at: '2026-10-20T13:00:00Z', project_tags: [], mention_status: 'new', metrics: { like_count: 2 }, last_synced_at: '2026-10-20T14:00:00Z', last_error: null },
];
const request = (async (action: string, params: any = {}) => {
  await new Promise(resolve => setTimeout(resolve, 20));
  if (action === 'sync') throw new Error('X rate limit reached. Collection will retry on the next scheduled run.');
  if (action === 'tag') { posts.find(p => p.id === params.id)!.project_tags = params.tags; return { success: true }; }
  if (action === 'status') { posts.find(p => p.id === params.id)!.mention_status = params.status; return { success: true }; }
  if (action === 'history') return { snapshots: [{ snapshot_date: '2026-10-20', captured_at: '2026-10-20T14:00:00Z', metrics: { like_count: 0, impression_count: 120 } }, { snapshot_date: '2026-10-19', captured_at: '2026-10-19T14:00:00Z', metrics: { like_count: 0, impression_count: 90 } }] };
  return { account: { handle: 'boilermanc', connected: true, last_synced_at: '2026-10-20T14:00:00Z' },
    projects: [{ id: 'garden', name: 'Sproutify' }, { id: 'atl', name: 'ATL Urban Farms' }],
    posts: posts.filter(p => (params.kind === 'mentions' ? p.is_mention : p.is_own) &&
      (!params.project || (params.project === 'unassigned' ? !p.project_tags.length : p.project_tags.includes(params.project))) &&
      (!params.unread || p.mention_status === 'new')).map(p => ({ ...p, project_tags: [...p.project_tags] })), total: 1, page: 0 };
}) as any;
createRoot(document.getElementById('root')!).render(<main className="p-4 sm:p-8 max-w-6xl mx-auto"><p className="text-xs mb-4">Local fixture · synthetic data · no external calls</p><XTrackingPanel request={request}/></main>);
