// Build pipeline: GEDCOM → normalized entities → privacy filter → geocode → JSON artifacts.
//
// Reads GEDCOM_PATH from env. Writes to public/data/.
// Never touches CI — runs locally on Jake's machine only.

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parseGedcomFile,
  normalizeIndividual,
  normalizeSource,
} from '../lib/gedcom';
import { applyPrivacyFilter } from '../lib/privacy';
import { KinshipModule } from '../lib/kinship';
import { geocodePlaceWithJitter } from '../lib/geocode';
import type {
  Person,
  Source,
  EntityStore,
  DotAtYear,
  ArcPoint,
  Overrides,
} from '../lib/types';

const GEDCOM_PATH = process.env.GEDCOM_PATH;
const MOM_GEDCOM_ID = process.env.MOM_GEDCOM_ID;

if (!GEDCOM_PATH) {
  console.error('\n✗ GEDCOM_PATH not set. Copy .env.local.example to .env.local and set it.');
  process.exit(1);
}

const outDir = resolve(process.cwd(), 'public/data');
mkdirSync(outDir, { recursive: true });

console.log(`\n▶ Reading ${GEDCOM_PATH}`);
const parsed = parseGedcomFile(GEDCOM_PATH);
console.log(
  `  GEDCOM ${parsed.gedcomVersion} (${parsed.charset}) · sha256 ${parsed.version}`
);
console.log(
  `  ${parsed.individuals.size} individuals · ${parsed.families.size} families · ${parsed.sources.size} sources`
);

// Detect MOM_GEDCOM_ID: use env var, or fall back to first INDI (emit warning).
let momId = MOM_GEDCOM_ID?.trim();
if (!momId) {
  const firstIndi = parsed.individuals.keys().next().value;
  if (!firstIndi) {
    console.error('✗ No INDI records in GEDCOM.');
    process.exit(1);
  }
  momId = firstIndi;
  console.warn(
    `\n⚠ MOM_GEDCOM_ID not set. Using first INDI: ${momId}. ` +
      `If this is wrong, set MOM_GEDCOM_ID in .env.local.`
  );
}
if (!parsed.individuals.has(momId)) {
  console.error(`\n✗ MOM_GEDCOM_ID=${momId} not found in GEDCOM.`);
  console.error('  Check .env.local against the tree. First few INDI pointers:');
  const ids = Array.from(parsed.individuals.keys()).slice(0, 5);
  for (const id of ids) console.error(`    ${id}`);
  process.exit(1);
}

// Normalize everyone
console.log('\n▶ Normalizing individuals');
const allPeople: Person[] = [];
for (const indi of parsed.individuals.values()) {
  allPeople.push(normalizeIndividual(indi, parsed.families, parsed.sources));
}

// Normalize sources
console.log('▶ Normalizing sources');
const sourceMap: Record<string, Source> = {};
for (const sour of parsed.sources.values()) {
  const src = normalizeSource(sour);
  sourceMap[src.id] = src;
}

// Apply privacy filter
console.log('▶ Applying privacy filter');
const overrides: Overrides = {}; // TODO: load from public/data/overrides.json if present
const ruleCounts = new Map<number, number>();
const autoDeceasedReport: Array<{
  id: string;
  name: string;
  rule: number;
  birthYear: number | null;
  triggerEvent?: string;
}> = [];

const filtered: Person[] = [];
for (const person of allPeople) {
  const { person: result, rule } = applyPrivacyFilter(person, overrides);
  ruleCounts.set(rule, (ruleCounts.get(rule) ?? 0) + 1);
  filtered.push(result);
  if (rule === 5 || rule === 6) {
    autoDeceasedReport.push({
      id: person.id,
      name: person.name,
      rule,
      birthYear: person.birth?.date?.year ?? null,
      triggerEvent:
        rule === 6
          ? person.events.find((e) => e.date?.year)?.type
          : undefined,
    });
  }
}

// Build-time smoke test: if NOBODY is redacted, privacy filter is broken.
const redactedCount = ruleCounts.get(1) ?? 0;
const privTagCount = ruleCounts.get(4) ?? 0;
const defaultRedactedCount = ruleCounts.get(7) ?? 0;
const totalRedacted = redactedCount + privTagCount + defaultRedactedCount;
console.log(`  Privacy filter rule counts:`);
for (const [rule, count] of Array.from(ruleCounts).sort((a, b) => a[0] - b[0])) {
  console.log(`    Rule ${rule}: ${count}`);
}

if (totalRedacted === 0) {
  console.warn(
    `\n⚠ WARNING: 0 people redacted by privacy filter. ` +
      `Mom's tree likely includes living relatives — this is suspicious. ` +
      `Review the filter logic before sharing.`
  );
}

// Geocode places (keyword matcher for v1; real geocoder is a separate run)
console.log('▶ Geocoding places (keyword matcher)');
let geocodedCount = 0;
let unknownCount = 0;
for (const person of filtered) {
  for (const ev of [person.birth, person.death, ...person.events]) {
    if (!ev || !ev.place) continue;
    const coded = geocodePlaceWithJitter(ev.place.label, person.id);
    ev.place.lat = coded.lat;
    ev.place.lng = coded.lng;
    if (coded.lat != null) geocodedCount++;
    else unknownCount++;
  }
}
console.log(`  Geocoded ${geocodedCount} events; ${unknownCount} places unknown (see keyword gazetteer)`);

// Build entity store
const byCentury: Record<string, number> = {};
for (const p of filtered) {
  if (p.isLiving) continue;
  const y = p.birth?.date?.year;
  if (y == null) continue;
  const c = `${Math.floor(y / 100) + 1}00s`;
  byCentury[c] = (byCentury[c] ?? 0) + 1;
}

// Sanity-check kinship module builds without throwing (validates momId is in tree)
console.log(`▶ Validating kinship module with momId=${momId}`);
const kinship = new KinshipModule(filtered, momId);
const momLabel = kinship.labelFor(momId);
console.log(`  Mom resolved: ${momLabel.label} (${momLabel.kind})`);
// Sample a few kinship labels for spot-check
const sample = filtered.filter((p) => !p.isLiving).slice(0, 5);
for (const p of sample) {
  const k = kinship.labelFor(p.id);
  console.log(`    ${p.name.slice(0, 40).padEnd(40)} → ${k.label} (${k.kind}, g=${k.generations})`);
}

const entityStore: EntityStore = {
  version: parsed.version,
  momId,
  generatedAt: new Date().toISOString(),
  people: filtered,
  sources: sourceMap,
  stats: {
    total: filtered.length,
    redactedLiving: totalRedacted,
    byCentury,
  },
};

// Pre-compute dotsByDecade for the map layer.
// Time-aware: for each decade a person was alive, pick the location from
// the most recent event ≤ decade-year. Handles migrants (born in one
// country, died in another) with a "migration at age 25" heuristic when
// only birth + death events exist.
console.log('▶ Pre-computing dotsByDecade (time-aware)');
const dotsByDecade: Record<string, DotAtYear[]> = {};
for (const person of filtered) {
  if (person.isLiving) continue;
  const birth = person.birth?.date?.year;
  const death = person.death?.date?.year;
  if (birth == null || death == null) continue;

  const timeline = buildPersonTimeline(person);
  if (timeline.length === 0) continue;

  const startDecade = Math.floor(birth / 10) * 10;
  const endDecade = Math.floor(death / 10) * 10;
  for (let d = startDecade; d <= endDecade; d += 10) {
    const loc = locationAtYear(timeline, d);
    if (!loc || loc.lat == null || loc.lng == null) continue;
    const key = String(d);
    if (!dotsByDecade[key]) dotsByDecade[key] = [];
    dotsByDecade[key].push({
      id: person.id,
      lat: loc.lat,
      lng: loc.lng,
      opacity: 1.0,
    });
  }
}

// Pre-compute arcsByPerson for migration paths
console.log('▶ Pre-computing arcsByPerson');
const arcsByPerson: Record<string, ArcPoint[]> = {};
for (const person of filtered) {
  if (person.isLiving) continue;
  const sequence: ArcPoint[] = [];
  const orderedEvents = [
    ...(person.birth ? [{ ...person.birth }] : []),
    ...person.events,
    ...(person.death ? [{ ...person.death }] : []),
  ]
    .filter((e) => e.date && e.place?.lat != null && e.place?.lng != null)
    .sort((a, b) => (a.date!.year - b.date!.year));
  for (const ev of orderedEvents) {
    sequence.push({
      year: ev.date!.year,
      lat: ev.place!.lat!,
      lng: ev.place!.lng!,
    });
  }
  if (sequence.length >= 2) {
    arcsByPerson[person.id] = sequence;
  }
}

// Write outputs
console.log('\n▶ Writing artifacts to public/data/');
writeFileSync(
  resolve(outDir, 'entities.json'),
  JSON.stringify(entityStore, null, 0)
);
console.log(`  entities.json (${entityStore.people.length} people)`);

writeFileSync(
  resolve(outDir, 'dotsByDecade.json'),
  JSON.stringify(dotsByDecade, null, 0)
);
console.log(`  dotsByDecade.json (${Object.keys(dotsByDecade).length} decades)`);

writeFileSync(
  resolve(outDir, 'arcsByPerson.json'),
  JSON.stringify(arcsByPerson, null, 0)
);
console.log(`  arcsByPerson.json (${Object.keys(arcsByPerson).length} trajectories)`);

writeFileSync(
  resolve(outDir, 'auto-deceased-report.json'),
  JSON.stringify(autoDeceasedReport, null, 2)
);
console.log(`  auto-deceased-report.json (${autoDeceasedReport.length} era-rule flips)`);

console.log('\n✓ Build complete.');
console.log(`  Births by century:`);
for (const [c, n] of Object.entries(byCentury).sort()) {
  console.log(`    ${c}: ${n}`);
}

// Use location precedence: most recent RESI ≤ death, else birth, else death
function locationAt(person: Person) {
  const birthPlace = person.birth?.place;
  const deathPlace = person.death?.place;
  const resiPlaces = person.events
    .filter((e) => e.type === 'RESI')
    .map((e) => e.place)
    .filter((p): p is NonNullable<typeof p> => p != null && p.lat != null && p.lng != null);
  if (resiPlaces.length > 0) return resiPlaces[resiPlaces.length - 1];
  if (birthPlace?.lat != null && birthPlace.lng != null) return birthPlace;
  if (deathPlace?.lat != null && deathPlace.lng != null) return deathPlace;
  return null;
}

// Build a time-ordered list of (year, place) waypoints for a person.
// Includes birth + all dated events + death, in year order.
// Applies a "migration at age 25" heuristic for people with only birth + death
// events when birth and death places differ.
interface Waypoint {
  year: number;
  place: NonNullable<Person['birth']>['place'];
  synthetic?: boolean;
}
function buildPersonTimeline(person: Person): Waypoint[] {
  const waypoints: Waypoint[] = [];

  const birthPlace = person.birth?.place;
  const birthYear = person.birth?.date?.year;
  if (birthYear != null && birthPlace?.lat != null && birthPlace.lng != null) {
    waypoints.push({ year: birthYear, place: birthPlace });
  }

  for (const e of person.events) {
    if (
      e.date?.year != null &&
      e.place?.lat != null &&
      e.place.lng != null &&
      e.type !== 'BIRT' &&
      e.type !== 'DEAT'
    ) {
      waypoints.push({ year: e.date.year, place: e.place });
    }
  }

  const deathYear = person.death?.date?.year;
  const deathPlace = person.death?.place;
  if (deathYear != null && deathPlace?.lat != null && deathPlace.lng != null) {
    waypoints.push({ year: deathYear, place: deathPlace });
  }

  waypoints.sort((a, b) => a.year - b.year);

  // Migration heuristic: only birth + death, differing places, no intermediate events.
  // Assume migration happened at age 25 (typical colonial pattern).
  if (
    waypoints.length === 2 &&
    birthYear != null &&
    deathYear != null &&
    waypoints[0]!.place!.label !== waypoints[1]!.place!.label &&
    deathYear - birthYear > 30 // only for people who lived long enough to migrate
  ) {
    const migrationYear = Math.min(birthYear + 25, deathYear - 1);
    waypoints.splice(1, 0, {
      year: migrationYear,
      place: waypoints[1]!.place,
      synthetic: true,
    });
  }

  return waypoints;
}

// Pick the location for a person at a given year. Uses the most recent
// waypoint with year ≤ Y, falling back to the first waypoint if Y is
// before everyone's events (shouldn't happen for a person alive at Y).
function locationAtYear(timeline: Waypoint[], year: number) {
  let current = null;
  for (const wp of timeline) {
    if (wp.year <= year) current = wp.place;
    else break;
  }
  return current ?? timeline[0]?.place ?? null;
}
