---
name: rekkrd-card-briefs
description: Writes Card Studio briefs for the Rekkrd brand (rekkrd.com, @rekkrdapp — vinyl collection management with two-way Discogs sync) that produce genuinely different messages instead of the same few headlines. Use whenever Clint asks for Rekkrd card ideas, Instagram post concepts, headlines, overlay copy, a card batch, or says the Rekkrd cards are repetitive. Also use before generating in Trellis → Card Studio with the Rekkrd brand selected.
---

# Rekkrd card briefs

Card Studio splits one job in two: a **creative director** (Gemini) writes the words, and a
**canvas renderer** draws them into a fixed layout. A brief only changes the words. Rekkrd is
the more locked-down of the two styled brands — palette, fonts and template set are all fixed in
code — so the brief has exactly one job: the message.

## What the brief controls

| Reaches the card | Ignored entirely |
|---|---|
| Headline (the big serif line) | Font choice — Playfair Display + JetBrains Mono, fixed |
| Footer (tracked caps, one line) | Palette — near-black / warm ivory / burnt orange, **locked** |
| Eyebrow (small label above) | Text position, scrim, logo placement |
| Instagram caption | "The attached photo" — the model never sees an image |

Rekkrd's palette lock is absolute: whatever colors the director picks are discarded and the
approved set is applied verbatim. Don't spend a sentence on color.

**Templates are restricted** to `statement`, `editorial`, `stat`, `grid`. Asking for a
quote card, a numbered list, a chat thread or a verse card gets silently converted to a
statement — the accent orange can't stay controlled in those layouts. Write to the four that exist.

Hard limits:
- **Footer: ~6 words / 40 characters.** One un-shrunk tracked-caps line; longer copy is dropped
  and replaced by the direction's stock footer.
- **Headline: one line, ideally under ~45 characters.**
- **Batch size is 1–6.**
- Rekkrd has no Bible source, so scripture is force-disabled. Never reference it.

Rekkrd **defaults to Variety pack**, meaning a direction is applied unless Clint switches to
Standard Card Studio. With a direction on, the photo scene, wordmark and layout are fixed and
bullets are dropped — the message is the only variable.

## The rut, and how to get out of it

A vague brief ("posts about why Rekkrd is great") converges on the same product-marketing line
every time. Rekkrd's specific failure mode is **feature-listing**: sync, catalog, organize,
manage. Those are true and they are boring, and four cards saying them are one card.

Every good Rekkrd brief has three parts:

1. **The situation** — a real moment in collector life. Not "organizing your collection."
   *"Standing in a shop holding a record you might already own."*
2. **The axis** — what must differ between cards. Collector type, moment, friction, objection.
3. **The refusal** — the feature words that are off-limits for this batch. This is what forces
   the model off the marketing script.

### Axes that reliably produce four to six different cards

- **Friction** — duplicate buys, no idea what's at home, lost track after a move, shelf vs.
  spreadsheet drift, lending a record and never seeing it again
- **Collector type** — 80 records / 800 / inherited a collection / DJ / just started
- **Moment** — in the shop, at a fair, unpacking a delivery, a Sunday listening session, insuring it
- **Objection** — "Discogs already does this", "I don't need an app for this", "my spreadsheet
  is fine", "not worth cataloguing what I have"
- **What it refuses to be** — not a marketplace, not a social network, not a replacement for
  Discogs, not for completists only

Pick one axis per batch.

## Voice

Rekkrd is for people who take their collection seriously and don't want to be sold to. The tone
is **tactile, confident, unhurried** — a good record shop, not a SaaS landing page.

- Speak to the ritual, not the database.
- Respect Discogs. The positioning is *"Keep Discogs. Try Rekkrd."* — a companion with two-way
  sync, never a replacement. Never disparage it.
- Short and declarative. The layout gives the headline a lot of room; a long sentence wastes it.
- No hype, no exclamation marks, no "revolutionize / effortless / seamless."
- No fabricated numbers. The `stat` template needs a figure that is real (from the brief) or
  plainly rhetorical ("1" for one collection, two tools). Never invent a research-sounding stat.
- Never invent a URL, handle or domain. Only `rekkrd.com` and `@rekkrdapp`, and only if given.

## Directions (the fixed visual, when one is selected)

| Direction | The scene it locks in | Use it for |
|---|---|---|
| Vinyl Ritual | Hands lowering a record onto a turntable, evening light | The listening ritual, care, intention |
| Listening Room | A collector in a warm listening space, shelves behind | Lifestyle, belonging, the room itself |
| Collection Detail | Hands browsing a crate, paper sleeves, shallow focus | Texture, discovery, knowing what you own |
| Connected Collection | Overhead still life, two zones bridged by one record | Discogs two-way sync, one collection two tools |

Choosing one direction and generating 6 gives six different messages on the same card. Variety
pack cycles all four scenes across the batch.

## Writing the brief

Give Clint a brief in this shape, ready to paste:

```
[Count] headlines for [specific collector moment].

Each one a different [axis]: [item], [item], [item], [item].

[Refusal — the feature words that are banned for this batch.]

Footers: 6 words max, each [doing something specific].
```

### Worked examples

```
Five headlines for the moment you're standing in a shop, holding a record,
and can't remember if it's already on your shelf.

Each one a different collector: 80 records, 800 records, someone who just
inherited a collection, someone who moved last year, someone who buys with
a friend.

Banned words: sync, catalog, organize, manage, library. None of these may
describe the app at all — they describe the moment.

Footers: 6 words max, each naming what Rekkrd does about it.
```

```
Four headlines that answer "Discogs already does this."

Each one a different version of the objection: it's already my system,
I don't want two places, my data lives there, I don't trust a new app
with it.

Every card must concede the point before answering it, and none may
suggest leaving Discogs. Two-way sync is the answer, not replacement.

Footers: 6 words max.
```

```
Six headlines about the ritual, not the software.

Each one a different moment: choosing what to play, the drop of the needle,
side B, playing something for someone else, a record you've had since you
were 19, the one you keep meaning to replace.

No card may mention an app, a phone, a screen, or a feature. Rekkrd appears
only in the footer.

Footers: 6 words max.
```

## Before handing the brief over

- Does it name a specific collector moment, not a feature?
- Is there an explicit axis with the variants listed out?
- Are the feature words explicitly banned for this batch?
- Does it stay off design (color, fonts, position, scrim, "the photo")?
- If it asks for a `stat` card, is the figure real or plainly rhetorical?
- Does it stay within the four allowed templates?
- Is Discogs treated as a companion, never a competitor?
- Are footers constrained to ~6 words?
