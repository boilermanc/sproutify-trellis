# Unsubscribe & Suppression — Runbook

> Canonical reference for how Trellis handles unsubscribes, bounces, complaints,
> and the do-not-email list. Last updated: 2026-08-03.

## Mental model

Trellis is **federated**: it reads subscriber consent live from spoke databases
and does **not** own those profiles. What it *does* own is a Hub-side
**do-not-email list** — the `email_suppressions` table on the Hub
(`horvjqqifgrzxesuxtfm`). Every campaign send filters against it.

Two independent things write to that list:

1. **Unsubscribe clicks** → the `unsubscribe` Edge Function → a **per-branch** (or
   global) suppression row.
2. **Hard bounces & complaints** (from Resend) → the `resend-webhook` Edge Function
   → a **global** suppression row.

There is **no** `resend-compliance` n8n webhook and nothing flips `is_subscribed`
on a profile in response to a Resend event. (Older docs said otherwise — they were
wrong.)

## The suppression table

`email_suppressions` (Hub):

| Column | Notes |
|---|---|
| `email` | lowercased address |
| `scope` | `'global'` = suppress every brand; `'<branch slug>'` = suppress one brand |
| `reason` | `unsubscribe` \| `bounce` \| `complaint` \| `manual` |
| `source` | provenance: `unsubscribe-branch`, `unsubscribe-global`, `resend`, … |
| `campaign_subject`, `detail`, `created_at` | metadata |

**Primary key: `(email, scope)`** (composite, since 2026-08-03). This is what lets
one address hold a `global` row *and* a per-brand row at the same time. Branch
slugs are the values in `branches.slug` — currently `atlurbanfarms`, `rejoice`,
`rekkrd`, `sweetwater-urban-farms`.

## Scope rules (what suppresses what)

- A `global` row suppresses the address on **every** brand. Used for hard bounces,
  spam complaints, and any all-brand unsubscribe.
- A `<branch slug>` row suppresses the address on **that brand only**. Used for
  normal per-brand unsubscribes.
- The send-time filter skips a recipient if a row exists with
  `scope IN ('global', <this campaign's branch>)`.

## Outbound path (how the link gets built)

1. A template's unsubscribe link uses the **`{{unsubscribe_url}}`** token.
   (Only this token is filled — never hardcode a URL, never use
   `{{unsubscribe_token}}`.)
2. `campaign-sender` decides the campaign's **scope**:
   `scope = campaign.branches.length === 1 ? branches[0] : 'global'`.
   A single-branch campaign scopes to that brand; a **multi-branch campaign falls
   back to `global`** (deliberate — a cross-brand blast can't cleanly attribute one
   brand, so we don't half-scope it).
3. `campaign-sender` replaces `{{unsubscribe_url}}` with:
   `https://horvjqqifgrzxesuxtfm.supabase.co/functions/v1/unsubscribe?email=<addr>&scope=<scope>`
4. The recipient clicks → `unsubscribe` upserts `(email, scope)` and shows a branded
   confirmation page (it looks up `branches.name` for the slug; global says "all
   brands").

## Inbound path (bounces, complaints, opens, clicks)

Resend posts delivery events to the `resend-webhook` Edge Function, which:

- inserts every event into `email_events` (this is what the Reports tab reads),
  attributing it to a campaign via the `campaign_sends` map;
- on **hard bounce or complaint**, upserts a **`global`** `email_suppressions` row
  (address-level / ISP-level problems are never branch-scoped).

Signature verification is enforced only when `RESEND_WEBHOOK_SECRET` (whsec_…) is
set in the function's secrets.

## The ATL exception (spoke-native unsubscribe)

`campaign-sender`'s `personalize()` gives a **spoke token template precedence** over
the Hub path. If a brand has `brand_identities.unsubscribe_url` set AND the recipient
has an `unsubscribe_token`, the sender uses that spoke URL instead.

**ATL Urban Farms** is configured this way:
`https://povudgtvzggnxwgtjexa.supabase.co/functions/v1/newsletter-unsubscribe?token={{token}}`

This is correct for ATL — its audience is built live from the spoke
(`resolve_newsletter_audience`), so a spoke-side unsubscribe removes them from ATL
only and is the source of truth. The Hub still enforces global bounces/complaints
for ATL because the send-time filter always checks `email_suppressions` first.

**Net:** every brand is per-branch — ATL via its spoke, all other brands via the Hub
`?scope=` path.

## Adding a spoke unsubscribe for another brand

Only do this if that brand's audience is built from a spoke that has its own
subscriber list + unsubscribe endpoint (like ATL). Otherwise, leave it blank and the
brand uses the Hub per-branch path automatically.

1. Ensure the spoke exposes `unsubscribe_token` per subscriber and an endpoint that
   accepts it.
2. In Brand DNA, set the brand's **Unsubscribe URL** to a template containing a
   `{{token}}` placeholder (stored in `brand_identities.unsubscribe_url`).
3. Confirm the audience RPC returns `unsubscribe_token` (propagated through
   `NewsletterAudienceRow` → `Profile`). If tokens are missing, the sender falls
   back to the Hub URL automatically.

## Template authoring rules

- Put `{{unsubscribe_url}}` in the unsubscribe link's `href`. Nothing else.
- Include a real **physical mailing address** (CAN-SPAM) in the footer.
- Author full HTML in the template editor's **Code mode** (design_json stays null)
  so Unlayer doesn't mangle it.

## Components reference

| Piece | Location | Notes |
|---|---|---|
| `email_suppressions` | Hub table | composite PK `(email, scope)` |
| `unsubscribe` fn | `supabase/functions/unsubscribe/` | v9, `verify_jwt: false`; reads `scope` (legacy `source` still honored) |
| `resend-webhook` fn | `supabase/functions/resend-webhook/` | v9, `verify_jwt: false`; writes `email_events` + global suppressions |
| `campaign-sender` fn | `supabase/functions/campaign-sender/` | v4; derives scope, fills `{{unsubscribe_url}}`, filters `scope IN ('global', branch)` |
| Audience filter | `services/suppressionService.ts` | `fetchSuppressedEmails(branchScopes[])` — always includes `global` |
| Preview wiring | `pages/CampaignBuilder.tsx` | passes `selectedBranches` when single-branch so the preview matches the send |

## Operational snippets

Manually suppress an address globally:

```sql
insert into email_suppressions (email, scope, reason, source)
values ('person@example.com', 'global', 'manual', 'ops')
on conflict (email, scope) do nothing;
```

Suppress only for one brand:

```sql
insert into email_suppressions (email, scope, reason, source)
values ('person@example.com', 'rejoice', 'manual', 'ops')
on conflict (email, scope) do nothing;
```

See why an address was skipped:

```sql
select scope, reason, source, created_at
from email_suppressions where email = 'person@example.com' order by scope;
```

Re-subscribe (remove suppression) — only with the customer's explicit consent:

```sql
delete from email_suppressions
where email = 'person@example.com' and scope = 'rejoice';  -- omit scope filter to clear all
```
