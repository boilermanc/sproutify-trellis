# Measurement Rules

## Metrics

Track the smallest set that can answer the hypothesis. Preserve raw platform names in `metrics`; do not force unlike platform metrics into false equivalence.

Common groups:

- Discovery: impressions, reach, ranking keywords, average position.
- Engagement: saves, shares, comments, engaged watch time, completion rate.
- Traffic: clicks, click-through rate, profile visits, sessions.
- Outcome: signup starts, completed signups, qualified leads, attributed conversions.

Counts and rates may coexist, but include the denominator or underlying counts when available. Never compare a rate from one platform with a count from another as though they were the same outcome.

## Evaluation windows

- Short-lived social: capture at approximately 24 hours, 7 days, and the experiment's final window (normally 30 days).
- Search assets: capture after indexing, then around 30, 60, and 90 days; continue when the query is strategically important.
- Evergreen/video assets: choose a declared window appropriate to distribution and record interim snapshots rather than moving the finish line.

The experiment record fixes `evaluation_window_days` before review. A delayed index or platform outage belongs in the retrospective and may justify an explicitly documented extension.

## Search asset versus social post

A **search asset** is designed to answer a durable query and can continue earning discovery after initial distribution: a web page, article, landing page, indexed video, or other canonical resource. Search success emphasizes query coverage, impressions, clicks, position, and downstream action over longer windows.

A **short-lived social post** is primarily feed-distributed and decays quickly. Success emphasizes reach quality, saves/shares, watch behavior, profile action, and attributed traffic within short windows. A social post can point to a search asset, but the two remain separate `post_id` records when they have separate canonical URLs and metrics.

## Structural success

Every experiment must state:

1. the audience behavior expected to change;
2. the primary metric(s) that demonstrate it;
3. a comparison basis: baseline, matched prior posts, variant, or explicit threshold;
4. the evaluation window;
5. important guardrails, such as no loss in qualified conversion while reach increases.

“More engagement” is not a complete hypothesis. Record the expected direction and why the chosen metric represents the intended behavior.

## Reviewing a hypothesis

Classify the outcome as `supported`, `mixed`, `unsupported`, or `inconclusive`. Compare against the declared basis, note sample size and confounders, and distinguish correlation from causation. Preserve snapshots even when a result is poor.

Platform-reported data remains authoritative. Trellis stores captured observations and their source (`manual_import` or `api_import`); corrections are new performance events with a new `event_id` and an explanatory metric/note field, not silent edits to earlier events.
