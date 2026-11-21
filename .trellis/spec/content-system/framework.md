# Content Intelligence Framework

## Purpose

This system gives Trellis a closed loop for discovering content opportunities, testing a claim, registering the real asset, observing performance, and retaining only reviewed lessons. It is repository memory, not a publisher, analytics warehouse, or replacement for the Hub's runtime campaign data.

## Shared terminology

- **Project**: a Trellis branch/product with a stable slug, audience, positioning, and isolated content memory.
- **Topic**: a durable audience question or opportunity, identified by `topic_id`.
- **Post**: a concrete content asset on a platform, identified by `post_id`; a published post also has a canonical URL and publication time.
- **Experiment**: a falsifiable hypothesis, metrics, and evaluation window linked to a topic and optionally a post.
- **Performance event**: an append-only metric snapshot from a named source and date.
- **Learning**: a reviewed, bounded recommendation explicitly promoted from task evidence.

## Working state versus canonical state

Files in `.trellis/tasks/<task-id>/` may diverge between branches and may contain abandoned angles. They are evidence of work, not shared truth. A draft becomes a tracked asset only when `register-post` reconciles it into `.trellis/knowledge/projects/<project-id>/posts.jsonl`.

Canonical project knowledge is committed at stable paths. Branches reconcile changes through ordinary Git review and merge. Registration helpers make record identity explicit and reject canonical URL collisions; merge conflicts must be resolved by record identity, never by accepting an entire JSONL side blindly.

## Project partitioning

All canonical records include `project_id`, and the helper requires it to match the containing directory. Topics and references are resolved only inside that project. There is no global topic bank or global learnings file.

Shared files define mechanics only. Project specs define audience, voice, channel priorities, hypotheses, and accumulated lessons. Similar-looking questions in two products receive different IDs and independent evidence.

## Stable identity and reconciliation

- Use the existing Trellis branch slug for `project_id`.
- Keep `topic_id`, `post_id`, `experiment_id`, and `event_id` stable after creation.
- Treat `canonical_url` as a second unique identity for a published asset.
- `register-topic`, `register-post`, and `register-experiment` atomically create or update by their stable ID.
- `append-performance` never rewrites history. Reusing an `event_id` is idempotent only when every value is identical.
- Run `npm run content -- validate` after resolving cross-branch changes.

## Promoting learnings

A task retrospective proposes a learning. Promotion requires evidence IDs, confidence, and the conditions under which the lesson applies. The reviewer adds it to the same project's `content-learnings.md`. One result should usually remain an observation; repeated or unusually decisive evidence can justify a durable rule.

Cross-project transfer is a new hypothesis, not a copy operation. If a Rejoice result appears useful to Rekkrd, create a Rekkrd task and test it there.

## Record conventions

- JSONL contains one compact JSON object per line and no comments.
- Timestamps use ISO 8601 with timezone; helpers normalize full timestamps to UTC.
- Date-only metric windows use `YYYY-MM-DD`.
- IDs use lowercase ASCII letters, numbers, underscores, and hyphens.
- Empty strings mean unknown/not applicable; do not invent URLs, dates, or metrics.
- Git history supplies authorship; `source_branch` and `task_id` supply provenance.
