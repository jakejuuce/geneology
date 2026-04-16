# Geneology

A private web app for exploring a family tree across a thousand years of history.

## What it does

Built on top of a GEDCOM export from Ancestry.com. Features:

- **Time-scrubber map** — drag a year from 1400 to today, watch ancestors light up on the map. Migration arcs show the family moving across centuries.
- **On-this-day** — a daily moment with one ancestor whose birthday, wedding, or death happened on today's date in history.
- **Event narrative** — pick a historical event (Civil War, Plague of London, etc.) and get an LLM-generated narrative of what the family was doing, grounded in the tree's cited sources.
- **Line of descent** — pick any ancestor and see the exact chain from you to them, every person clickable.
- **Stories oracle** (Phase 2) — ask anything, get answers grounded in the tree plus the digitized family stories Ancestry has attached.

## Docs

- `docs/designs/design.md` — the implementation spec (data layer, features, edge cases)
- `docs/designs/ceo-plan.md` — the scope-expansion layer built on top of the design (accepted expansions, revised premises, version roadmap)

Start with `ceo-plan.md` for the "why." Fall back to `design.md` for the "how."

## Status

Pre-implementation. Design + CEO plan complete. Both documents passed 3 rounds of adversarial spec review each.
