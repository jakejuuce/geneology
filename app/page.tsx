import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EntityStore, DotAtYear, ArcPoint } from '@/lib/types';
import MapApp from './MapApp';

// Server component: load data at build/render time, pass to client.
// entities.json can be large; we pass only the slices the client needs for v1.
export default function HomePage() {
  const dataDir = resolve(process.cwd(), 'public/data');
  const entities = JSON.parse(
    readFileSync(resolve(dataDir, 'entities.json'), 'utf-8')
  ) as EntityStore;
  const dotsByDecade = JSON.parse(
    readFileSync(resolve(dataDir, 'dotsByDecade.json'), 'utf-8')
  ) as Record<string, DotAtYear[]>;
  const arcsByPerson = JSON.parse(
    readFileSync(resolve(dataDir, 'arcsByPerson.json'), 'utf-8')
  ) as Record<string, ArcPoint[]>;

  return (
    <MapApp
      entities={entities}
      dotsByDecade={dotsByDecade}
      arcsByPerson={arcsByPerson}
    />
  );
}
