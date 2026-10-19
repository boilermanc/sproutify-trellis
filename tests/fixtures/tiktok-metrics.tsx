import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import TikTokMetricsPanel from '../../components/TikTokMetricsPanel';
import '../../index.css';
// Local-only fixture: never reads or writes live data.
const request = (async (action: string, branchId: string) => {
  if (action !== 'list') return { refreshed: 1, unavailable: 0 };
  return { ready: branchId === 'home', permission_error: branchId === 'farm' ? 'Missing video.list permission. Reconnect TikTok after adding Display API.' : null, limit: 200, posts: branchId === 'home' ? [{ id: 'test', branch_id: 'home', video_id: '7698435240997489950', share_url: 'https://www.tiktok.com/@sproutifytheapp/video/7698435240997489950', caption: 'Fixture only — sample Home post', views: 123, likes: 0, comments: null, shares: 2, last_synced_at: '2026-10-19T17:00:00Z', last_error: null }] : [] };
}) as any;
function Fixture() { const [branch, setBranch] = useState('home'); return <main className="p-4 max-w-5xl mx-auto"><h1 className="text-xl mb-4">Local fixture — synthetic data</h1><button className="p-3 border rounded-xl mb-4" onClick={() => setBranch(branch === 'home' ? 'farm' : 'home')}>Switch Home / Farm</button><div key={branch}><TikTokMetricsPanel branchId={branch} branchName={branch === 'home' ? 'Sproutify Home' : 'Sproutify Farm'} request={request}/></div></main>; }
createRoot(document.getElementById('root')!).render(<Fixture/>);
