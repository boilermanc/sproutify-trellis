# Trellis Content Intelligence — Operator Guide

Content Intelligence is the closed-loop workflow that connects a content opportunity to the asset that shipped, the result it produced, and the lesson Trellis should retain.

Open it in Trellis at **Content Studio → Content Intelligence**.

## The rule that keeps the system useful

Every content record belongs to one project. Branches share the lifecycle and schema, but never automatically share strategy or memory.

- Rejoice topics, performance, and lessons stay in Rejoice.
- Rekkrd topics, performance, and lessons stay in Rekkrd.
- Every new branch receives its own strategy and canonical knowledge partition.

## What lives where

| Location | Purpose | Canonical? |
|---|---|---|
| `.trellis/tasks/<task-id>/` | PRD, research, drafts, results, retrospective | No — working evidence |
| `.trellis/knowledge/projects/<project-id>/` | Topics, posts, experiments, performance events | Yes |
| `.trellis/spec/projects/<project-id>/` | Strategy, SEO/social rules, promoted learnings | Yes |
| `.trellis/spec/content-system/` | Shared workflow and measurement mechanics | Yes, shared mechanics only |

## First-time setup for a branch

The Overview tab lists branches without partitions and prints their exact setup commands. From the repository, run:

```powershell
npm run content -- create-project --project atlurbanfarms --name "ATL Urban Farms"
```

Then replace the generated strategy prompts with that branch's actual audience, positioning, voice, channel priorities, and hypothesis rules. Do not copy another project's strategy.

## The seven-step operating loop

### 1. Choose the project

Select the branch that owns the audience and outcome. Confirm its strategy before starting.

### 2. Register or reuse the topic

A topic is a durable audience question. Register it once per project and reuse its ID when later assets answer the same question.

```powershell
npm run content -- register-topic --project rejoice --topic-id topic_sleep_night_routine --title "How to settle before sleep" --cluster sleep-and-rest --intent informational --source research
```

### 3. Create the task

Use the **New Task** tab to enter the audience, question, platform, hypothesis, and success metrics. Copy and run its generated command. The task includes all working documents and a drafts directory.

### 4. Research and draft

Capture evidence in `research.md`, including sources and why they matter to this project's audience. Keep variants in `drafts/`. Follow the project's strategy and SEO/social rules.

### 5. Publish and register

Publish through the external platform. Register only the real asset:

Open the **Assets** tab first. Trellis reads successful Post Scheduler/Social Hub publications for the selected branch and lists anything that does not match a registered record. Choose an existing topic—or create the project's first audience question—paste the real public URL, optionally link its task, then select **Approve & register**. Trellis writes the topic and post atomically to the Hub, records the approving user, and matches future refreshes through `source_record_id` and the platform `external_post_id`. The CLI command remains available as a versioned-knowledge fallback.

```powershell
npm run content -- register-post --project rejoice --post-id post_2026_08_rejoice_001 --topic-id topic_sleep_night_routine --platform instagram --status published --canonical-url "https://www.instagram.com/p/REAL_ID/" --published-at "2026-08-18T16:00:00-04:00" --task-id content_rejoice_sleep_001
```

Register the experiment if the post tests a hypothesis:

```powershell
npm run content -- register-experiment --project rejoice --experiment-id exp_rejoice_sleep_question_001 --topic-id topic_sleep_night_routine --post-id post_2026_08_rejoice_001 --hypothesis "A concrete nightly question will earn more saves than generic encouragement." --success-metrics impressions,saves,profile_visits --window-days 30 --status running
```

### 6. Append performance and review

Performance is append-only. After an asset is approved, the **Performance** tab automatically reads every collected Instagram or Facebook snapshot from `social_post_insights`, maps it to the canonical post, and preserves the platform's real metric names. The **Experiments** tab calculates each running experiment's review date from the publication date and declared evaluation window, then labels upcoming, due, and overdue reviews.

Use **Refresh snapshots** after an external collector runs. Manual imports remain available for sources that are not connected yet; every snapshot gets a distinct event ID and preserves its metric date, capture time, platform, and source.

```powershell
npm run content -- append-performance --project rejoice --post-id post_2026_08_rejoice_001 --experiment-id exp_rejoice_sleep_question_001 --platform instagram --metric-date 2026-09-17 --metrics '{"impressions":1200,"saves":42,"profile_visits":19}' --source manual_import
```

Complete `results.md` and classify the hypothesis as supported, mixed, unsupported, or inconclusive.

### 7. Promote the learning

Write the candidate in `retrospective.md`. Promote it to the same project's `content-learnings.md` only when it is durable. Include:

- the bounded finding;
- task, experiment, post, and performance event IDs;
- confidence;
- conditions and limitations;
- how the next task should apply or retest it.

## Before merging canonical changes

```powershell
npm run content -- validate
npm run test:content
```

Confirm that published URLs are real, references resolve inside one project, performance history was appended, unrelated JSONL records from parallel branches were preserved, and promoted lessons cite evidence.

## What remains to automate

The Assets tab now reconciles successful Social Hub/Post Scheduler publications, supports in-review topic creation, and writes approved registrations through role-protected Hub policies. Approved Instagram and Facebook assets inherit their complete collected insight history, and running experiments show calculated review reminders. The next integration phase is:

1. Add scheduled imports for YouTube, Google Search Console, and other configured providers beyond the existing social collectors.
2. Add an approval workflow for promoting reviewed learnings.
3. Add proactive notifications for due experiments outside the in-app reminder badges.
4. Add a versioned export/sync path from approved Hub records back into project JSONL when repository history is required.

Publishers and analytics providers remain authoritative for external facts. Trellis stores reviewed Hub registrations at runtime; the validated CLI remains the path for versioned repository knowledge.
