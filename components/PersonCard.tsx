'use client';

import type { Person, Source } from '@/lib/types';
import type { KinshipModule } from '@/lib/kinship';

interface Props {
  person: Person;
  kinship: KinshipModule;
  sources: Record<string, Source>;
  peopleIndex: Map<string, Person>;
  onSelectPerson: (id: string) => void;
}

export default function PersonCard({
  person,
  kinship,
  sources,
  peopleIndex,
  onSelectPerson,
}: Props) {
  const kin = kinship.labelFor(person.id);
  const birthYear = person.birth?.date?.year;
  const deathYear = person.death?.date?.year;
  const dateRange =
    birthYear && deathYear
      ? `${birthYear} — ${deathYear}`
      : birthYear
      ? `b. ${birthYear}`
      : '';

  const lifeEvents = orderedLifeEvents(person);

  const parents = person.parents
    .map((id) => peopleIndex.get(id))
    .filter((p): p is Person => p != null && !p.isLiving);
  const spouses = person.spouses
    .map((id) => peopleIndex.get(id))
    .filter((p): p is Person => p != null && !p.isLiving);
  const children = person.children
    .map((id) => peopleIndex.get(id))
    .filter((p): p is Person => p != null && !p.isLiving);

  return (
    <>
      <div className="sb-eyebrow">Selected</div>
      <h2 className="sb-name">{person.name}</h2>
      <p className="sb-kinship">{kin.label}</p>
      {dateRange && <div className="sb-dates">{dateRange}</div>}

      {lifeEvents.length > 0 && (
        <div className="sb-section">
          <h3>Life</h3>
          <ul className="lifeline">
            {lifeEvents.map((ev, i) => (
              <li key={i}>
                <span className="year">{ev.date?.year ?? '?'}</span>
                {humanEvent(ev.type)}
                {ev.place?.label ? ` in ${ev.place.label}` : ''}
                {ev.sources.length > 0 && (
                  <SourceTags sources={ev.sources} map={sources} />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(parents.length > 0 || spouses.length > 0 || children.length > 0) && (
        <div className="sb-section">
          <h3>Family</h3>
          <div className="family">
            {parents.length > 0 && (
              <div>
                <span className="label">Parents</span>
                {parents.map((p) => (
                  <a
                    key={p.id}
                    onClick={() => onSelectPerson(p.id)}
                    className="family-link"
                  >
                    {p.name}
                  </a>
                ))}
              </div>
            )}
            {spouses.length > 0 && (
              <div>
                <span className="label">
                  {spouses.length === 1 ? 'Spouse' : 'Spouses'}
                </span>
                {spouses.map((p) => (
                  <a
                    key={p.id}
                    onClick={() => onSelectPerson(p.id)}
                    className="family-link"
                  >
                    {p.name}
                  </a>
                ))}
              </div>
            )}
            {children.length > 0 && (
              <div>
                <span className="label">
                  {children.length === 1 ? 'Child' : `Children (${children.length})`}
                </span>
                {children.slice(0, 6).map((p) => (
                  <a
                    key={p.id}
                    onClick={() => onSelectPerson(p.id)}
                    className="family-link"
                  >
                    {p.name}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="sb-nav">
        {parents[0] && (
          <button onClick={() => onSelectPerson(parents[0]!.id)}>← Parent</button>
        )}
        <span className="minor">
          {kin.kind === 'direct-ancestor' && `g. ${kin.generations}`}
        </span>
        {children[0] && (
          <button onClick={() => onSelectPerson(children[0]!.id)}>Child →</button>
        )}
      </div>
    </>
  );
}

function SourceTags({ sources, map }: { sources: Person['sources']; map: Record<string, Source> }) {
  return (
    <>
      {sources.slice(0, 3).map((c, i) => {
        let label = c.inlineText?.slice(0, 40);
        if (c.sourceId) {
          const src = map[c.sourceId];
          label = src?.title?.slice(0, 40) ?? 'Source';
        }
        if (!label) return null;
        return (
          <span key={i} className="source" title={label}>
            {label}
          </span>
        );
      })}
    </>
  );
}

function orderedLifeEvents(person: Person) {
  const events = [
    ...(person.birth ? [person.birth] : []),
    ...person.events,
    ...(person.death ? [person.death] : []),
  ];
  return events.filter((e) => e.date).sort((a, b) => a.date!.year - b.date!.year);
}

function humanEvent(type: string): string {
  const map: Record<string, string> = {
    BIRT: 'Born',
    DEAT: 'Died',
    MARR: 'Married',
    BURI: 'Buried',
    RESI: 'Residing',
    EMIG: 'Emigrated',
    IMMI: 'Immigrated',
    CHR: 'Christened',
    BAPM: 'Baptized',
    OCCU: 'Occupation',
    GRAD: 'Graduated',
    NATU: 'Naturalized',
    CENS: 'Census',
  };
  return map[type] ?? type;
}
