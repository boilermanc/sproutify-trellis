# Trellis Content Intelligence — What It Does and How to Use It

> Start here if you are wondering, “What did we build, and what am I supposed to do with it?”

**In the app:** **Content Studio → Content Intelligence**

**Current operating status:** Live

**Reminder schedule:** Daily at 8:00 AM Eastern through n8n

## The short version

Content Intelligence turns content publishing into a repeatable learning system.

Normally, a team publishes a post, checks the numbers later, and eventually forgets why the post was made or what the result meant. Content Intelligence keeps that chain intact:

```text
Audience question
      ↓
Content task and hypothesis
      ↓
Real published asset
      ↓
Measured performance
      ↓
Human-reviewed result
      ↓
Reusable learning for that branch
```

It does **not** publish content by itself, invent performance data, or automatically declare that an idea worked. It connects the real published post to real measurements and requires a person to approve the conclusion.

## Why this exists

Content Intelligence answers five questions that are usually scattered across notes, social platforms, and people’s memories:

1. What audience question were we trying to answer?
2. What did we publish?
3. What did we expect to happen?
4. What actually happened?
5. What should we reuse, avoid, or test again?

The result is project-specific institutional memory. Rejoice can learn what works for Rejoice without contaminating Rekkrd, ATL Urban Farms, or another branch with assumptions that may not apply there.

## The most important rule: choose the correct project

Every topic, asset, experiment, performance event, and learning belongs to one project partition.

- All branches use the same workflow.
- Each branch keeps separate strategy, evidence, and learnings.
- Nothing is automatically copied from one branch to another.
- A new branch works after its own Content Intelligence partition is created.

Always check the **Project** selector at the top of the page before doing anything. If a branch is not in the selector, it still needs its initial project partition. See [Adding another branch](#adding-another-branch).

## What each tab does

| Tab | What it is for | What you do there |
|---|---|---|
| **Overview** | Snapshot of the selected project | Check counts, topic landscape, open questions, and branches still needing setup |
| **How It Works** | In-app quick guide | Review the lifecycle and operating rules |
| **Topics** | Durable audience questions | See the questions the branch is intentionally creating content around |
| **Assets** | Real published content registry | Review Scheduler publications, confirm the topic and real public URL, then approve registration |
| **Experiments** | Hypotheses and review deadlines | Register an approved asset as an experiment, define success, and later classify the result |
| **Performance** | Append-only measurement history | Review imported social snapshots and refresh after provider syncs |
| **Learnings** | Evidence-backed project memory | Promote a reviewed result into a reusable learning after selecting supporting evidence |
| **New Task** | Planning starter | Generate a command that creates the project-scoped research and drafting workspace |

## What is automatic and what still needs a person

### Trellis handles automatically

- Keeps records separated by project.
- Finds successful publications in Post Scheduler/Social Hub.
- Avoids registering the same Scheduler or external post twice.
- Imports available `social_post_insights` history for approved Scheduler assets.
- Calculates each experiment’s review date from the real publication time and evaluation window.
- Runs a daily review check at 8:00 AM Eastern.
- Sends one Slack reminder when a Hub-tracked experiment becomes due.
- Retries failed reminder delivery up to three times.
- Records the signed-in reviewer on approvals.
- Prevents a durable learning from being approved without evidence.

### A person must still decide

- Which branch owns the work.
- What real audience question the asset answers.
- Whether the public URL and publication are correct.
- What the hypothesis and success metrics should be.
- Whether the result was supported, mixed, unsupported, or inconclusive.
- What the evidence actually supports.
- Whether a finding is useful and durable enough to become project guidance.

That human gate is intentional. Trellis organizes evidence; it does not pretend correlation is a conclusion.

## The normal day-to-day workflow

### Step 1: Select the project

Open **Content Studio → Content Intelligence** and choose the branch in the **Project** selector.

Before continuing, ask: “If this becomes a reusable lesson, which brand should own it?” That is the project you should select.

### Step 2: Create or reuse an audience topic

A topic is a durable audience question—not just a headline.

Good topic:

> How can someone build a calmer evening routine?

Weak topic:

> Tuesday Instagram post

You can create a topic while approving a publication in **Assets**. If the question already exists in the selected project, reuse it rather than creating a near-duplicate.

### Step 3: Create the content task

Open **New Task** and enter:

- a stable task ID;
- the specific target audience;
- the question or topic;
- the destination platform;
- a measurable hypothesis;
- the metrics that would help evaluate it.

Copy the generated PowerShell command and run it from the repository. Trellis creates a working folder under:

```text
.trellis/tasks/<task-id>/
```

That folder contains the PRD, research, drafts, results, and retrospective. These are working documents, not yet durable project truth.

Example:

```powershell
npm run content -- create-task --project rejoice --task content_rejoice_evening_001 --audience "Adults seeking a calmer evening rhythm" --topic "How can someone build a calmer evening routine?" --platform instagram --hypothesis "A concrete three-step evening prompt will earn more saves than a general encouragement post" --success-metrics impressions,saves,profile_visits
```

### Step 4: Research, create, schedule, and publish

Do the actual research and creative work in the task folder. Publish through Social Hub/Post Scheduler or the external platform.

Content Intelligence does not replace the publisher. The platform and Scheduler remain authoritative for whether something was actually published.

### Step 5: Approve the real publication in Assets

After the post publishes:

1. Open **Assets**.
2. Find it under **Published assets awaiting canonical registration**.
3. Choose an existing topic or create the correct audience topic.
4. Paste the real public URL.
5. Optionally connect the task ID.
6. Review the generated post ID.
7. Select **Approve & register**.

Trellis then creates the approved topic/post relationship in the Hub and records who approved it.

If the post does not appear:

- confirm it shows as published in Post Scheduler;
- confirm the Scheduler branch matches the selected Content Intelligence project;
- select **Refresh**;
- check whether it was already registered.

Never paste a placeholder URL. A published asset must point to the real public content.

### Step 6: Register an experiment

Use an experiment when the post tests an expectation—not merely because it was published.

Open **Experiments** and complete:

- **Approved published asset:** the post being tested;
- **Experiment ID:** a stable identifier, such as `experiment_rejoice_evening_prompt_001`;
- **Measurable hypothesis:** what should happen and compared with what;
- **Success metrics:** comma-separated measurements;
- **Evaluation window:** how many days to wait before reviewing.

Then select **Register experiment**.

Example hypothesis:

> Compared with general encouragement posts, a concrete three-step evening prompt will produce a higher save rate over seven days.

This registration creates a durable due date. The experiment card will show whether the review is upcoming, due today, or overdue. **Hub tracked** means it participates in the live review and reminder workflow.

### Step 7: Review performance

Open **Performance**. Approved Scheduler assets automatically inherit every available social insight observation collected for that Scheduler record.

Select **Refresh snapshots** after an analytics-provider sync.

Important behavior:

- Performance is a history, not one editable total.
- New observations are appended.
- Older observations are not overwritten.
- The publisher/analytics provider remains the source of truth for raw metrics.
- Trellis preserves which post and experiment the observation belongs to.

### Step 8: Complete the experiment review

When the evaluation window closes, open **Experiments** and select **Review result**.

Choose one classification:

| Classification | Use it when |
|---|---|
| **Supported** | The declared evidence clearly supports the hypothesis |
| **Mixed** | Some evidence supports it, but important measures or segments disagree |
| **Unsupported** | The expected result did not occur |
| **Inconclusive** | Missing data, low volume, confounders, or execution problems prevent a sound conclusion |

Then write the observed result. Include the comparison, important numbers, and anything that weakens the conclusion.

Good summary:

> Seven-day save rate was 3.8% versus the recent general-encouragement baseline of 2.1%. Reach was similar, but this was posted two hours later than the baseline set, so timing remains a possible confounder.

Weak summary:

> It did well.

Select **Complete review**. The experiment is now eligible for learning promotion.

### Step 9: Promote a durable learning

Not every experiment deserves to become guidance. Promote a learning only when it can help a future decision.

Open **Learnings** and:

1. Choose the reviewed experiment.
2. Enter a stable learning ID.
3. Write the bounded finding—no broader than the evidence allows.
4. Select a confidence level.
5. Describe the conditions and limitations.
6. Explain how to apply or retest it.
7. Select one or more performance events as evidence.
8. Select **Approve durable learning**.

Example:

```text
Finding:
Concrete multi-step evening prompts produced a higher seven-day save rate than
general encouragement in this Rejoice Instagram comparison.

Confidence:
Medium

Conditions:
Rejoice Instagram audience; comparable organic posts; limited to one experiment;
posting time differed.

How to apply or retest:
Use a concrete step sequence in the next two evening-routine posts while rotating
posting time, then compare save rate again.
```

The approved learning stays inside the selected project. It does not silently become a rule for other branches.

## A complete worked example

| Record | Example |
|---|---|
| Project | `rejoice` |
| Topic | “How can someone build a calmer evening routine?” |
| Task | `content_rejoice_evening_001` |
| Published asset | Real Instagram post approved from Scheduler |
| Experiment | `experiment_rejoice_evening_prompt_001` |
| Hypothesis | Concrete three-step prompt will improve seven-day save rate |
| Metrics | Impressions, saves, save rate, profile visits |
| Window | 7 days |
| Result | Mixed |
| Evidence | The immutable seven-day social insight snapshot |
| Learning | Concrete steps appear promising; retest while controlling posting time |

The important point is that the final learning can be traced back to the original question, asset, expectation, and evidence.

## Review reminders

The live n8n workflow is named:

```text
Trellis: Content Experiment Review Reminders
```

It runs daily at **8:00 AM Eastern** and calls the protected Supabase Edge Function `content-review-reminders`.

For each due Hub-tracked experiment, it:

1. creates one reminder queue record;
2. posts the reminder to the Slack webhook configured in Trellis;
3. marks successful delivery;
4. retries a failed delivery up to three times with backoff.

It does not send repeated daily Slack messages for the same experiment. The unique experiment reminder is idempotent.

If reminders are not arriving, check:

1. the experiment is **Hub tracked** and still **running**;
2. its due date has arrived;
3. the n8n workflow is active;
4. the **Sproutify Trellis** Supabase credential is connected to the HTTP node;
5. `tenant_secrets.slack_webhook` is configured;
6. the n8n execution history and reminder queue error.

## When a screen is empty

### “No topics registered”

No durable audience questions exist for the selected project yet. Approve a publication and create its topic, or use the CLI registration command.

### “No eligible asset yet” in Experiments

Experiments only accept a published Scheduler asset that a person approved in **Assets**. Approve the publication first.

### “No experiments registered”

No approved asset has been registered as a Hub experiment for this project. Complete the form at the top of **Experiments**.

### “No performance history”

The approved asset has no collected insight snapshots yet. Confirm the platform’s insights sync has run, then select **Refresh snapshots**.

### “No eligible experiment yet” in Learnings

The experiment must be reviewed, linked to an approved Scheduler asset, and have performance evidence. Complete the review in **Experiments**, then return to **Learnings**.

### A branch is missing from the project selector

The branch exists in Trellis but does not yet have a Content Intelligence partition. Create it using the command shown on **Overview**.

## Adding another branch

The system is not limited to Rejoice and Rekkrd. Those are simply the currently configured partitions. Any Trellis branch can use the same system after receiving its own project files.

From the repository:

```powershell
npm run content -- create-project --project atlurbanfarms --name "ATL Urban Farms"
```

This creates empty, isolated knowledge/spec files for the branch. Next:

1. write the branch’s actual content strategy;
2. write its SEO/social rules;
3. document its initial topic landscape and open questions;
4. run validation;
5. commit and deploy the partition.

Do not copy another branch’s strategy as if it were established truth.

## Where the information lives

Trellis uses two complementary forms of storage.

### Hub records: live operating state

The Hub stores orchestration records such as:

- approved content topics and posts;
- running/reviewed experiments;
- review deadlines;
- reminder delivery state;
- approved learnings and their evidence references.

It does **not** turn Trellis into a customer-profile warehouse. The federated data rule still applies.

### Repository files: versioned working and canonical knowledge

| Location | Purpose |
|---|---|
| `.trellis/tasks/<task-id>/` | Research, drafts, results, and retrospective for one working task |
| `.trellis/knowledge/projects/<project-id>/` | Versioned topics, posts, experiments, and performance history |
| `.trellis/spec/projects/<project-id>/` | Project strategy, channel rules, and exported durable learnings |
| `.trellis/spec/content-system/` | Mechanics shared by every project |

The live Hub workflow is the easiest operating path. Use repository export/versioning when a learning must also live in Git history. Automatic Hub-to-Markdown export is not built yet.

## CLI fallback and maintenance commands

Most daily operation now happens in the app. These commands remain useful for project setup, unsupported providers, and versioned records.

Create a project:

```powershell
npm run content -- create-project --project <branch-slug> --name "Branch Name"
```

Create a task:

```powershell
npm run content -- create-task --project <project-id> --task <task-id> --audience "Specific audience" --topic "Audience question" --platform instagram --hypothesis "Measurable expectation" --success-metrics impressions,saves,clicks
```

Register a topic directly:

```powershell
npm run content -- register-topic --project <project-id> --topic-id <topic-id> --title "Audience question" --cluster <cluster> --intent informational --source research
```

Register a published post directly:

```powershell
npm run content -- register-post --project <project-id> --post-id <post-id> --topic-id <topic-id> --platform instagram --status published --canonical-url "https://real-public-url" --published-at "2026-08-19T12:00:00-04:00" --task-id <task-id>
```

Register a versioned experiment:

```powershell
npm run content -- register-experiment --project <project-id> --experiment-id <experiment-id> --topic-id <topic-id> --post-id <post-id> --hypothesis "Measurable hypothesis" --success-metrics impressions,saves,clicks --window-days 7 --status running
```

Append a manual provider snapshot:

```powershell
npm run content -- append-performance --project <project-id> --post-id <post-id> --experiment-id <experiment-id> --platform instagram --metric-date 2026-08-26 --metrics '{"impressions":1200,"saves":42,"profile_visits":19}' --source manual_import
```

Validate the complete versioned registry:

```powershell
npm run content -- validate
npm run test:content
```

## Good operating habits

- Start with a question, not a content format.
- Declare the hypothesis and metrics before the result is known.
- Use the real public URL and publication time.
- Treat every metric observation as immutable history.
- Record confounders instead of forcing a clean success/failure story.
- Use **Inconclusive** when the evidence cannot support a decision.
- Promote narrow findings; broad claims require broader evidence.
- Retest medium-confidence findings.
- Never move a learning into another project without new evidence in that project.

## What this system deliberately prevents

- Mixing one brand’s content strategy into another branch.
- Calling an unpublished draft a real asset.
- Inventing canonical URLs or publication dates.
- Overwriting old performance snapshots with newer totals.
- Reviewing an experiment that cannot be traced to a real approved asset.
- Approving a durable learning without cited performance evidence.
- Letting AI silently decide what the business learned.

## What is not finished yet

The core closed loop is functional. The remaining enhancements are:

1. automatic analytics imports from additional providers beyond the currently collected social insights;
2. optional export/synchronization of approved Hub learnings back into versioned project Markdown;
3. additional project partitions and real strategy files as new branches adopt the workflow.

## One-page checklist

Before publishing:

- [ ] Correct project selected
- [ ] Audience question is clear
- [ ] Task created
- [ ] Hypothesis is measurable
- [ ] Success metrics chosen

After publishing:

- [ ] Real publication appears in Assets
- [ ] Correct topic selected or created
- [ ] Real public URL confirmed
- [ ] Asset approved and registered
- [ ] Experiment registered if the asset tests a hypothesis

At review time:

- [ ] Performance snapshots available
- [ ] Result compared with the original hypothesis
- [ ] Confounders recorded
- [ ] Experiment classified and reviewed
- [ ] Durable learning promoted only if evidence supports future use

That is the entire system: **plan intentionally, register reality, measure without overwriting history, review honestly, and retain only what the evidence earns.**
