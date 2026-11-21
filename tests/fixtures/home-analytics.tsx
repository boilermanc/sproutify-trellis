import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import PostHogAnalyticsPanel from '../../components/PostHogAnalyticsPanel';
import { posthogLifecycleForBranch } from '../../supabase/functions/_shared/posthog-contract.mjs';
import '../../index.css';
// Synthetic data only; no real Supabase or PostHog calls.
const connections = async () => [{id:'fixture',branch_id:'home',status:'active',project_id:'fixture',host_url:'https://us.posthog.com'}] as any;
function Fixture() {
  const [ready,setReady]=useState(false);
  const analytics=async (_id:string, days:number) => ({connection_id:'fixture',branch_id:'home',branch_name:'Sproutify Home',cached:false,stale:false,fetched_at:new Date().toISOString(),
    data:{window_days:days,coverage:{...posthogLifecycleForBranch('sproutify-home',ready?'2026-10-20T13:00:00Z':undefined).coverage,activity_split:false},
      paid_conversions:ready?2:null,active_users:{daily:5,weekly:20,monthly:30},sessions:40,users:{total_in_window:30,new:ready?4:0,returning:26},
      lifecycle_funnel:{signed_up:4,onboarded:7,activated:6,signup_to_onboarding_pct:0,onboarding_to_activation_pct:0,labels:{signed_up:'Confirmed signups',onboarded:'Onboarded',activated:'Added a tower'}},
      retention:{day_7_pct:10,day_30_pct:0,cohort_7:10,retained_7:1,cohort_30:0,retained_30:0},feature_adoption:[]}}) as any;
  return <main className="max-w-5xl mx-auto p-4"><h1 className="text-xl mb-4">Synthetic Home analytics preview</h1><button className="p-3 border mb-4" onClick={()=>setReady(!ready)}>Toggle export readiness</button><PostHogAnalyticsPanel key={String(ready)} branches={[]} loadConnections={connections} loadAnalytics={analytics}/></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
