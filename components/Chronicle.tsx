'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  EVENTS,
  REGION_PRESETS,
  REGION_NAMES,
  type HistoricalEvent,
} from '@/data/events';
import type { EntityStore, Person } from '@/lib/types';

interface Props {
  entities: EntityStore;
  peopleIndex: Map<string, Person>;
  onOpenAncestor: (id: string) => void;
}

const LOCAL_STORAGE_KEY = 'geneology:custom-events:v1';

export default function Chronicle({ entities, peopleIndex, onOpenAncestor }: Props) {
  const [customEvents, setCustomEvents] = useState<HistoricalEvent[]>([]);
  const [selected, setSelected] = useState<HistoricalEvent | null>(null);
  const [narrative, setNarrative] = useState('');
  const [status, setStatus] = useState<'idle' | 'streaming' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Load custom events from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as HistoricalEvent[];
        if (Array.isArray(parsed)) setCustomEvents(parsed);
      }
    } catch {
      // corrupt storage, ignore
    }
  }, []);

  const persistCustom = (events: HistoricalEvent[]) => {
    setCustomEvents(events);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(events));
    } catch {
      // storage full or unavailable
    }
  };

  const allEvents = useMemo(() => {
    // Custom events appear first so they're easy to find
    return [...customEvents, ...EVENTS];
  }, [customEvents]);

  const countsByEvent = useEventCounts(allEvents, entities);

  const loadNarrative = async (event: HistoricalEvent) => {
    setSelected(event);
    setNarrative('');
    setStatus('streaming');
    setError(null);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch('/api/narrative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Send the full event object so custom events work
        body: JSON.stringify({ event }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const body = await res.text();
        try {
          setError(JSON.parse(body).error ?? body);
        } catch {
          setError(body || `Server returned ${res.status}`);
        }
        setStatus('error');
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        for (const ev of events) {
          if (ev.startsWith('event: done')) {
            setStatus('done');
            continue;
          }
          if (ev.startsWith('event: error')) {
            const m = ev.match(/data: (.+)/);
            if (m) {
              try {
                setError(JSON.parse(m[1]!).error ?? m[1]!);
              } catch {
                setError(m[1] ?? 'unknown error');
              }
            }
            setStatus('error');
            continue;
          }
          const dataLines = ev
            .split('\n')
            .filter((l) => l.startsWith('data:'))
            .map((l) => l.slice(5).replace(/^ /, ''));
          if (dataLines.length > 0) {
            setNarrative((prev) => prev + dataLines.join('\n'));
          }
        }
      }
      setStatus('done');
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError((err as Error).message);
      setStatus('error');
    }
  };

  const addCustom = (event: HistoricalEvent) => {
    persistCustom([event, ...customEvents]);
    setFormOpen(false);
  };

  const removeCustom = (id: string) => {
    persistCustom(customEvents.filter((e) => e.id !== id));
  };

  useEffect(() => () => abortRef.current?.abort(), []);

  if (selected) {
    return (
      <div className="chronicle-page">
        <button className="back" onClick={() => setSelected(null)}>
          ← all events
        </button>
        <div className="event-header">
          <span className="event-dates">
            {selected.dateRange.start}—{selected.dateRange.end}
          </span>
          <h2 className="event-title">{selected.title}</h2>
          <p className="event-blurb">{selected.blurb}</p>
        </div>

        {status === 'streaming' && narrative === '' && (
          <p className="stream-status italic">Consulting the record…</p>
        )}
        {status === 'error' && (
          <div className="stream-error">
            <strong>The record grows silent.</strong>
            <p>{error}</p>
          </div>
        )}

        <div className="narrative">
          <RenderNarrative
            text={narrative}
            peopleIndex={peopleIndex}
            onOpenAncestor={onOpenAncestor}
          />
        </div>

        {status === 'done' && narrative.trim() === '' && (
          <p className="italic">No narrative returned.</p>
        )}
      </div>
    );
  }

  return (
    <div className="chronicle-page">
      <p className="chronicle-lede italic">
        Select an event. See which of your ancestors lived through it. Or write your own.
      </p>

      {formOpen && (
        <CustomEventForm
          onSubmit={addCustom}
          onCancel={() => setFormOpen(false)}
        />
      )}

      <div className="event-list">
        {!formOpen && (
          <button
            className="event-card event-card-add"
            onClick={() => setFormOpen(true)}
          >
            <div className="event-card-plus">❦</div>
            <div className="event-card-title">Write your own</div>
            <div className="event-card-blurb">
              A family event, a regional chapter, a moment the history books missed.
              Mom's grandmother's crossing. The year the barn burned.
            </div>
          </button>
        )}

        {allEvents.map((ev) => {
          const count = countsByEvent.get(ev.id) ?? 0;
          const isCustom = ev.id.startsWith('custom-');
          return (
            <div key={ev.id} className="event-card-wrap">
              <button
                className={`event-card ${isCustom ? 'event-card-custom' : ''}`}
                onClick={() => loadNarrative(ev)}
                disabled={count === 0}
              >
                <div className="event-card-dates">
                  {ev.dateRange.start}—{ev.dateRange.end}
                  {isCustom && <span className="custom-badge"> · your event</span>}
                </div>
                <div className="event-card-title">{ev.title}</div>
                <div className="event-card-blurb">{ev.blurb}</div>
                <div className="event-card-count">
                  {count === 0
                    ? 'no ancestors documented'
                    : count === 1
                    ? '1 ancestor documented'
                    : `${count} ancestors documented`}
                </div>
              </button>
              {isCustom && (
                <button
                  className="event-card-remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Remove "${ev.title}" from your events?`))
                      removeCustom(ev.id);
                  }}
                  title="Remove this custom event"
                  aria-label="Remove custom event"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// Custom event form
// ----------------------------------------------------------------------

function CustomEventForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (event: HistoricalEvent) => void;
  onCancel: () => void;
}) {
  const currentYear = new Date().getFullYear();
  const [title, setTitle] = useState('');
  const [start, setStart] = useState(1800);
  const [end, setEnd] = useState(1810);
  const [region, setRegion] = useState(REGION_NAMES[0]!);
  const [blurb, setBlurb] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const submit = () => {
    setFormError(null);
    const t = title.trim();
    if (!t) return setFormError('A title is needed.');
    if (start < 1000 || start > currentYear)
      return setFormError(`Start year must be between 1000 and ${currentYear}.`);
    if (end < start) return setFormError('End year must be ≥ start year.');
    if (end > currentYear)
      return setFormError(`End year can't be in the future.`);
    const bbox = REGION_PRESETS[region]!;
    const event: HistoricalEvent = {
      id: `custom-${Date.now()}`,
      title: t,
      dateRange: { start, end },
      geoBbox: bbox,
      scopeTag: 'local',
      blurb: blurb.trim() || `${start}–${end} · ${region}.`,
    };
    onSubmit(event);
  };

  return (
    <form
      className="custom-event-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h3 className="form-title">Write your own event</h3>

      <label className="form-row">
        <span className="form-label">Title</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. The Kingsbury crossing to Boston"
          maxLength={80}
          autoFocus
        />
      </label>

      <div className="form-row-split">
        <label className="form-row">
          <span className="form-label">From</span>
          <input
            type="number"
            value={start}
            min={1000}
            max={currentYear}
            onChange={(e) => setStart(parseInt(e.target.value, 10) || 0)}
          />
        </label>
        <label className="form-row">
          <span className="form-label">To</span>
          <input
            type="number"
            value={end}
            min={1000}
            max={currentYear}
            onChange={(e) => setEnd(parseInt(e.target.value, 10) || 0)}
          />
        </label>
      </div>

      <label className="form-row">
        <span className="form-label">Region</span>
        <select value={region} onChange={(e) => setRegion(e.target.value)}>
          {REGION_NAMES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>

      <label className="form-row">
        <span className="form-label">Context (optional)</span>
        <textarea
          value={blurb}
          onChange={(e) => setBlurb(e.target.value)}
          placeholder="A line or two about what happened. The AI reads this to frame the narrative."
          maxLength={240}
          rows={3}
        />
      </label>

      {formError && <p className="form-error">{formError}</p>}

      <div className="form-buttons">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn-primary">
          Add to Chronicle
        </button>
      </div>
    </form>
  );
}

// ----------------------------------------------------------------------
// Narrative renderer
// ----------------------------------------------------------------------

function RenderNarrative({
  text,
  peopleIndex,
  onOpenAncestor,
}: {
  text: string;
  peopleIndex: Map<string, Person>;
  onOpenAncestor: (id: string) => void;
}) {
  const parts: Array<
    | { type: 'text'; value: string }
    | { type: 'cite'; personId: string; field: string }
  > = [];
  const re = /\[person:(@[^@]+@):(name|age|location|kinshipLabel|deathDuringEvent)\]/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx)
      parts.push({ type: 'text', value: text.slice(lastIdx, m.index) });
    parts.push({ type: 'cite', personId: m[1]!, field: m[2]! });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) parts.push({ type: 'text', value: text.slice(lastIdx) });

  const paragraphs: Array<typeof parts> = [[]];
  for (const part of parts) {
    if (part.type === 'text' && part.value.includes('\n\n')) {
      const chunks = part.value.split(/\n\n+/);
      for (let i = 0; i < chunks.length; i++) {
        if (i > 0) paragraphs.push([]);
        if (chunks[i])
          paragraphs[paragraphs.length - 1]!.push({ type: 'text', value: chunks[i]! });
      }
    } else {
      paragraphs[paragraphs.length - 1]!.push(part);
    }
  }

  return (
    <>
      {paragraphs.map((para, i) => (
        <p key={i}>
          {para.map((p, j) => {
            if (p.type === 'text') return <span key={j}>{p.value}</span>;
            const person = peopleIndex.get(p.personId);
            const tooltip = person ? `${person.name} · ${p.field}` : p.personId;
            return (
              <span
                key={j}
                className="citation"
                title={tooltip}
                onClick={() => person && onOpenAncestor(p.personId)}
                style={{ cursor: person ? 'pointer' : 'default' }}
              >
                ❦
              </span>
            );
          })}
        </p>
      ))}
    </>
  );
}

// ----------------------------------------------------------------------
// Per-event ancestor count (includes custom events)
// ----------------------------------------------------------------------

function useEventCounts(
  events: HistoricalEvent[],
  entities: EntityStore
): Map<string, number> {
  return useMemo(() => {
    const m = new Map<string, number>();
    for (const ev of events) {
      let n = 0;
      for (const p of entities.people) {
        if (p.isLiving) continue;
        const birth = p.birth?.date?.year;
        const death = p.death?.date?.year;
        if (birth == null || death == null) continue;
        if (birth > ev.dateRange.end) continue;
        if (death < ev.dateRange.start) continue;
        const loc = p.birth?.place ?? p.death?.place;
        if (!loc || loc.lat == null || loc.lng == null) {
          n++;
          continue;
        }
        if (
          loc.lat >= ev.geoBbox.minLat &&
          loc.lat <= ev.geoBbox.maxLat &&
          loc.lng >= ev.geoBbox.minLng &&
          loc.lng <= ev.geoBbox.maxLng
        ) {
          n++;
        }
      }
      m.set(ev.id, n);
    }
    return m;
  }, [events, entities]);
}
