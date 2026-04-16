# DESIGN.md — Geneology Visual System

## Voice

Archive meets heirloom. A leatherbound family atlas opened at a kitchen table, not a SaaS dashboard.

Never: SaaS, startup-y, shadcn-default, purple gradient, card grid, centered-everything, 3-column feature row, emoji as UI, decorative blobs, wavy dividers, bubbly radius, "clean modern UI."

Always: warm tones, serif typography, gold as decoration, room for the text to breathe, gravitas without pomp. Feels made, not generated.

## Tokens

```css
:root {
  /* Parchment family */
  --cream:     #F1E6D2;  /* page background */
  --parchment: #E8D9BC;  /* sidebar, elevated surfaces */
  --aged:      #C8B58D;  /* map wash */

  /* Ink family */
  --brown:     #3D2817;  /* body text */
  --deep:      #2B1A0D;  /* headings, strong text */
  --ink:       #1A0F07;  /* darkest, rare */

  /* Gold family — DECORATION ONLY (fails WCAG AA on body) */
  --gold:      #A68835;  /* primary decoration */
  --goldlite:  #C9A962;  /* hairlines, inner frames */
  --gildfade:  #8A6F28;  /* disabled, tertiary text larger than 18pt */

  /* Accents */
  --oxblood:   #6B2E2B;  /* selected state, kinship label */
  --forest:    #3D4D3A;  /* reserved */
  --seaink:    #273244;  /* reserved */
}
```

## Typography

- **Cinzel** (Google Fonts) — display caps, year labels, section headings. Weights 500/600/700. Tracking `0.1em` to `0.35em`.
- **Cormorant Garamond** (Google Fonts) — body, kinship labels (italic), prose. Weights 400/500, italic 400/500.

No Inter, Roboto, Arial, system-ui, or any default sans-serif. The serif IS the design.

## Rules

- Hairlines: 1px at `--goldlite`. Double rules: 3px at `--gold`.
- Motion: none by default. Slider responds instantly. Narrative streams word-by-word. No entrance animations on any UI. Speed as craft.
- Radius: 0–2px. The brass slider handle is the only circle in the UI.
- Shadows: none, except on the brass handle (tactile detail). No decorative shadows anywhere else.
- Icons: none. Decorative `❦` fleuron and filigree SVG only.
- Gold touches: filigree corners, hairline rules around surfaces, brass slider handle, cartouche border around the year caption. Never as body text color.

## Component library

None. Zero. Don't install shadcn, Material UI, Chakra, Radix, Headless UI. Ship plain semantic HTML + project CSS. Every component library's defaults are AI-slop vectors that break this aesthetic.

## Responsive

- **Desktop (≥1024px wide):** map + sidebar always visible side-by-side.
- **iPad portrait (<1024px):** sidebar slides in from the right on dot-select. Swipe-from-right-edge or Escape dismisses. Map expands to full width when sidebar is closed.
- Minimum tap targets: 44pt for mom's finger. Visual dots are 9px but wrapped in 24×24px hit areas.

## Accessibility

- Body copy contrast: `--brown` on `--cream` ≈ 12:1 (passes AAA).
- `--gold` on `--cream` ≈ 3.2:1 — **decoration only**, never body text, never buttons requiring AA.
- Focus ring: `--gold` 2px outline with 2px offset. Browser default blue is banned.
- Keyboard nav: full support. Arrow keys navigate sidebar (up = parent, down = firstborn child, left/right = siblings). Escape closes mobile sidebar. Tab order respects visual order.

## Visual reference

`docs/designs/wireframe.html` is the canonical visual reference. Every component should match or extend this aesthetic. If a new UI element feels like it doesn't belong next to the wireframe, it doesn't belong.
