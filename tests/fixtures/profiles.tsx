import React from 'react';
import { createRoot } from 'react-dom/client';
import Profiles from '../../pages/Profiles';
import { attachProfileSubscriptions } from '../../services/profileSubscriptions.mjs';
import '../../index.css';

const profiles = Array.from({ length: 14 }, (_, i) => ({ id: `user-${i}`, email: `collector${i}@example.test`, first_name: i === 0 ? 'null' : i === 1 ? '   ' : `Collector ${i}`, last_name: i === 0 ? 'null' : undefined, created_at: `2026-10-${String(i + 1).padStart(2, '0')}T12:00:00Z`, _spoke_id: 'rekkrd', _spoke_name: 'Rekkrd', subscribed: i % 2 === 0, collection_record_count: i === 13 ? undefined : i * 10 }));
const subscriptions = profiles.slice(0, 12).map((p, i) => ({ id: `sub-${i}`, customer_id: p.id, _spoke_id: 'rekkrd', _spoke_name: 'Rekkrd', plan: i % 2 ? 'Collector' : 'Studio', status: i % 3 ? 'active' : 'expired', created_at: p.created_at, expires_at: i % 3 ? '2099-12-01' : '2026-01-01' }));
const branch = { id: 'branch-rekkrd', name: 'Rekkrd', slug: 'rekkrd', primary_color: '#059669' };
const connection = { id: 'rekkrd', name: 'Rekkrd', status: 'active', tables: [] };
createRoot(document.getElementById('root')!).render(<main className="p-4"><Profiles events={[]} spokeConnections={[connection] as any} branchStats={{ enrichedProfiles: attachProfileSubscriptions(profiles, subscriptions), errors: [], isLoading: false, hubSources: [], refresh: () => {} } as any} branchContext={{ allBranches: [branch], isAllSelected: true, activeBranchSlugs: ['rekkrd'] } as any} /></main>);
