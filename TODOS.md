# TODOs

Organized by what blocks mom seeing something better.

---

## Blockers for showing mom

### 1. Paste `ANTHROPIC_API_KEY` into `.env.local`
Without it, the CHRONICLE tab shows a clean error banner. With it, narratives stream word-by-word.

### 2. Confirm kinship labels are correct
Currently `MOM_GEDCOM_ID` defaults to the first INDI record (`@I_348814644@` → Lesa Michelle Kingsbury). If that's not actually mom:
1. Grep the GEDCOM for her name / approximate birth year
2. Set `MOM_GEDCOM_ID` in `.env.local`
3. Run `npm run build-data` to rebuild entities.json with the new anchor

### 3. Fix male/female in kinship labels
`lib/kinship.ts` currently defaults anyone without an explicit `SEX M` tag to female, so all male ancestors render as "grandmother" instead of "grandfather." Most of the tree is tagged, but anyone untagged is mislabeled. Fix: respect `sex === 'M'` strictly, only fall back when sex is literally missing.

### 4. Geocode the 597 unknown places
The keyword gazetteer in `lib/geocode.ts` covers common US + UK + Ireland + mainland Europe regions. Anything not in the gazetteer rendered as `{lat: null, lng: null}` and doesn't appear on the map. Fix: sign up for LocationIQ or OpenCage free tier, write `scripts/geocode.ts` that reads the cache + backfills the missing ones + writes `public/data/places.json` with the merged results, then update the build to read from that file instead of the keyword matcher.

---

## Architecture follow-ups (from eng review)

### 5. Trim the 5MB initial payload
Right now `app/page.tsx` inlines the full `entities.json` into the RSC payload on every request. Works on desktop, will feel slow on iPad.
Fix options (pick one):
- Expose `/api/entities` that serves the JSON with Cache-Control; client fetches on mount
- Split entities into per-century shards, client loads on demand as slider moves
- Strip down what's passed to the client on first paint (ID + name + dates only; full record on dot click)

### 6. Write the 17 critical-path tests
Eng review mandated these before v1 "ships." Currently zero tests exist.
- `__tests__/privacy.test.ts` — 8 tests, one per rule, with a fixture tree exercising each rule-ordering decision (living override beats DEAT, explicit DEAT beats era rule, era rule saves pre-1700, default redacts moderns)
- `__tests__/kinship.test.ts` — labelFor for self / mother / 5x-great-grandmother / 15g-grandmother / 4th cousin / disconnected; descentPath shortest + multi-path flag
- `__tests__/arc-clip.test.ts` — slider Y below all RESI → no arc; partial Y → clipped polyline; no interpolation past Y
- `__tests__/leaflet-ssr.test.ts` — renders MapApp via RTL without `window is not defined`
- Shared-password middleware redirect
Set up with `vitest`. `npm run test` already wired.

### 7. Narrative cache
`/api/narrative` regenerates every click. Cache key should be `(eventId, gedcom-version-hash)`. Store in Upstash Redis or a local filesystem cache at `~/.gstack/cache/narratives/`. Invalidates deterministically when the tree rebuilds.

### 8. Citation validation + retry
The prompt requires Claude to emit `[person:@Ixxx@:FIELD]` tokens on every factual claim. The client parses them. But the server doesn't validate that every factual sentence has a citation — so if Claude forgets one, it just renders as text. Fix: server-side post-stream validator that re-requests with a stricter prompt if any sentence-level claim lacks a token. One retry. If second attempt fails, prepend a warning banner.

### 9. Build-time smoke test
Add to `scripts/build-data.ts`: fail the build with non-zero exit if `ruleCounts.get(7) === 0` (zero living-default redacts). Mom's tree has living relatives; zero redacts means the filter is broken. Currently this only warns.

### 10. Boot-time Claude API health check
On first API request (or server boot), ping Claude with a 1-token call. If 401, set a banner flag on all narrative routes: "Narrative features temporarily unavailable." Better than the current hard error.

---

## Interaction polish

### 11. iPad portrait sidebar
CSS for the slide-in sidebar below 1024px exists but isn't wired. When a dot is clicked on a narrow viewport, the sidebar needs to toggle the `.open` class; Escape / swipe-right-edge to dismiss.

### 12. 24×24 invisible hit targets on dots
Dots are 5–9px visual. Apple HIG minimum touch is 44pt ≈ 11mm. Wrap each circle marker in a transparent 24px zone so mom's finger can hit them on iPad.

### 13. Share button on person card
Spec'd in the design doc: copy-PNG-to-clipboard of the current card + map state. Use `html-to-image` + `navigator.clipboard.write` with a ClipboardItem. Two-line toast on success.

### 14. First-visit hint auto-dismiss
Works (dismisses on first slider drag), but doesn't persist — mom reopens the app tomorrow and sees the hint again. Write to `localStorage`.

---

## New features (roadmap: v2, v2.5, v4)

### 15. On-this-day daily card (v2)
Design + data structure already spec'd. New route: `/today`. Reads Upstash rotation-state. Picks an unseen ancestor whose MM-DD matches today. Renders the person-card with "On this day, 1804" eyebrow. Gets to rotate through 365 + a full cycle before reset.

### 16. Line-of-descent viewer (v2.5)
New route: `/descent/:ancestorId`. Uses `kinship.descentPath()` already written. Renders the chain mom → ... → ancestor as a vertical ladder of person-cards. Annotate "also reachable via other paths" if `multiplePaths` is true.

### 17. Stories-oracle (v4)
Blocked on the Ancestry media ZIP. Once you download it:
- Extract the 375 story files (html/pdf/docx/rtf/txt)
- Sample 5 story PDFs: if they're text-layer, parse with `pdf-parse`; if scanned images, plan for paid OCR (Adobe/Azure/Mathpix)
- Chunk at 750 tokens with 100-token overlap, preserving headings
- Embed with Voyage AI (Anthropic's recommended partner)
- Store chunk vectors at `public/data/stories/vectors.jsonl`
- New route: `/ask` — mom types a question, RAG retrieves top-N chunks + relevant ancestors from GEDCOM, Claude synthesizes cited answer

### 18. Ancestry media bundle integration
Same blocker as #17. Once downloaded:
- Extract images to `public/media/` (or CDN)
- Wire `person.media: [{ path, type, thumbnail? }]` into the loader
- Add a photo slot in `PersonCard` and in the line-of-descent ladder
- Image component: use `next/image` with eager loading for above-the-fold, lazy for the rest

---

## Ops & hygiene

### 19. Private URL + password gate
Middleware spec'd in design.md but not built. Before sharing the link with mom (or anyone), write `middleware.ts` that checks a cookie against `SHARED_PASSWORD_HASH`, redirects to a `/gate` page if missing. Hash via bcrypt.

### 20. Deploy to Vercel
- `vercel deploy --prebuilt` (keeps GEDCOM off Vercel servers)
- Custom subdomain (maybe `tree.taub.family`)
- `robots.txt` disallow
- Vercel env vars: `ANTHROPIC_API_KEY`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `SHARED_PASSWORD_HASH`, `MOM_GEDCOM_ID`

### 21. Review auto-deceased-report.json
Build emitted `public/data/auto-deceased-report.json` with 299 people the era rules flipped to deceased without an explicit DEAT. Scan it for false positives (anyone born after 1906 who's still alive). Write overrides to `public/data/overrides.json` for the ones that are wrong.

### 22. WCAG contrast audit
Gold-on-cream is 3.2:1, fails AA for body text. Rule is "gold = decoration only" but the CHRONICLE event-card dates and a few other spots use `--gildfade` on cream which is still borderline. Audit with a contrast tool once the app looks right.

### 23. README — how to run it
Currently the README says what the app is but not how to start it. Add a section:
```bash
cp .env.local.example .env.local   # edit GEDCOM_PATH + MOM_GEDCOM_ID
npm install
npm run build-data                  # produces public/data/*.json from .ged
npm run dev
```

---

## Notes to future-Jake

- The wireframe in `docs/designs/wireframe.html` is the canonical visual reference. If something on the live site doesn't match the wireframe's feel, the live site is wrong.
- `DESIGN.md` has the full rule set (no component library, gold decoration only, no motion by default, etc.). Before reaching for any library (shadcn, Tailwind, anything), read DESIGN.md first.
- The three planning reviews (CEO / eng / design) are all archived in `docs/designs/`. If you forget why a decision was made, the "why" is in those docs. Every premise was challenged, every expansion was chosen, every edge case was named.
- Mom comes first. If something optimizes for generality-later over mom-delight-today, that's wrong for this stage.
