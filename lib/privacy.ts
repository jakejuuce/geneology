// Privacy filter. 7 rules in strict evaluation order.
// Rule order is load-bearing. See DESIGN for semantics.
// Every rule is tested individually in __tests__/privacy.test.ts.

import type { LifeEvent, Person, Overrides, LivingStatus } from './types';

export const LIFESPAN_DEFAULT = {
  pre1700: 50,
  through1900: 65,
  modern: 80,
} as const;

export function lifespanDefaultForBirthYear(year: number): number {
  if (year < 1700) return LIFESPAN_DEFAULT.pre1700;
  if (year <= 1900) return LIFESPAN_DEFAULT.through1900;
  return LIFESPAN_DEFAULT.modern;
}

export interface PrivacyInputs {
  birthYear: number | null;
  deathYear: number | null;          // extracted from DEAT event
  hasExplicitDeath: boolean;         // DEAT tag present (even without year)
  hasPrivTag: boolean;               // _PRIV tag
  hasResnTag: boolean;               // RESN tag
  earliestNonBirthEventYear: number | null;  // MARR/BURI/RESI earliest year
}

export interface PrivacyDecision {
  status: LivingStatus;
  // For rendering bounds when deceased-without-death-year
  implicitDeathYear?: number;
  // Which rule fired (1-7), for auto-deceased-report.json
  rule: 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

const CURRENT_YEAR = new Date().getFullYear();
const LIVING_THRESHOLD_YEARS = 120;

// Apply the 7 rules for a single person.
// Rule order matters — never reorder without reviewing tests.
export function decidePrivacy(
  personId: string,
  inputs: PrivacyInputs,
  overrides: Overrides = {}
): PrivacyDecision {
  const override = overrides[personId];

  // Rule 1: explicit override → living (redact)
  if (override?.status === 'living') {
    return { status: 'living', rule: 1 };
  }

  // Rule 2: explicit override → deceased (render)
  if (override?.status === 'deceased') {
    const deathYear =
      override.deathYear ??
      (inputs.birthYear != null
        ? inputs.birthYear + lifespanDefaultForBirthYear(inputs.birthYear)
        : CURRENT_YEAR - 80);
    return { status: 'deceased', implicitDeathYear: deathYear, rule: 2 };
  }

  // Rule 3: explicit DEAT event present → deceased
  if (inputs.hasExplicitDeath) {
    return {
      status: 'deceased',
      implicitDeathYear:
        inputs.deathYear ??
        (inputs.birthYear != null
          ? inputs.birthYear + lifespanDefaultForBirthYear(inputs.birthYear)
          : undefined),
      rule: 3,
    };
  }

  // Rule 4: _PRIV or RESN tag → living (redact)
  if (inputs.hasPrivTag || inputs.hasResnTag) {
    return { status: 'living', rule: 4 };
  }

  // Rule 5: era rule by birth year → deceased
  if (
    inputs.birthYear != null &&
    inputs.birthYear < CURRENT_YEAR - LIVING_THRESHOLD_YEARS
  ) {
    return {
      status: 'deceased',
      implicitDeathYear:
        inputs.birthYear + lifespanDefaultForBirthYear(inputs.birthYear),
      rule: 5,
    };
  }

  // Rule 6: era rule by any event year (for people with no birth year)
  if (
    inputs.birthYear == null &&
    inputs.earliestNonBirthEventYear != null &&
    inputs.earliestNonBirthEventYear < CURRENT_YEAR - LIVING_THRESHOLD_YEARS
  ) {
    const anchor = inputs.earliestNonBirthEventYear;
    return {
      status: 'deceased',
      implicitDeathYear: anchor + lifespanDefaultForBirthYear(anchor),
      rule: 6,
    };
  }

  // Rule 7: default → living (redact)
  return { status: 'living', rule: 7 };
}

// Apply to a parsed Person and mutate/return a privacy-filtered version.
// Redacted people keep their ID + graph edges but lose name/dates/places.
export function applyPrivacyFilter(
  person: Person,
  overrides: Overrides = {}
): { person: Person; rule: number } {
  const inputs = extractPrivacyInputs(person);
  const decision = decidePrivacy(person.id, inputs, overrides);

  if (decision.status === 'living') {
    return {
      person: {
        ...person,
        name: '[Living]',
        givenName: undefined,
        surname: undefined,
        birth: redactEvent(person.birth),
        death: null,
        events: [],
        isLiving: true,
        sources: [],
      },
      rule: decision.rule,
    };
  }

  // Deceased: ensure we have a rendering death year
  const deathForRender: LifeEvent | null =
    person.death ??
    (decision.implicitDeathYear != null
      ? {
          type: 'DEAT',
          date: {
            year: decision.implicitDeathYear,
            exact: false,
            raw: `~${decision.implicitDeathYear}`,
          },
          place: null,
          sources: [],
        }
      : null);

  return {
    person: {
      ...person,
      birth: person.birth,
      death: deathForRender,
      events: person.events,
      isLiving: false,
    },
    rule: decision.rule,
  };
}

function redactEvent(ev: LifeEvent | null): LifeEvent | null {
  if (!ev) return null;
  return {
    type: ev.type,
    date: ev.date ? { year: Math.floor(ev.date.year / 10) * 10, exact: false, raw: 'redacted' } : null,
    place: ev.place ? { label: 'redacted', lat: null, lng: null } : null,
    sources: [],
  };
}

function extractPrivacyInputs(person: Person): PrivacyInputs {
  const nonBirthEventYears = person.events
    .filter((e) => e.type !== 'BIRT')
    .map((e) => e.date?.year ?? null)
    .filter((y): y is number => y != null);

  return {
    birthYear: person.birth?.date?.year ?? null,
    deathYear: person.death?.date?.year ?? null,
    hasExplicitDeath: person.death != null,
    hasPrivTag: false, // set by loader before privacy filter
    hasResnTag: false, // set by loader before privacy filter
    earliestNonBirthEventYear:
      nonBirthEventYears.length > 0 ? Math.min(...nonBirthEventYears) : null,
  };
}
