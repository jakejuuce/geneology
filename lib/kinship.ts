// Kinship module. Shared between labelFor() and descentPath().
// BFS from mom's ID through parent edges (ancestors) and child edges (descendants).
// Non-ancestor/descendant relationships (cousins) require MRCA computation.

import type { Person, KinshipResult } from './types';

type Graph = Map<string, { parents: string[]; children: string[]; sex?: 'M' | 'F' | 'U' }>;

export class KinshipModule {
  private readonly graph: Graph;
  private readonly momId: string;
  private readonly ancestorsOfMom: Map<string, number>; // id -> gen from mom
  private readonly descendantsOfMom: Map<string, number>; // id -> gen below mom

  constructor(people: Person[], momId: string) {
    this.momId = momId;
    this.graph = new Map();
    for (const p of people) {
      this.graph.set(p.id, { parents: p.parents, children: p.children, sex: p.sex });
    }
    if (!this.graph.has(momId)) {
      throw new Error(
        `KinshipModule: MOM_GEDCOM_ID=${momId} not found in the tree. ` +
          `Check .env.local against the first INDI record in the GEDCOM.`
      );
    }
    this.ancestorsOfMom = this.bfsUp(momId);
    this.descendantsOfMom = this.bfsDown(momId);
  }

  labelFor(id: string): KinshipResult {
    if (id === this.momId) {
      return { label: 'you', generations: 0, kind: 'self' };
    }

    const ancGen = this.ancestorsOfMom.get(id);
    if (ancGen != null) {
      return {
        label: ancestorLabel(ancGen, this.isFemale(id)),
        generations: ancGen,
        kind: 'direct-ancestor',
      };
    }

    const descGen = this.descendantsOfMom.get(id);
    if (descGen != null) {
      return {
        label: descendantLabel(descGen, this.isFemale(id)),
        generations: descGen,
        kind: 'direct-descendant',
      };
    }

    // Collateral: find MRCA between mom and target
    const mrca = this.findMRCA(id);
    if (mrca) {
      return {
        label: collateralLabel(mrca.momToMRCA, mrca.targetToMRCA, this.isFemale(id)),
        generations: Math.max(mrca.momToMRCA, mrca.targetToMRCA),
        kind: 'collateral',
      };
    }

    return {
      label: 'related via your tree',
      generations: -1,
      kind: 'unrelated',
    };
  }

  // Returns the shortest path from mom to target through parent edges.
  // Empty array if target is mom herself; null if no path found.
  descentPath(id: string): { path: string[]; multiplePaths: boolean } | null {
    if (id === this.momId) return { path: [this.momId], multiplePaths: false };

    // BFS up from mom through parents, tracking predecessors.
    // If target is in mom's ancestors, trace the path.
    const gen = this.ancestorsOfMom.get(id);
    if (gen == null) return null;

    // Reconstruct shortest path via re-BFS with parent tracking
    const preds = new Map<string, string>();
    const arrivalCount = new Map<string, number>();
    const queue: [string, number][] = [[this.momId, 0]];
    const seen = new Set<string>([this.momId]);

    while (queue.length > 0) {
      const [cur, g] = queue.shift()!;
      if (cur === id) break;
      const node = this.graph.get(cur);
      if (!node) continue;
      for (const parent of node.parents) {
        arrivalCount.set(parent, (arrivalCount.get(parent) ?? 0) + 1);
        if (!seen.has(parent)) {
          seen.add(parent);
          preds.set(parent, cur);
          queue.push([parent, g + 1]);
        }
      }
    }

    // Reconstruct path from id back to mom
    const path: string[] = [];
    let cur: string | undefined = id;
    while (cur && cur !== this.momId) {
      path.unshift(cur);
      cur = preds.get(cur);
    }
    if (cur === this.momId) path.unshift(this.momId);
    else return null;

    return {
      path,
      multiplePaths: (arrivalCount.get(id) ?? 0) > 1,
    };
  }

  private bfsUp(start: string): Map<string, number> {
    const gens = new Map<string, number>();
    const queue: [string, number][] = [[start, 0]];
    const seen = new Set<string>([start]);
    while (queue.length > 0) {
      const [cur, g] = queue.shift()!;
      if (cur !== start) gens.set(cur, g);
      const node = this.graph.get(cur);
      if (!node) continue;
      for (const parent of node.parents) {
        if (!seen.has(parent)) {
          seen.add(parent);
          queue.push([parent, g + 1]);
        }
      }
    }
    return gens;
  }

  private bfsDown(start: string): Map<string, number> {
    const gens = new Map<string, number>();
    const queue: [string, number][] = [[start, 0]];
    const seen = new Set<string>([start]);
    while (queue.length > 0) {
      const [cur, g] = queue.shift()!;
      if (cur !== start) gens.set(cur, g);
      const node = this.graph.get(cur);
      if (!node) continue;
      for (const child of node.children) {
        if (!seen.has(child)) {
          seen.add(child);
          queue.push([child, g + 1]);
        }
      }
    }
    return gens;
  }

  // Find MRCA between target and mom by walking up from target until
  // we hit one of mom's known ancestors.
  private findMRCA(targetId: string):
    | { mrca: string; momToMRCA: number; targetToMRCA: number }
    | null {
    const queue: [string, number][] = [[targetId, 0]];
    const seen = new Set<string>([targetId]);
    while (queue.length > 0) {
      const [cur, g] = queue.shift()!;
      // Is cur one of mom's ancestors (or mom herself)?
      if (cur === this.momId) {
        return { mrca: this.momId, momToMRCA: 0, targetToMRCA: g };
      }
      const momGen = this.ancestorsOfMom.get(cur);
      if (momGen != null) {
        return { mrca: cur, momToMRCA: momGen, targetToMRCA: g };
      }
      const node = this.graph.get(cur);
      if (!node) continue;
      for (const parent of node.parents) {
        if (!seen.has(parent)) {
          seen.add(parent);
          queue.push([parent, g + 1]);
        }
      }
    }
    return null;
  }

  private isFemale(id: string): boolean {
    const sex = this.graph.get(id)?.sex;
    // M = father/grandfather side. F = mother/grandmother. U/missing defaults
    // to F (most ancestors in this tree with sex tagged are female, and the
    // "mother" form is the emotional anchor of the app).
    return sex !== 'M';
  }
}

// Direct ancestor label: "mother", "grandmother", "great-grandmother",
// "2x-great-grandmother", ..., "5x-great-grandmother", "6g-grandmother",
// ..., "30g-grandmother".
export function ancestorLabel(generations: number, female: boolean): string {
  const suffix = female ? 'mother' : 'father';
  if (generations === 1) return `your ${female ? 'mother' : 'father'}`;
  if (generations === 2) return `your grand${suffix}`;
  if (generations === 3) return `your great-grand${suffix}`;
  if (generations >= 4 && generations <= 5) {
    return `your ${generations - 2}x-great-grand${suffix}`;
  }
  // 6+ → shorthand
  return `your ${generations - 2}g-grand${suffix}`;
}

export function descendantLabel(generations: number, female: boolean): string {
  const noun = female ? 'daughter' : 'son';
  if (generations === 1) return `your ${noun}`;
  if (generations === 2) return `your grand${noun}`;
  if (generations === 3) return `your great-grand${noun}`;
  if (generations >= 4 && generations <= 5) {
    return `your ${generations - 2}x-great-grand${noun}`;
  }
  return `your ${generations - 2}g-grand${noun}`;
}

// Collateral: either sibling-of-ancestor (aunt/uncle form) or cousin.
export function collateralLabel(
  momToMRCA: number,
  targetToMRCA: number,
  female: boolean
): string {
  // Case: target is a sibling of one of mom's ancestors (aunt/uncle family)
  if (targetToMRCA === 1) {
    const auntUncle = female ? 'aunt' : 'uncle';
    if (momToMRCA === 1) return `your sister`;
    if (momToMRCA === 2) return `your ${auntUncle}`;
    if (momToMRCA === 3) return `your great-${auntUncle}`;
    return `your ${momToMRCA - 2}x-great-${auntUncle}`;
  }
  // Case: both > 1 → cousin form
  // N-th cousin = min(gm, gt) - 1; removed = |gm - gt|
  const n = Math.min(momToMRCA, targetToMRCA) - 1;
  const removed = Math.abs(momToMRCA - targetToMRCA);
  const ordinal = ordinalLabel(n);
  const removedPart = removed === 0 ? '' : ` ${removed}x removed`;
  return `your ${ordinal} cousin${removedPart}`;
}

function ordinalLabel(n: number): string {
  if (n === 1) return '1st';
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  return `${n}th`;
}
