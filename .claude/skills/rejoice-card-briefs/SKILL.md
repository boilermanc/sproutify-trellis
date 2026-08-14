---
name: rejoice-card-briefs
description: Writes Card Studio briefs for the Rejoice brand (letsrejoice.app — "Bible study for how you feel") that produce genuinely different messages instead of the same few headlines. Use whenever Clint asks for Rejoice card ideas, Instagram post concepts, headlines, overlay copy, a card batch, or says the Rejoice cards are repetitive or stuck in a rut. Also use before generating in Trellis → Card Studio with the Rejoice brand selected.
---

# Rejoice card briefs

Card Studio splits one job in two: a **creative director** (Gemini) writes the words, and a
**canvas renderer** draws them into a fixed layout. A brief only changes the words. Writing
design instructions into it is wasted breath — this skill is about spending every sentence on
the part that actually moves.

## What the brief controls

| Reaches the card | Ignored entirely |
|---|---|
| Headline (the big serif line) | Font choice — Playfair Display + Inter, fixed |
| Footer (tracked caps, one line) | Text position, alignment, margins |
| Eyebrow (small label above) | Scrim / gradient behavior |
| Instagram caption | Logo placement |
| Rationale (why this angle) | "The attached photo" — the model never sees an image |

With a **named direction** selected, the photo scene, wordmark and layout are also fixed, and
bullets are dropped. That is the mode to use when the look is already right and only the
message needs to change. With **Standard Card Studio**, the brief additionally drives template
choice (all 8 are open for Rejoice), palette, and bullets.

Hard limits worth writing to:
- **Footer: ~6 words / 40 characters.** It is drawn as one un-shrunk tracked-caps line; longer
  copy is discarded and replaced by the direction's stock footer.
- **Headline: one line, ideally under ~45 characters.** It auto-shrinks, so a long one renders —
  just smaller and weaker.
- **Batch size is 1–6.** For more, generate twice with different angles.

## The rut, and how to get out of it

The failure mode is always the same: a vague brief ("motivational posts about joy") gives the
model nothing to differentiate on, so it converges on the safest line every time — and every
batch reads like the last one.

A brief breaks the rut when it names a **message space and an axis of variation**. Every good
Rejoice brief has three parts:

1. **The situation** — a specific moment, feeling, or objection. Not "peace." *"The Sunday night
   before a week you're dreading."*
2. **The axis** — what must differ between the cards. Entry point, objection, time of day,
   who's speaking, what's being refused.
3. **The refusal** — one thing to avoid, because Rejoice's failure mode is generic warmth.
   *"None of these may use the words peace, journey, or grace."*

Banning the brand's own comfort words is the single highest-leverage line you can write.

### Axes that reliably produce six different cards

- **Objection** — "I don't have time" / "I won't understand it" / "I've tried apps like this"
- **Entry point** — never opened a Bible / raised in it and left / reads daily already
- **Emotional state** — behind, numb, restless, grateful, angry, relieved
- **Moment in the day** — 6am, the commute, the 3pm slump, after the kids are down, 2am
- **What the card refuses to do** — doesn't promise, doesn't instruct, doesn't comfort, just names
- **Grammatical form** — a question, a permission, a confession, a plain statement, an invitation

Pick one axis per batch. Two axes at once muddies both.

## Voice

Rejoice starts with **how you feel**, not with what you should do. The app meets people where
they are and moves toward scripture — never the reverse, and never as a reward for readiness.

- Warm and direct. Never chirpy, never solemn.
- Permission over instruction. "You don't have to feel ready" beats "Start your journey today."
- Name a specific feeling. "Peace" is a category; "the dread before a week you don't want" is a
  feeling.
- No guilt, no shame, no implied spiritual scoreboard.
- No promise of transformation, and no claim about what scripture will do for someone.

Avoid in copy: *journey, unlock, transform, dive in, your best life, let go and let God.*

## Directions (the fixed visual, when one is selected)

| Direction | The scene it locks in | Use it for |
|---|---|---|
| Joy Worth Noticing | Friends laughing, warm late-afternoon light | Gratitude, celebration, ordinary delight |
| Curious About Scripture | Study table, open Bible, tea, morning light | Questions, discovery, going deeper |
| Everyday Wisdom | Kitchen table, journal, lived-in home | Faith applied to work, relationships, choices |
| Growing in Faith | Sunlit garden path, moving forward | Habits, steady growth, starting again |
| Peace for Today | Reading corner, blanket, plant, late morning | Rest, presence, breathing room |
| When Life Feels Heavy | One friend quietly present with another | Hard days — support without melodrama |

Choosing one direction and generating 6 gives six different messages on the same card. Choosing
**Variety pack** cycles all six scenes across the batch.

## Scripture

The director may **pick** a verse reference; it may never **write** verse text. The exact
wording is fetched server-side from a licensed Berean Standard Bible source. So:

- Never put verse wording in a brief and expect it on the card.
- Never request a translation — BSB is the only one wired up.
- Naming a passage you want is fine ("something from Psalms about waiting").
- Verse cards need a connected Bible source and the Scripture control set to Mix or Require.
- A verse must genuinely fit the card's emotion. A forced fit reads worse than no verse.

## Writing the brief

Give Clint a brief in this shape, ready to paste:

```
[Count] headlines for [specific situation].

Each one must be a different [axis]: [item], [item], [item], [item].

[Refusal — words or moves that are off-limits.]

Footers: 6 words max, and each should [do something specific — name the next
step, not repeat the headline].
```

### Worked examples

```
Six headlines for someone who has decided they're too far behind to start.

Each one a different reason they believe that: they've missed too much,
they tried and quit, everyone else seems fluent, they don't know where to
begin, they think you need to feel something first, they're waiting to be
a better person.

None may use the words journey, grace, or peace, and none may promise
anything. Each just names the belief and sets it down.

Footers: 6 words max, each naming a concrete first move.
```

```
Five headlines for the week after a holiday — the letdown, the mess, the
back-to-normal dread.

Each one a different time of day: the first alarm, the commute, the 3pm
slump, dinner nobody wants to cook, lying awake at 1am.

Warm, not chirpy. No card may mention the holiday itself, and none may
tell the reader to do anything.

Footers: 6 words max.
```

```
Six headlines that answer an objection instead of making a promise.

Objections: no time, won't understand it, tried apps like this, not
religious enough, don't want to be preached at, doesn't feel like the
right season.

Each headline must concede the objection before answering it. No card
may begin with "You".

Footers: 6 words max.
```

## Before handing the brief over

- Does it name a specific situation, not a category?
- Is there an explicit axis with the variants listed out?
- Is there at least one refusal — a banned word or move?
- Does it stay off design (fonts, position, scrim, "the photo")?
- Are footers constrained to ~6 words?
- Does the count match how many variants the axis actually has?

## Related

For campaign strategy, channel choice, ASO, or what to work on this week, use the
`rejoice-gtm-playbook` skill instead — this skill only writes Card Studio briefs.
