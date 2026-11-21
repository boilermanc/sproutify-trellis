import test from 'node:test';
import assert from 'node:assert/strict';
import { profileText, profileDisplayName } from '../services/profileIdentity.mjs';

test('missing and serialized null names fall back to the full email', () => {
  for (const value of [null, undefined, '', '   ', 'null', ' NULL ', 'undefined']) {
    assert.equal(profileText(value), undefined);
    assert.equal(profileDisplayName({ first_name: value, last_name: value, email: 'collector@example.test' }), 'collector@example.test');
  }
});

test('real names, partial names and whitespace are handled consistently', () => {
  assert.equal(profileDisplayName({ first_name: ' Ada ', last_name: ' Lovelace ', email: 'ada@example.test' }), 'Ada Lovelace');
  assert.equal(profileDisplayName({ first_name: null, last_name: 'Lovelace' }), 'Lovelace');
  assert.equal(profileDisplayName({ first_name: 'Ada', last_name: 'null' }), 'Ada');
  assert.equal(profileDisplayName({}), 'Unnamed profile');
});
