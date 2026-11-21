import React from 'react';
import { createRoot } from 'react-dom/client';
import Profiles from '../../pages/Profiles';
import { attachProfileSubscriptions } from '../../services/profileSubscriptions.mjs';
import '../../index.css';

const profiles = Array.from({ length: 14 }, (_, i) => ({ id: `user-${i}`, email: `collector${i}@example.test`, first_name: i === 0 ? 'null' : i === 1 ? '   ' : `Collector ${i}`, last_name: i === 0 ? 'null' : undefined, phone: i === 13 ? '(404) 555-0113' : undefined, created_at: `2026-10-${String(i + 1).padStart(2, '0')}T12:00:00Z`, last_login_at: i === 13 ? '2026-11-18T15:30:00Z' : undefined, _spoke_id: 'rekkrd', _spoke_name: 'Rekkrd', subscribed: i % 2 === 0, collection_record_count: i === 13 ? undefined : i * 10 }));
const atlProfiles = [{ id: 'atl-sash', email: 'csludwig47@icloud.com', first_name: 'Sash', last_name: 'Ludwig', phone: '978-973-5377', created_at: '2026-04-29T12:00:00Z', _spoke_id: 'atl', _spoke_name: 'ATL Urban Farms', subscribed: true, order_stats: { ltv: 1360.71, order_count: 25, avg_order_value: 54.43, last_purchase_at: '2026-05-14T12:00:00Z' } }];
const subscriptions = profiles.slice(0, 12).map((p, i) => ({ id: `sub-${i}`, customer_id: p.id, _spoke_id: 'rekkrd', _spoke_name: 'Rekkrd', plan: i % 2 ? 'Collector' : 'Studio', status: i % 3 ? 'active' : 'expired', created_at: p.created_at, expires_at: i % 3 ? '2099-12-01' : '2026-01-01' }));
const branch = { id: 'branch-rekkrd', name: 'Rekkrd', slug: 'rekkrd', primary_color: '#059669' };
const atlBranch = { id: 'branch-atl', name: 'ATL Urban Farms', slug: 'atl', primary_color: '#059669' };
const connection = { id: 'rekkrd', name: 'Rekkrd', status: 'active', tables: [] };
const atlConnection = { id: 'atl', name: 'ATL Urban Farms', status: 'active', tables: [] };
createRoot(document.getElementById('root')!).render(<main className="p-4"><Profiles events={[]} spokeConnections={[connection, atlConnection] as any} branchStats={{ enrichedProfiles: attachProfileSubscriptions([...profiles, ...atlProfiles], subscriptions), errors: [], isLoading: false, hubSources: [], refresh: () => {} } as any} branchContext={{ allBranches: [branch, atlBranch], isAllSelected: true, activeBranchSlugs: ['rekkrd', 'atl'] } as any} /></main>);
