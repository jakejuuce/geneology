'use client';

import { useEffect, useRef, useState } from 'react';
import { EVENTS, type HistoricalEvent } from '@/data/events';
import type { EntityStore, Person } from '@/lib/types';

interface Props {
  entities: EntityStore;
  peopleIndex: Map<string, Person>;
  onOpenAncestor: (id: string) => void;
}

export default function Chronicle({ entities, peopleIndex, onOpenAncestor }: Props) {
  const [selected, setSelected] = useState<HistoricalEvent | null>(null);
  const [narrative, setNarrative] = useState<string>('');
  const [status, setStatus] = useState<'idle' | 'streaming' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Per-event ancestor counts, computed once
  const countsByEvent = useEventCounts(entities);

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
        body: JSON.stringify({ eventId: event.id }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const body = await res.text();
        try {
          const parsed = JSON.parse(body);
          setError(parsed.error ?? body);
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

        // Split on SSE delimiter
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
                const parsed = JSON.parse(m[1]!);
                setError(parsed.error ?? 'unknown error');
              } catch {
                setError(m[1] ?? 'unknown error');
              }
            }
            setStatus('error');
            continue;
          }
          // Collect all data: lines and join
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
        Select an event. See which of your ancestors lived through it.
      </p>
      <div className="event-list">
        {EVENTS.map((ev) => {
          const count = countsByEvent.get(ev.id) ?? 0;
          return (
            <button
              key={ev.id}
              className="event-card"
              onClick={() => loadNarrative(ev)}
              disabled={count === 0}
            >
              <div className="event-card-dates">
                {ev.dateRange.start}—{ev.dateRange.end}
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
          );
        })}
      </div>
    </div>
  );
}

// Parse citation tokens [person:@I123@:FIELD] and render them as clickable spans
function RenderNarrative({
  text,
  peopleIndex,
  onOpenAncestor,
}: {
  text: string;
  peopleIndex: Map<string, Person>;
  onOpenAncestor: (id: string) => void;
}) {
  const parts: Array<{ type: 'text'; value: string } | { type: 'cite'; personId: string; field: string }> = [];
  const re = /\[person:(@[^@]+@):(name|age|location|kinshipLabel|deathDuringEvent)\]/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) parts.push({ type: 'text', value: text.slice(lastIdx, m.index) });
    parts.push({ type: 'cite', personId: m[1]!, field: m[2]! });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) parts.push({ type: 'text', value: text.slice(lastIdx) });

  // Split into paragraphs on double-newline
  const paragraphs: Array<typeof parts> = [[]];
  for (const part of parts) {
    if (part.type === 'text' && part.value.includes('\n\n')) {
      const chunks = part.value.split(/\n\n+/);
      for (let i = 0; i < chunks.length; i++) {
        if (i > 0) paragraphs.push([]);
        if (chunks[i]) paragraphs[paragraphs.length - 1]!.push({ type: 'text', value: chunks[i]! });
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

function useEventCounts(entities: EntityStore): Map<string, number> {
  const m = new Map<string, number>();
  for (const ev of EVENTS) {
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
        // Still count them even without location; narrative filter is stricter
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
}
