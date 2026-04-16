// Core types shared across loader, runtime, and tests.

export interface Place {
  label: string;
  lat: number | null;
  lng: number | null;
}

export type EventType =
  | 'BIRT'
  | 'DEAT'
  | 'MARR'
  | 'BURI'
  | 'RESI'
  | 'EMIG'
  | 'IMMI'
  | 'CHR'
  | 'OCCU'
  | string;

export interface EventDate {
  year: number;
  exact: boolean;
  raw: string;
}

export interface Citation {
  sourceId?: string;
  page?: string;
  inlineText?: string;
  quay?: string;
}

export interface LifeEvent {
  type: EventType;
  date: EventDate | null;
  place: Place | null;
  sources: Citation[];
}

export type LivingStatus = 'living' | 'deceased';

export interface Person {
  id: string;
  name: string;
  givenName?: string;
  surname?: string;
  sex?: 'M' | 'F' | 'U';
  birth: LifeEvent | null;
  death: LifeEvent | null;
  events: LifeEvent[];
  parents: string[];
  children: string[];
  spouses: string[];
  isLiving: boolean;
  sources: Citation[];
}

export interface Source {
  id: string;
  title?: string;
  repository?: string;
}

export interface Override {
  status: LivingStatus;
  deathYear?: number;
}

export type Overrides = Record<string, Override>;

export interface EntityStore {
  version: string;
  momId: string;
  generatedAt: string;
  people: Person[];
  sources: Record<string, Source>;
  stats: {
    total: number;
    redactedLiving: number;
    byCentury: Record<string, number>;
  };
}

export interface KinshipResult {
  label: string;
  generations: number;
  kind: 'direct-ancestor' | 'direct-descendant' | 'collateral' | 'self' | 'unrelated';
}

export interface DotAtYear {
  id: string;
  lat: number;
  lng: number;
  opacity: number;
}

export interface ArcPoint {
  year: number;
  lat: number;
  lng: number;
}
