# Jev marketing article — implications for Trellis

Reviewed September 22, 2026. Source: [Jaffa's article](https://x.com/dsqjaffa/status/2102054148925526206), retrieved through a public text mirror after X blocked direct fetching. This is a product vendor's account, not an independently verified evaluation.

## Useful lessons

The author separates a content supplier from a relevance judge and a writing stage. They describe testing Jev against their existing judge before replacing it, and report a small labeled evaluation rather than a finished migration. Their most useful prompting observation is separating actual topical requirements from preferences such as presentation style.

For Trellis, retain these boundaries: collect evidence first, judge it against the business brief, then offer drafting. A source vendor could supply social content, but does not replace our business context or outcome tracking. Treat a social video's observed engagement as engagement, not evidence of conversions or product demand.

## Corrections and limits

- [TypeSafe's input documentation](https://docs.typesafe.ai/concepts/state) says Jev accepts text/JSON, not raw images, audio or video. Use authorized transcripts and textual descriptions from another processor; do not claim Jev watches footage or analyzes soundwaves directly.
- [Confidence documentation](https://docs.typesafe.ai/confidence) distinguishes Choice/Score confidence from Noul's probability of yes. High confidence is not proof of truth or commercial success. Calibrate policy on our own labeled cases.
- [The evidence-filtering cookbook](https://docs.typesafe.ai/cookbooks/classifying_rag_passages) supports separate relevance and evidence questions, routing in code, and keeping conflicts visible. Its thresholds are examples, not Trellis defaults; semantic filtering is not a security boundary.
- A provider's promotional performance claims do not establish access rights, API coverage, cost, retention permission, or reliability for Trellis. No Virlo account, subscription, credential, or integration was created during this review.

## Proposed acceptance criteria for the existing plan

1. Pin each collection run to brand, brief version, query, source, market, time and collection status. Never treat missing data as zero demand.
2. Keep hard rules separate from preferences: source rights, allowed scope and prohibited claims are gates; preferred tone/format are downstream ranking or writing choices. Audience/geography become gates only where the approved brief explicitly requires them.
3. Evaluate topical relevance, connection to offerings, and connection to current business goals separately. Preserve raw probabilities and route uncertain matches for review.
4. Start Jev in shadow evaluation against a human-labeled, multi-brand sample. Include near-misses, keyword stuffing, sparse evidence and relevant topics expressed in an unfamiliar style. Avoid tuning and reporting quality on the same examples.
5. Show only a few supported opportunities with an explanation and source links, or a clear no-strong-results state. Drafting remains an explicit user action.
6. Measure published outcomes through the persistent opportunity ID. Do not label a popular format as a sales winner without our own outcome evidence.

These are refinements for the next collection/evaluation increment, not claims that it is activated. Existing ATL Radar remains the legacy RSS/grounded-research path. Google Ads, Search Console, Amazon and additional social providers remain separate access/adapter work.
