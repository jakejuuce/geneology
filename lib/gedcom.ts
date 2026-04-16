// Minimal GEDCOM 5.5.1 parser. UTF-8 only.
// Produces a nested tag tree from a .ged file, then normalizes into
// our Person / Source types.
//
// read-gedcom's selection API is powerful but navigates deeply-nested
// classes. For v1 we parse directly. Mom's file is 5.5.1 UTF-8 which is
// straightforward. If Ancestry ever exports 7.0, swap this module for
// read-gedcom's full selection tree.

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { LifeEvent, EventDate, Person, Source, Citation, Place } from './types';

export interface RawNode {
  level: number;
  tag: string;
  pointer?: string;
  value?: string;
  children: RawNode[];
}

export interface ParsedGedcom {
  version: string;           // sha256 of source file
  header: RawNode | null;
  individuals: Map<string, RawNode>;
  families: Map<string, RawNode>;
  sources: Map<string, RawNode>;
  gedcomVersion: string;     // 5.5.1, 7.0, etc.
  charset: string;           // UTF-8, ANSEL, etc.
}

// Parse a .ged file from disk into a typed record map.
export function parseGedcomFile(path: string): ParsedGedcom {
  const raw = readFileSync(path);
  const version = createHash('sha256').update(raw).digest('hex').slice(0, 16);
  const text = raw.toString('utf-8');
  const lines = text.split(/\r?\n/);

  // Parse all records at level 0 with their children.
  const records: RawNode[] = [];
  const stack: RawNode[] = [];
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line) continue;
    const parsed = parseLine(line);
    if (!parsed) continue;
    const node: RawNode = {
      level: parsed.level,
      tag: parsed.tag,
      pointer: parsed.pointer,
      value: parsed.value,
      children: [],
    };
    // CONC/CONT: append to previous node's value
    if ((node.tag === 'CONC' || node.tag === 'CONT') && stack.length > 0) {
      const parent = stack[stack.length - 1];
      if (node.tag === 'CONT') {
        parent.value = (parent.value ?? '') + '\n' + (node.value ?? '');
      } else {
        parent.value = (parent.value ?? '') + (node.value ?? '');
      }
      continue;
    }
    // Pop stack until we find the correct parent level
    while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
      stack.pop();
    }
    if (stack.length === 0) {
      records.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }
    stack.push(node);
  }

  const individuals = new Map<string, RawNode>();
  const families = new Map<string, RawNode>();
  const sources = new Map<string, RawNode>();
  let header: RawNode | null = null;
  let gedcomVersion = '5.5.1';
  let charset = 'UTF-8';

  for (const rec of records) {
    if (rec.tag === 'HEAD') {
      header = rec;
      const gedc = findChild(rec, 'GEDC');
      if (gedc) gedcomVersion = getChildValue(gedc, 'VERS') ?? '5.5.1';
      charset = getChildValue(rec, 'CHAR') ?? 'UTF-8';
    } else if (rec.tag === 'INDI' && rec.pointer) {
      individuals.set(rec.pointer, rec);
    } else if (rec.tag === 'FAM' && rec.pointer) {
      families.set(rec.pointer, rec);
    } else if (rec.tag === 'SOUR' && rec.pointer) {
      sources.set(rec.pointer, rec);
    }
  }

  return { version, header, individuals, families, sources, gedcomVersion, charset };
}

// One line: "<level> [<pointer>] <tag> [<value>]"
function parseLine(line: string): {
  level: number;
  tag: string;
  pointer?: string;
  value?: string;
} | null {
  // Strip BOM
  if (line.charCodeAt(0) === 0xfeff) line = line.slice(1);
  const m = line.match(/^(\d+)\s+(?:(@[^@]+@)\s+)?([A-Z_][A-Z0-9_]*)(?:\s+(.*))?$/);
  if (!m) return null;
  return {
    level: parseInt(m[1]!, 10),
    pointer: m[2],
    tag: m[3]!,
    value: m[4],
  };
}

export function findChild(node: RawNode, tag: string): RawNode | undefined {
  return node.children.find((c) => c.tag === tag);
}

export function findChildren(node: RawNode, tag: string): RawNode[] {
  return node.children.filter((c) => c.tag === tag);
}

export function getChildValue(node: RawNode, tag: string): string | undefined {
  return findChild(node, tag)?.value;
}

// Normalize a raw INDI record into a Person. Relationships resolved in a
// second pass using the families map.
export function normalizeIndividual(
  indi: RawNode,
  families: Map<string, RawNode>,
  sources: Map<string, RawNode>
): Person {
  const id = indi.pointer!;
  const nameNode = findChild(indi, 'NAME');
  const rawName = nameNode?.value ?? '[No name]';
  const { given, surname, display } = parseName(rawName, nameNode);

  const sex = getChildValue(indi, 'SEX') as 'M' | 'F' | 'U' | undefined;

  const birth = normalizeEvent(findChild(indi, 'BIRT'), 'BIRT', sources);
  const death = normalizeEvent(findChild(indi, 'DEAT'), 'DEAT', sources);

  const events: LifeEvent[] = [];
  for (const child of indi.children) {
    if (child.tag === 'BIRT' || child.tag === 'DEAT') continue;
    if (isEventTag(child.tag)) {
      const e = normalizeEvent(child, child.tag, sources);
      if (e) events.push(e);
    }
  }

  // Parents & children: walk FAMS/FAMC links
  const parents: string[] = [];
  const children: string[] = [];
  const spouses: string[] = [];
  for (const famc of findChildren(indi, 'FAMC')) {
    const fam = famc.value ? families.get(famc.value) : undefined;
    if (!fam) continue;
    const husb = getChildValue(fam, 'HUSB');
    const wife = getChildValue(fam, 'WIFE');
    if (husb) parents.push(husb);
    if (wife) parents.push(wife);
  }
  for (const fams of findChildren(indi, 'FAMS')) {
    const fam = fams.value ? families.get(fams.value) : undefined;
    if (!fam) continue;
    const husb = getChildValue(fam, 'HUSB');
    const wife = getChildValue(fam, 'WIFE');
    if (husb && husb !== id) spouses.push(husb);
    if (wife && wife !== id) spouses.push(wife);
    for (const child of findChildren(fam, 'CHIL')) {
      if (child.value) children.push(child.value);
    }
  }

  // Top-level SOUR citations on INDI
  const indiSources = extractCitations(indi);

  return {
    id,
    name: display,
    givenName: given,
    surname,
    sex,
    birth,
    death,
    events,
    parents,
    children,
    spouses,
    isLiving: false, // set by privacy filter
    sources: indiSources,
  };
}

function parseName(raw: string, nameNode?: RawNode): { given?: string; surname?: string; display: string } {
  // GEDCOM name format: "Given /Surname/ Suffix"
  const m = raw.match(/^(.*?)\/([^/]*)\/(.*)?$/);
  let given: string | undefined;
  let surname: string | undefined;
  let display = raw.trim();
  if (m) {
    given = m[1]?.trim() || undefined;
    surname = m[2]?.trim() || undefined;
    display = [given, surname].filter(Boolean).join(' ').trim() || raw.trim();
  }
  // Override from structured GIVN/SURN if present
  if (nameNode) {
    const givnNode = getChildValue(nameNode, 'GIVN');
    const surnNode = getChildValue(nameNode, 'SURN');
    if (givnNode) given = givnNode;
    if (surnNode) surname = surnNode;
    if (given || surname) display = [given, surname].filter(Boolean).join(' ');
  }
  return { given, surname, display };
}

function isEventTag(tag: string): boolean {
  return [
    'BIRT', 'DEAT', 'MARR', 'BURI', 'RESI', 'EMIG', 'IMMI',
    'CHR', 'BAPM', 'CONF', 'OCCU', 'GRAD', 'NATU', 'CENS',
  ].includes(tag);
}

function normalizeEvent(
  node: RawNode | undefined,
  type: string,
  sources: Map<string, RawNode>
): LifeEvent | null {
  if (!node) return null;
  const dateRaw = getChildValue(node, 'DATE');
  const placeNode = findChild(node, 'PLAC');
  const placeLabel = placeNode?.value?.trim();

  const date = dateRaw ? parseDate(dateRaw) : null;
  const place: Place | null = placeLabel
    ? { label: placeLabel, lat: null, lng: null }
    : null;
  const citations = extractCitations(node);

  return { type, date, place, sources: citations };
}

function parseDate(raw: string): EventDate | null {
  // Strip prefixes: ABT, BEF, AFT, BET, EST, CAL
  const trimmed = raw.trim();
  const m = trimmed.match(/(\d{3,4})/);
  if (!m) return null;
  const year = parseInt(m[1]!, 10);
  const exact = !/^(ABT|ABOUT|BEF|BEFORE|AFT|AFTER|BET|BETWEEN|EST|CAL)/i.test(trimmed);
  return { year, exact, raw: trimmed };
}

function extractCitations(node: RawNode): Citation[] {
  const cites: Citation[] = [];
  for (const child of findChildren(node, 'SOUR')) {
    if (child.value?.startsWith('@')) {
      cites.push({
        sourceId: child.value,
        page: getChildValue(child, 'PAGE'),
        quay: getChildValue(child, 'QUAY'),
      });
    } else if (child.value) {
      cites.push({
        inlineText: child.value,
        page: getChildValue(child, 'PAGE'),
      });
    }
  }
  return cites;
}

// Normalize a raw SOUR record into a Source.
export function normalizeSource(sour: RawNode): Source {
  return {
    id: sour.pointer!,
    title: getChildValue(sour, 'TITL') ?? getChildValue(sour, 'ABBR'),
    repository: getChildValue(sour, 'REPO'),
  };
}
