import { adminClient } from '../_shared/posthog.ts';
import { SCOPES } from './domain.mjs';
export const db = adminClient();
export const callbackUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/x-tracking/callback`;
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
export async function hash(value: string) {
  return base64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))
    .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
async function key() {
  const secret = Deno.env.get('X_TOKEN_ENCRYPTION_KEY') || '';
  if (secret.length < 32) throw new Error('X_TOKEN_ENCRYPTION_KEY must be configured server-side (at least 32 characters).');
  return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)), 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function encrypt(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), new TextEncoder().encode(value)));
  return base64(new Uint8Array([...iv, ...data]));
}
export async function decrypt(value: string) {
  const data = Uint8Array.from(atob(value), c => c.charCodeAt(0));
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: data.slice(0, 12) }, await key(), data.slice(12)));
}
export function appConfig() {
  const id = Deno.env.get('X_CLIENT_ID');
  const secret = Deno.env.get('X_CLIENT_SECRET');
  if (!id || !secret) throw new Error('Configure the X OAuth client ID and secret on the server first.');
  return { id, secret };
}
export async function exchange(params: URLSearchParams) {
  const app = appConfig();
  params.set('client_id', app.id);
  const response = await fetch('https://api.x.com/2/oauth2/token', {
    method: 'POST', headers: { Authorization: `Basic ${btoa(`${encodeURIComponent(app.id)}:${encodeURIComponent(app.secret)}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded' }, body: params, signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('X token exchange failed. Reconnect @boilermanc and check the OAuth app configuration.');
  const data = await response.json();
  if (!data.access_token || !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw new Error('X returned an invalid token response.');
  if (data.scope && SCOPES.split(' ').some(scope => !data.scope.split(' ').includes(scope))) throw new Error('X did not grant all required read permissions.');
  return data;
}
export async function tokenFields(tokens: any, previousRefresh?: string) {
  return {
    access_token_encrypted: await encrypt(tokens.access_token),
    refresh_token_encrypted: tokens.refresh_token ? await encrypt(tokens.refresh_token) : previousRefresh,
    token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
  };
}
export async function account() {
  const { data, error } = await db.from('x_shared_account').select('*').eq('handle', 'boilermanc').single();
  if (error || !data) throw new Error('X tracking storage is unavailable. Apply the shared X migration first.');
  return data;
}
export async function accessToken(row: any) {
  if (!row.access_token_encrypted || !row.platform_user_id) throw new Error('Connect @boilermanc first.');
  if (Date.parse(row.token_expires_at) > Date.now() + 60000) return decrypt(row.access_token_encrypted);
  if (!row.refresh_token_encrypted) throw new Error('Reconnect @boilermanc to enable background collection.');
  const tokens = await exchange(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: await decrypt(row.refresh_token_encrypted) }));
  const { error } = await db.from('x_shared_account').update(await tokenFields(tokens, row.refresh_token_encrypted)).eq('id', row.id);
  if (error) throw new Error('Could not save refreshed X authorization.');
  return tokens.access_token;
}
