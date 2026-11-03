import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import AppStoreAnalyticsPanel from '../../components/AppStoreAnalyticsPanel';
import '../../index.css';
const mode = new URLSearchParams(location.search).get('state');
const branches = [{id:'rekkrd',slug:'rekkrd',name:'Rekkrd'}, {id:'home',slug:'home',name:'Sproutify Home'}] as any;
const request = (async (_days: number, branchIds: string[]) => {
  if (mode === 'error') throw new Error('Fixture: reporting unavailable');
  const apps = [{id:'fixture',branch_id:'rekkrd',apple_app_id:'6795955100',name:'Rekkrd'}, {id:'home-fixture',branch_id:'home',apple_app_id:'6478242429',name:'Sproutify Home'}].filter(app => !branchIds.length || branchIds.includes(app.branch_id)).map(app => ({...app,status:mode === 'pending' ? 'pending' : 'active',last_synced_at:'2026-11-03T12:00:00Z',last_error:null}));
  return {window_days:30,apps:mode === 'disconnected' ? [] : apps,snapshots:mode === 'pending' ? [] : apps.flatMap(app => [1,2,3].map(day => ({app_id:app.id,branch_id:app.branch_id,metric_date:`2026-11-0${day}`,report_name:'App Downloads Standard',category:'COMMERCE',metrics:{'First-Time Downloads':day * (app.branch_id === 'home' ? 10 : 1),Redownloads:0,Updates:8,'Territory:US:First-Time Downloads':day * (app.branch_id === 'home' ? 10 : 1)},fetched_at:'2026-11-03T12:00:00Z'})))};
}) as any;
function Fixture() {
  const [branch,setBranch] = useState('all');
  const [syncMessage,setSyncMessage] = useState('');
  const context = {isAllSelected:branch === 'all',activeBranchSlugs:branch === 'all' ? [] : [branch]} as any;
  return <main className="max-w-6xl mx-auto p-4"><p className="mb-4 text-sm">Local fixture · synthetic data</p><label>Branch<select aria-label="Fixture branch" value={branch} onChange={event=>setBranch(event.target.value)}><option value="all">All</option><option value="home">Home</option><option value="rekkrd">Rekkrd</option></select></label><p role="status">{syncMessage}</p><AppStoreAnalyticsPanel branches={branches} branchContext={context} request={request} syncRequest={async id => {setSyncMessage(`Synced ${id}`); if(mode === 'slow-sync') {await new Promise(resolve => setTimeout(resolve,350)); throw new Error('Old app sync failed');}}}/></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
