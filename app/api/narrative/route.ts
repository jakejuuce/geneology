// Streaming narrative generation for historical events.
// Filters the entity store to ancestors alive during the event and
// within the event's geoBbox, passes a structured list to Claude with
// a strict citation contract, streams the response to the client.

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EntityStore, Person } from '@/lib/types';
import { KinshipModule } from '@/lib/kinship';
import { findEventById, type HistoricalEvent } from '@/data/events';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface RequestBody {
  eventId?: string;
  event?: HistoricalEvent;
}

export async function POST(request: Request) {
  const body = (await request.json()) as RequestBody;

  // Accept either a curated eventId or a full event object (used for custom events)
  let event: HistoricalEvent | undefined;
  if (body.event) {
    event = body.event;
  } else if (body.eventId) {
    event = findEventById(body.eventId);
  }
  if (!event) {
    return new Response('Event not provided or unknown', { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({
        error: 'ANTHROPIC_API_KEY not set. Paste your key into .env.local and restart the dev server.',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Load entity store (server-side read from public/data)
  const dataDir = resolve(process.cwd(), 'public/data');
  const entities = JSON.parse(
    readFileSync(resolve(dataDir, 'entities.json'), 'utf-8')
  ) as EntityStore;

  const kinship = new KinshipModule(entities.people, entities.momId);

  // Filter ancestors alive during event + within geoBbox
  const aliveDuringEvent = entities.people.filter((p) => {
    if (p.isLiving) return false;
    const birth = p.birth?.date?.year;
    const death = p.death?.date?.year;
    if (birth == null || death == null) return false;
    return birth <= event.dateRange.end && death >= event.dateRange.start;
  });

  const withinBbox = aliveDuringEvent.filter((p) => {
    const loc = locationAtEventStart(p, event.dateRange.start);
    if (!loc || loc.lat == null || loc.lng == null) return false;
    return (
      loc.lat >= event.geoBbox.minLat &&
      loc.lat <= event.geoBbox.maxLat &&
      loc.lng >= event.geoBbox.minLng &&
      loc.lng <= event.geoBbox.maxLng
    );
  });

  // Cap the list to the 30 closest narrative subjects (best-populated era)
  const ranked = rankNarrativeCandidates(withinBbox, event.dateRange.start);
  const candidates = ranked.slice(0, 30);

  if (candidates.length === 0) {
    // No ancestors fit — return a polite empty narrative
    return new Response(
      serverSentEvent(
        'No ancestors in your tree were present for this event. Try a later or earlier one.'
      ),
      {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      }
    );
  }

  // Structured summary for the prompt
  const structured = candidates.map((p) => {
    const age = event.dateRange.start - (p.birth?.date?.year ?? 0);
    const loc = locationAtEventStart(p, event.dateRange.start);
    const kin = kinship.labelFor(p.id);
    return {
      id: p.id,
      name: p.name,
      kinshipLabel: kin.label,
      ageAtEventStart: age,
      locationAtEventStart: loc?.label ?? 'unknown',
      deathDuringEvent:
        (p.death?.date?.year ?? Infinity) <= event.dateRange.end &&
        (p.death?.date?.year ?? -Infinity) >= event.dateRange.start,
    };
  });

  const system = `You are a family historian writing a grounded narrative of a specific historical event from the perspective of the reader's ancestors.

RULES:
1. Every factual claim about a person MUST be followed by an inline citation token of the form [person:@Ixxxxxx@:FIELD] where FIELD is one of: name, age, location, kinshipLabel, deathDuringEvent.
2. Use ONLY facts from the structured data below. Do NOT invent occupations, emotions, actions, marriages, injuries, or anything not in the data. If the data says nothing about whether a person fought, do not say they fought.
3. Write 3-5 paragraphs. Prose style: understated, archival, warm. Like a serious family historian writing for a descendant, not dramatic fiction.
4. You may name the event itself and general, widely-known facts about the event (e.g., dates, that battles occurred) WITHOUT citations, but any claim about a specific person requires a citation.
5. Reference ancestors by their kinship label on first mention, then name on subsequent mentions.
6. End with a quiet closing sentence that names the event again and the total count of documented ancestors.`;

  const userPrompt = `EVENT: ${event.title} (${event.dateRange.start}–${event.dateRange.end})
${event.blurb}

DOCUMENTED ANCESTORS present during this event (${candidates.length} total):
${JSON.stringify(structured, null, 2)}

Write the narrative now.`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await anthropic.messages.stream({
          model: 'claude-opus-4-6',
          max_tokens: 2000,
          system,
          messages: [{ role: 'user', content: userPrompt }],
        });

        for await (const event of response) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            controller.enqueue(encoder.encode(serverSentEvent(event.delta.text)));
          }
        }
        controller.enqueue(encoder.encode('event: done\ndata: \n\n'));
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown error';
        controller.enqueue(
          encoder.encode(`event: error\ndata: ${JSON.stringify({ error: msg })}\n\n`)
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

function locationAtEventStart(person: Person, eventStartYear: number) {
  // Location precedence: most recent RESI event ≤ event start, else birth
  const resi = person.events
    .filter((e) => e.type === 'RESI' && e.date && e.place?.label)
    .filter((e) => e.date!.year <= eventStartYear)
    .sort((a, b) => b.date!.year - a.date!.year);
  if (resi.length > 0 && resi[0]!.place?.lat != null) return resi[0]!.place;
  const birth = person.birth?.place;
  if (birth?.lat != null) return birth;
  const death = person.death?.place;
  return death?.lat != null ? death : null;
}

function rankNarrativeCandidates(people: Person[], year: number): Person[] {
  // Prefer ancestors aged 15-65 at event start (narratively active bracket)
  const scored = people.map((p) => {
    const age = year - (p.birth?.date?.year ?? 0);
    let score = 0;
    if (age >= 15 && age <= 65) score += 10;
    else if (age >= 5 && age < 15) score += 5;
    else if (age > 65) score += 3;
    // Bonus for having more events / richer data
    score += Math.min(5, p.events.length);
    return { p, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.p);
}

function serverSentEvent(data: string): string {
  // Escape newlines in the data so they survive SSE framing
  const lines = data.split('\n').map((l) => `data: ${l}`).join('\n');
  return `${lines}\n\n`;
}
