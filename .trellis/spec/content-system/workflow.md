# Content Workflow

## 1. Plan

Create a task with `npm run content -- create-task`. The command requires `project_id`, audience, question, platform, hypothesis, and expected success metrics. Link an existing `topic_id` when known; otherwise register one before publication.

## 2. Research

Use task-local `research.md` for query evidence, customer questions, social signals, sources, assumptions, and the project-specific decision. Read the target project's strategy and rules. Evidence from another project may inspire a question but does not become this project's evidence automatically.

## 3. Draft

Keep variants under the task's `drafts/` directory. Drafts can be changed or discarded without polluting canonical knowledge. Apply the project's voice, topic heuristics, and channel rules.

## 4. Publish and register

The external publishing system publishes the asset. Then:

1. register/update its topic;
2. register the post with stable ID, canonical URL, `published_at`, task, and source branch;
3. register the experiment and link the post if applicable.

Do not register a fabricated or merely planned canonical URL. Scheduled/draft posts may omit URL and publication time; `published` posts may not.

## 5. Measure

Capture metric snapshots with `append-performance`. Each event belongs to one project and post, has a metric date and capture timestamp, and names its source. Never replace an earlier snapshot with a later cumulative value.

## 6. Review

At the declared window, complete `results.md` and classify the hypothesis. Link the canonical post, experiment, and relevant performance event IDs. Record confounders and whether another observation is needed.

## 7. Promote learnings

Write a candidate in `retrospective.md`. If it is durable, add a bounded entry to that project's `content-learnings.md`; include evidence IDs, confidence, conditions, and the date promoted. Otherwise explicitly check “No durable learning identified.”

## Cross-branch merge checklist

- [ ] Resolve JSONL by stable record ID, retaining unrelated records from both branches.
- [ ] Reject two post IDs claiming the same canonical URL until identity is reconciled.
- [ ] Preserve all distinct performance events.
- [ ] Confirm every reference resolves inside the same project.
- [ ] Run `npm run content -- validate` and `npm run test:content`.
