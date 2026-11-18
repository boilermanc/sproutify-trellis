import test from 'node:test';
import assert from 'node:assert/strict';
import {summarize,validRequest} from '../supabase/functions/atl-acquisition/report.mjs';
const input = {start:'2026-11-01',end:'2026-11-01',ids:['101','102']};
test('reject invalid dates and duplicate or unsafe IDs',()=>{
  assert.ok(validRequest(input));
  for(const change of [{start:'2026-02-30'},{ids:['101','101']},{ids:['__proto__']},{end:'2025-01-01'}]) assert.equal(validRequest({...input,...change}),false);
});
test('look back before Eastern report day and separate unknown identities and unmatched orders',()=>{
  const row=(created_at,guest_email,ad_id)=>({created_at,guest_email,marketing_attribution:{ad_id}});
  const rows=[row('2026-11-01T02:00Z',' A@example.test ','101'),row('2026-11-01T18:00Z','a@example.test','101'),row('2026-11-01T19:00Z','','101'),row('2026-11-01T21:00Z','b@example.test','101'),row('2026-11-02T02:00Z','c@example.test',null)];
  assert.deepEqual(summarize(rows,input),{ads:{101:{orders:3,buyers:1,unknown:1},102:{orders:0,buyers:0,unknown:0}},unmatched:1});
});
