import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { bridgeConfig, handleBridge } from '../supabase/functions/_shared/project-room-bridge.mjs';

const actor = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
const roomId = '00000000-0000-0000-0000-000000000003';
const secret = 'test-only-secret-that-is-at-least-32-characters';
const env = {
  PROJECT_ROOM_BRIDGE_KEY_SHA256: createHash('sha256').update(secret).digest('hex'),
  PROJECT_ROOM_BRIDGE_AGENT_NAME: 'daily-chief', PROJECT_ROOM_BRIDGE_ACTOR_ID: actor,
  PROJECT_ROOM_BRIDGE_AUDIENCE_IDS: other, PROJECT_ROOM_BRIDGE_ROOM_IDS: roomId,
};
const config = bridgeConfig(name => env[name]);
const request = (body = { action: 'context' }, token = secret) => new Request('https://example.com', {
  method: 'POST', headers: { 'x-project-room-key': token }, body: JSON.stringify(body),
});
function store({ recipient = true, active = true } = {}) {
  return {
    async authorization() { return {
      members: [{ room_id: roomId, user_id: actor }, ...(recipient ? [{ room_id: roomId, user_id: other }] : [])],
      users: [{ auth_user_id: actor }, ...(active ? [{ auth_user_id: other }] : [])],
    }; },
    async rooms(ids) { assert.deepEqual(ids, [roomId]); return [{ id: roomId, version: 1, title: 'Client', brief: '123-45-6789', state: {} }]; },
  };
}
test('bridge fails closed when disabled, without credentials, or asked to mutate', async () => {
  assert.equal(bridgeConfig(() => undefined), null);
  assert.equal((await handleBridge(request(), null, {})).status, 503);
  assert.equal((await handleBridge(request({}, 'wrong'), config, {})).status, 401);
  assert.equal((await handleBridge(request({ action: 'import_meeting' }), config, {})).status, 400);
});
test('bridge reads only allowlisted rooms shared with every active recipient', async () => {
  const response = await handleBridge(request(), config, store());
  const body = await response.json();
  assert.equal(body.rooms.length, 1);
  assert.equal(body.rooms[0].brief, '[REDACTED_ID]');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  for (const options of [{ recipient: false }, { active: false }]) {
    const restricted = await (await handleBridge(request(), config, store(options))).json();
    assert.deepEqual(restricted.rooms, []);
    assert.equal(restricted.restricted_count, 1);
  }
});
test('invalid request and downstream errors return safe errors', async () => {
  const result = await handleBridge(request(), config, { authorization() { throw new Error('secret database details'); } });
  assert.equal(result.status, 500);
  assert.ok(!(await result.text()).includes('secret database'));
});
