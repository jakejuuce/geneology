'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import type { EntityStore, DotAtYear, ArcPoint, Person } from '@/lib/types';
import { KinshipModule } from '@/lib/kinship';
import PersonCard from '@/components/PersonCard';
import YearSlider from '@/components/YearSlider';
import Filigree from '@/components/Filigree';

// Leaflet requires window — dynamically import with SSR disabled.
const MapCanvas = dynamic(() => import('@/components/MapCanvas'), {
  ssr: false,
  loading: () => (
    <div className="map-placeholder">
      <span className="italic">Gathering the record…</span>
    </div>
  ),
});

interface Props {
  entities: EntityStore;
  dotsByDecade: Record<string, DotAtYear[]>;
  arcsByPerson: Record<string, ArcPoint[]>;
}

const DEFAULT_YEAR = 1720;

export default function MapApp({ entities, dotsByDecade, arcsByPerson }: Props) {
  const [year, setYear] = useState(DEFAULT_YEAR);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showArcs, setShowArcs] = useState(true);
  const [hintDismissed, setHintDismissed] = useState(false);

  // Build people index and kinship module once.
  const kinship = useMemo(
    () => new KinshipModule(entities.people, entities.momId),
    [entities]
  );
  const peopleIndex = useMemo(() => {
    const m = new Map<string, Person>();
    for (const p of entities.people) m.set(p.id, p);
    return m;
  }, [entities]);

  const selectedPerson = selectedId ? peopleIndex.get(selectedId) ?? null : null;

  // Resolve dots for the current year (from decade bucket, filtered by live span)
  const dotsForYear = useMemo(() => {
    const decadeKey = String(Math.floor(year / 10) * 10);
    const bucket = dotsByDecade[decadeKey] ?? [];
    return bucket.filter((d) => {
      const p = peopleIndex.get(d.id);
      if (!p || p.isLiving) return false;
      const birth = p.birth?.date?.year;
      const death = p.death?.date?.year;
      return birth != null && death != null && year >= birth && year <= death;
    });
  }, [year, dotsByDecade, peopleIndex]);

  // Compute migration arcs — clip each person's arc to segments where both
  // endpoints ≤ year.
  const arcsForYear = useMemo(() => {
    if (!showArcs) return [];
    const out: Array<{ id: string; points: ArcPoint[] }> = [];
    for (const [id, points] of Object.entries(arcsByPerson)) {
      const p = peopleIndex.get(id);
      if (!p || p.isLiving) continue;
      const visible = points.filter((pt) => pt.year <= year);
      if (visible.length >= 2) out.push({ id, points: visible });
    }
    return out;
  }, [showArcs, year, arcsByPerson, peopleIndex]);

  const handleYearChange = (y: number) => {
    setYear(y);
    if (!hintDismissed) setHintDismissed(true);
  };

  return (
    <div className="frame">
      <Filigree />

      <header>
        <h1>The Kingsbury &middot; Taub Lineage</h1>
        <div className="rule">
          <span className="line" />
          <span className="ornament">❦</span>
          <span className="line" />
        </div>
        <p className="subtitle">
          {entities.stats.total.toLocaleString()} souls &middot; eleven centuries
        </p>
      </header>

      <div className="map-area">
        <MapCanvas
          dots={dotsForYear}
          arcs={arcsForYear}
          selectedId={selectedId}
          onSelectDot={setSelectedId}
          peopleIndex={peopleIndex}
          kinship={kinship}
          year={year}
        />
        <div className="year-caption">
          <span className="label">in the year</span>
          {year}
        </div>
        {!hintDismissed && (
          <div className="hint">Drag the year to follow the bloodline</div>
        )}
      </div>

      <aside className="sidebar">
        {selectedPerson ? (
          <PersonCard
            person={selectedPerson}
            kinship={kinship}
            sources={entities.sources}
            peopleIndex={peopleIndex}
            onSelectPerson={setSelectedId}
          />
        ) : (
          <div className="sidebar-empty">
            <div className="sb-eyebrow">Begin here</div>
            <p>Select an ancestor from the map, or drag the year to begin.</p>
          </div>
        )}
      </aside>

      <div className="slider-wrap">
        <YearSlider year={year} onChange={handleYearChange} min={1400} max={2026} />
        <div className="slider-toggles">
          <label className={`toggle ${showArcs ? 'on' : ''}`}>
            <span className="box" />
            <input
              type="checkbox"
              checked={showArcs}
              onChange={(e) => setShowArcs(e.target.checked)}
              style={{ position: 'absolute', opacity: 0 }}
            />
            show migration paths
          </label>
          <span className="minor">
            {dotsForYear.length} ancestors visible
          </span>
        </div>
      </div>
    </div>
  );
}
