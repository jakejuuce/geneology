'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import type { EntityStore, DotAtYear, ArcPoint, Person } from '@/lib/types';
import { KinshipModule } from '@/lib/kinship';
import PersonCard from '@/components/PersonCard';
import YearSlider from '@/components/YearSlider';
import Filigree from '@/components/Filigree';
import Chronicle from '@/components/Chronicle';

type Tab = 'map' | 'chronicle';

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
  const [tab, setTab] = useState<Tab>('map');
  const [year, setYear] = useState(DEFAULT_YEAR);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAllArcs, setShowAllArcs] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(false);

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

  // Arcs:
  //   - default: selected person only
  //   - showAllArcs: every person, selected highlighted
  const arcsForYear = useMemo(() => {
    const out: Array<{ id: string; points: ArcPoint[]; emphasis: 'primary' | 'faint' }> = [];

    if (showAllArcs) {
      for (const [id, points] of Object.entries(arcsByPerson)) {
        const p = peopleIndex.get(id);
        if (!p || p.isLiving) continue;
        const visible = points.filter((pt) => pt.year <= year);
        if (visible.length >= 2) {
          out.push({
            id,
            points: visible,
            emphasis: id === selectedId ? 'primary' : 'faint',
          });
        }
      }
    } else if (selectedId) {
      const points = arcsByPerson[selectedId];
      if (points) {
        const visible = points.filter((pt) => pt.year <= year);
        if (visible.length >= 2) {
          out.push({ id: selectedId, points: visible, emphasis: 'primary' });
        }
      }
    }
    return out;
  }, [showAllArcs, selectedId, year, arcsByPerson, peopleIndex]);

  const handleYearChange = (y: number) => {
    setYear(y);
    if (!hintDismissed) setHintDismissed(true);
  };

  return (
    <div className={`frame ${tab === 'chronicle' ? 'chronicle-mode' : ''}`}>
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
        <nav className="tabs">
          <button
            className={`tab ${tab === 'map' ? 'active' : ''}`}
            onClick={() => setTab('map')}
          >
            The Map
          </button>
          <span className="tab-sep">❦</span>
          <button
            className={`tab ${tab === 'chronicle' ? 'active' : ''}`}
            onClick={() => setTab('chronicle')}
          >
            Chronicle
          </button>
        </nav>
      </header>

      {tab === 'chronicle' ? (
        <div className="chronicle-area">
          <Chronicle
            entities={entities}
            peopleIndex={peopleIndex}
            onOpenAncestor={(id) => {
              setSelectedId(id);
              setTab('map');
              const p = peopleIndex.get(id);
              const birth = p?.birth?.date?.year;
              if (birth != null) setYear(birth + 25);
            }}
          />
        </div>
      ) : (
        <>
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
              <label className={`toggle ${showAllArcs ? 'on' : ''}`}>
                <span className="box" />
                <input
                  type="checkbox"
                  checked={showAllArcs}
                  onChange={(e) => setShowAllArcs(e.target.checked)}
                  style={{ position: 'absolute', opacity: 0 }}
                />
                show every migration path
              </label>
              <span className="minor">
                {dotsForYear.length} ancestors visible
                {selectedId && !showAllArcs && ' · their trail lit'}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
