// Fictional fixtures only: these are not approved production brand facts.
export const NOW = '2026-09-22T12:00:00Z';
export const CONFIRMED = '2026-09-01T12:00:00Z';
export const REVIEW_DUE = '2026-10-01T12:00:00Z';
export const examples = [
  { key: 'nursery', offering: 'Vegetable seedlings', type: 'physical_product', audience: 'Apartment gardeners', outcome: 'Seedling orders', seed: 'balcony vegetables', claim: 'Our fictional nursery offers vegetable seedlings.' },
  { key: 'music', offering: 'Songwriting workshop', type: 'class', audience: 'Beginning songwriters', outcome: 'Workshop bookings', seed: 'songwriting exercises', claim: 'Our fictional studio offers songwriting workshops.' },
  { key: 'wellness', offering: 'Community walking club', type: 'community', audience: 'Local adults seeking company', outcome: 'Event registrations', seed: 'neighborhood walks', claim: 'Our fictional club organizes community walks.' },
];

export function makeBrief(example = examples[0]) {
  const { key } = example;
  return {
    schema_version: 1, id: `${key}-brief`, version_id: `${key}-v1`, version: 1,
    brand_id: `${key}-brand`, branch_id: `${key}-branch`, project_id: `${key}-project`,
    status: 'approved', author_id: 'fictional-author', created_at: CONFIRMED, updated_at: CONFIRMED,
    reviewer_id: 'fictional-reviewer', approved_at: CONFIRMED, supersedes_version_id: null,
    offerings: [{ id: `${key}-offering`, name: example.offering, type: example.type, source_url: `https://${key}.example/catalog`, availability: 'available', markets: ['US'] }],
    audiences: [{ id: `${key}-audience`, description: example.audience, needs: ['Helpful information'], offering_ids: [`${key}-offering`], exclusions: [] }],
    priorities: [{ id: `${key}-priority`, outcome: example.outcome, weight: null, starts_at: null, ends_at: null }],
    voice: { tone: 'Friendly and factual', examples: [], preferred_terms: [], avoided_terms: [], channel_rules: [] },
    facts: [{
      id: `${key}-fact`, claim: example.claim,
      evidence: [{ id: `${key}-evidence`, source_url: `https://${key}.example/catalog`, title: 'Fictional catalog record', captured_at: CONFIRMED, excerpt: example.claim, record_reference: null }],
      last_confirmed_at: CONFIRMED, review_due_at: REVIEW_DUE, status: 'approved', reviewer_id: 'fictional-reviewer', approved_at: CONFIRMED, offering_ids: [`${key}-offering`],
    }],
    restrictions: { prohibited_claims: ['Guaranteed outcomes'], required_caveats: [], disallowed_topics: [], review_conditions: [] },
    research_context: { markets: ['US'], languages: ['en'], topic_seeds: [example.seed], competitors: [], source_preferences: [], seasonal_context: [] },
    content_context: { canonical_urls: [`https://${key}.example/catalog`], allowed_channels: ['blog'], calls_to_action: [{ label: 'Learn more', url: `https://${key}.example/catalog` }] },
  };
}
export function scope(brief) {
  return { brand_id: brief.brand_id, branch_id: brief.branch_id, project_id: brief.project_id };
}
