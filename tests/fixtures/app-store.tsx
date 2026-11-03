import React from 'react';
import { createRoot } from 'react-dom/client';
import AppStoreAnalyticsPanel from '../../components/AppStoreAnalyticsPanel';
import '../../index.css';
const mode = new URLSearchParams(location.search).get('state');
const request = (async () => {
  if (mode === 'error') throw new Error('Fixture: reporting unavailable');
  return { window_days:30, apps: mode === 'disconnected' ? [] : [{id:'fixture',branch_id:'rekkrd',apple_app_id:'6795955100',name:'Rekkrd',status:mode === 'pending' ? 'pending' : 'active',last_synced_at:'2026-11-03T12:00:00Z',last_error:null}], snapshots:mode === 'pending' ? [] : [1,2,3].map(day => ({app_id:'fixture',branch_id:'rekkrd',metric_date:`2026-11-0${day}`,report_name:'App Downloads Standard',category:'COMMERCE',metrics:{'First-Time Downloads':day,Redownloads:0,Updates:8,'Territory:US:First-Time Downloads':day},fetched_at:'2026-11-03T12:00:00Z'}))};
}) as any;
createRoot(document.getElementById('root')!).render(<main className="max-w-6xl mx-auto p-4"><p className="mb-4 text-sm">Local fixture · synthetic data</p><AppStoreAnalyticsPanel branches={[]} request={request} syncRequest={async () => {}}/></main>);
