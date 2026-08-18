# Trellis Content Intelligence

This directory is Trellis's repository-native workflow and durable memory for content experiments. It complements the live application: external publishers and analytics systems remain authoritative for publishing and raw metrics, while these files preserve hypotheses, asset identity, observations, and reviewed lessons.

The Trellis sidebar exposes this memory as **Content Studio → Content Intelligence**. The page reads every configured project partition at build time, displays its strategy and canonical records, and generates copy-ready task commands. Repository writes remain in the validated CLI so deployed browser code never receives filesystem access.

## The boundary

- `tasks/<task-id>/` is branch-local working material: a PRD, research, drafts, results, and retrospective.
- `knowledge/projects/<project-id>/` is canonical, cross-branch identity and event history.
- `spec/content-system/` defines the shared lifecycle and measurement contract.
- `spec/projects/<project-id>/` is that project's strategic brain.

Rejoice and Rekkrd share mechanics, not intelligence. Never copy a topic, experiment outcome, or learning from one partition into the other without an explicit new project-specific investigation.

## Quick start

List the configured projects:

```powershell
npm run content -- projects
```

Create a branch-local task (IDs use lowercase letters, numbers, underscores, or hyphens):

```powershell
npm run content -- create-task --project rejoice --task content_rejoice_sleep_001 --audience "Adults looking for a calm place to begin" --topic "How can I settle before sleep?" --platform instagram --hypothesis "A concrete nightly question will earn more saves than generic encouragement." --success-metrics impressions,saves,profile_visits
```

Register a topic, then a published post:

```powershell
npm run content -- register-topic --project rejoice --topic-id topic_sleep_night_routine --title "How to settle before sleep" --cluster sleep-and-rest --intent informational --source research

npm run content -- register-post --project rejoice --post-id post_2026_08_rejoice_001 --topic-id topic_sleep_night_routine --platform instagram --status published --canonical-url "https://www.instagram.com/p/REAL_ID/" --published-at "2026-08-18T16:00:00-04:00" --task-id content_rejoice_sleep_001
```

Register the experiment and append a performance snapshot. In PowerShell, wrap JSON in single quotes:

```powershell
npm run content -- register-experiment --project rejoice --experiment-id exp_rejoice_sleep_question_001 --topic-id topic_sleep_night_routine --post-id post_2026_08_rejoice_001 --hypothesis "A concrete nightly question will earn more saves than generic encouragement." --success-metrics impressions,saves,profile_visits --window-days 30 --status running

npm run content -- append-performance --project rejoice --post-id post_2026_08_rejoice_001 --experiment-id exp_rejoice_sleep_question_001 --platform instagram --metric-date 2026-09-17 --metrics '{"impressions":1200,"saves":42,"profile_visits":19}' --source manual_import
```

Validate identifiers, schemas, duplicate URLs, and cross-record references:

```powershell
npm run content -- validate
npm run test:content
```

## Promoting a learning

1. Record the evidence and hypothesis outcome in the task's `results.md`.
2. Write the bounded lesson in `retrospective.md`.
3. Add it to only that project's `content-learnings.md`, including evidence IDs, confidence, and conditions.
4. Mark the promotion checkbox in the retrospective.

Retrospectives are evidence; they are not canonical guidance until this explicit promotion occurs.

## Adding a project

1. Choose the existing Trellis branch slug as `project_id` when one exists.
2. Scaffold its isolated strategy and canonical memory:

   ```powershell
   npm run content -- create-project --project atlurbanfarms --name "ATL Urban Farms"
   ```

3. Replace the generated strategy prompts with project-specific audience, positioning, voice, and channel guidance. Do not copy another branch's strategy.
4. Run `npm run content -- projects` and `npm run content -- validate --project <project-id>`.

The helper discovers partitions from `knowledge/projects/`; there is intentionally no global project registry that can drift from the directory structure.
