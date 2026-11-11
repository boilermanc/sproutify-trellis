import React from 'react';
import { EnrichedProfile } from '../types';
import { currentSubscription, subscriptionState, formatProfileDate, subscriptionEnd, subscriptionEndLabel } from '../services/profileSubscriptions.mjs';

export function ProfileMembership({ profile, history = false }: { profile: EnrichedProfile; history?: boolean }) {
  const current = currentSubscription(profile.subscription_records);
  const records = history ? (profile.subscription_records || []) : current ? [current] : [];
  return (
    <div className="space-y-2 text-xs text-slate-600">
      <p>{(profile as EnrichedProfile & { _order_only?: boolean })._order_only ? 'First order' : 'Signed up'}: <span className="font-semibold">{formatProfileDate(profile.created_at)}</span></p>
      {profile._spoke_name.toLowerCase() === 'rekkrd' && <p>Records added: <span className="font-semibold">{profile.collection_record_count === undefined ? 'Unknown' : profile.collection_record_count.toLocaleString()}</span></p>}
      {records.length === 0 ? <p>Plan / activity: Unknown — no subscription data</p> : records.map((sub, index) => {
        const state = subscriptionState(sub);
        return <div key={`${sub.id}-${index}`} className="space-y-1">
          <p className="font-bold break-words">{sub.plan || 'Unknown plan'} <span className={state === 'active' ? 'text-emerald-700' : 'text-slate-500'}>· {state === 'active' ? 'Active' : state === 'inactive' ? 'Inactive' : 'Unknown activity'}</span></p>
          <p>Status: {sub.status || 'Unknown'}</p>
          {sub.provider === 'app_store' && <p>App Store status: {sub.iap_status || 'Unknown'}</p>}
          {history && <p>Subscription created: {formatProfileDate(sub.created_at)} · Period starts: {formatProfileDate(sub.started_at)}</p>}
          <p>{subscriptionEndLabel(sub)}: {formatProfileDate(subscriptionEnd(sub))}</p>
        </div>;
      })}
    </div>
  );
}
