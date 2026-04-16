// Keyword-matching geocoder for v1 demo.
// A real geocoding run (LocationIQ / OpenCage / Nominatim) is a separate
// script that writes public/data/places.json. This module is the fallback
// when a place isn't in the cache.
//
// DISAMBIGUATION RULES: many county names exist in both the UK and the US
// (Suffolk, Essex, Middlesex, Kent, Durham, Newcastle). The gazetteer is
// ordered so country-qualified matches run FIRST, then standalone country
// matches, then specific US cities, then generic country / state fallbacks.
// First match wins, so ordering is load-bearing. Do not reorder without
// tests.

import type { Place } from './types';

type Entry = { match: RegExp; lat: number; lng: number; note?: string };

// ---- Pass 1: country-qualified patterns (most specific) ----------------
const COUNTRY_QUALIFIED: Entry[] = [
  // --- United Kingdom (require country/region qualifier) ---
  { match: /\bsuffolk\b.*\b(england|uk|great britain)\b/i, lat: 52.19, lng: 0.97, note: 'Suffolk, England' },
  { match: /\bessex\b.*\b(england|uk)\b/i, lat: 51.74, lng: 0.47, note: 'Essex, England' },
  { match: /\bmiddlesex\b.*\b(england|uk|london)\b/i, lat: 51.57, lng: -0.33, note: 'Middlesex, England' },
  { match: /\bkent\b.*\b(england|uk)\b/i, lat: 51.21, lng: 0.58, note: 'Kent, England' },
  { match: /\bdurham\b.*\b(england|uk)\b/i, lat: 54.78, lng: -1.58, note: 'Durham, England' },
  { match: /\bnewcastle\b.*\b(england|uk|tyne|lyme|stafford)\b/i, lat: 54.97, lng: -1.61, note: 'Newcastle, England' },
  { match: /\bberkshire\b.*\b(england|uk)\b/i, lat: 51.46, lng: -1.14 },
  { match: /\bworcester\b.*\b(england|uk|worcestershire)\b/i, lat: 52.19, lng: -2.22 },
  { match: /\bhampshire\b.*\b(england|uk)\b/i, lat: 51.06, lng: -1.31 },
  { match: /\byorkshire\b.*\b(england|uk)\b/i, lat: 53.96, lng: -1.08 },
  { match: /\bcornwall\b.*\b(england|uk)\b/i, lat: 50.26, lng: -5.05 },
  { match: /\bdorset\b.*\b(england|uk)\b/i, lat: 50.75, lng: -2.33 },
  { match: /\bsomerset\b.*\b(england|uk)\b/i, lat: 51.11, lng: -2.94 },
  { match: /\bdevon\b.*\b(england|uk)\b/i, lat: 50.72, lng: -3.85 },
  { match: /\bwiltshire\b.*\b(england|uk)\b/i, lat: 51.35, lng: -1.97 },
  { match: /\bstafford\b.*\b(england|uk|shire)\b/i, lat: 52.87, lng: -2.17 },
  { match: /\bnottingham\b.*\b(england|uk|shire)\b/i, lat: 52.95, lng: -1.16 },
  { match: /\bnorthumberland\b.*\b(england|uk)\b/i, lat: 55.51, lng: -2.08 },
  { match: /\bflodden\b/i, lat: 55.62, lng: -2.15 },

  // --- United States states (require US/USA/United States qualifier) ---
  // Massachusetts
  { match: /\bbraintree\b.*\b(mass|ma|usa|united states)\b/i, lat: 42.2, lng: -71.0 },
  { match: /\bquincy\b.*\b(mass|ma|usa)\b/i, lat: 42.25, lng: -71.0 },
  { match: /\bboston\b.*\b(mass|ma|usa|united states)\b/i, lat: 42.36, lng: -71.06 },
  { match: /\bboston\b.*\b(suffolk\s*co|suffolk\s*county)\b/i, lat: 42.36, lng: -71.06 },
  { match: /\bsalem\b.*\b(mass|ma|essex\s*co|usa|united states)\b/i, lat: 42.52, lng: -70.9 },
  { match: /\bplymouth\b.*\b(mass|ma|usa|plymouth\s*co)\b/i, lat: 41.96, lng: -70.67 },
  { match: /\bcambridge\b.*\b(mass|ma|middlesex\s*co)\b/i, lat: 42.37, lng: -71.11 },
  { match: /\bworcester\b.*\b(mass|ma|usa)\b/i, lat: 42.26, lng: -71.8 },
  { match: /\bsuffolk\b.*\b(mass|ma|suffolk\s*co)\b/i, lat: 42.36, lng: -71.06 },
  { match: /\bessex\b.*\b(mass|ma|essex\s*co)\b/i, lat: 42.6, lng: -70.88 },
  { match: /\bmiddlesex\b.*\b(mass|ma|middlesex\s*co.*ma)\b/i, lat: 42.46, lng: -71.39 },
  { match: /\bmassachusetts\b/i, lat: 42.25, lng: -71.8 },
  // Connecticut
  { match: /\bhartford\b.*\b(conn|ct|usa|hartford\s*co)\b/i, lat: 41.76, lng: -72.67 },
  { match: /\bnew haven\b/i, lat: 41.31, lng: -72.92 },
  { match: /\bridgefield\b/i, lat: 41.29, lng: -73.49 },
  { match: /\bfairfield\b.*\b(conn|ct|fairfield\s*co)\b/i, lat: 41.15, lng: -73.26 },
  { match: /\bconnecticut\b/i, lat: 41.6, lng: -72.7 },
  // Rhode Island
  { match: /\bnewport\b.*\b(rhode|ri|newport\s*co)\b/i, lat: 41.49, lng: -71.31 },
  { match: /\bprovidence\b.*\b(rhode|ri|usa)\b/i, lat: 41.82, lng: -71.41 },
  { match: /\brhode island\b/i, lat: 41.6, lng: -71.5 },
  // New York
  { match: /\bmanhattan\b/i, lat: 40.73, lng: -74.0 },
  { match: /\bnew york city\b|\bnyc\b/i, lat: 40.73, lng: -74.0 },
  { match: /\balbany\b.*\b(new york|ny|usa)\b/i, lat: 42.65, lng: -73.76 },
  { match: /\bnew york\b/i, lat: 42.7, lng: -75.5 },
  // New Jersey
  { match: /\bpedricks neck\b/i, lat: 39.57, lng: -75.47 },
  { match: /\bsalem\b.*\b(new jersey|nj)\b/i, lat: 39.57, lng: -75.47 },
  { match: /\bnew jersey\b/i, lat: 40.2, lng: -74.7 },
  // Pennsylvania
  { match: /\bphiladelphia\b/i, lat: 39.95, lng: -75.16 },
  { match: /\bberks\b.*\b(penn|pa|usa)\b/i, lat: 40.42, lng: -75.93 },
  { match: /\bpittsburgh\b/i, lat: 40.44, lng: -79.99 },
  { match: /\bpennsylvania\b/i, lat: 40.87, lng: -77.78 },
  // Virginia
  { match: /\blouisa\b.*\bvirginia\b/i, lat: 38.03, lng: -77.99 },
  { match: /\brichmond\b.*\b(virginia|va)\b/i, lat: 37.54, lng: -77.44 },
  { match: /\bjamestown\b/i, lat: 37.21, lng: -76.78 },
  { match: /\bvirginia\b/i, lat: 37.5, lng: -78.65 },
  // Carolinas + South
  { match: /\bnorth carolina\b/i, lat: 35.55, lng: -79.38 },
  { match: /\bsouth carolina\b/i, lat: 33.84, lng: -81.16 },
  { match: /\bdurham\b.*\b(north carolina|nc|usa)\b/i, lat: 35.99, lng: -78.9 },
  { match: /\bkentucky\b/i, lat: 37.84, lng: -84.27 },
  { match: /\btennessee\b/i, lat: 35.86, lng: -86.66 },
  // Midwest
  { match: /\bohio\b/i, lat: 40.42, lng: -82.91 },
  { match: /\bindiana\b/i, lat: 40.27, lng: -86.13 },
  { match: /\billinois\b/i, lat: 40.0, lng: -89.0 },
  { match: /\biowa\b/i, lat: 42.03, lng: -93.58 },
  { match: /\bmissouri\b/i, lat: 38.57, lng: -92.4 },
  { match: /\bmichigan\b/i, lat: 44.32, lng: -85.6 },
  { match: /\bwisconsin\b/i, lat: 44.5, lng: -89.5 },
  // Deep South
  { match: /\bgeorgia\b.*\b(usa|united states|georgia,\s*us)\b/i, lat: 32.17, lng: -82.9 },
  { match: /\balabama\b/i, lat: 32.8, lng: -86.79 },
  { match: /\bmississippi\b/i, lat: 32.75, lng: -89.68 },
  { match: /\blouisiana\b/i, lat: 31.17, lng: -91.87 },
  { match: /\btexas\b/i, lat: 31.0, lng: -100.0 },
  // West
  { match: /\bcalifornia\b/i, lat: 36.78, lng: -119.42 },
  { match: /\boregon\b/i, lat: 44.0, lng: -120.5 },
  { match: /\bwashington\b.*\b(usa|state|wa)\b/i, lat: 47.45, lng: -121.49 },
  { match: /\butah\b/i, lat: 39.32, lng: -111.09 },
  { match: /\bcolorado\b/i, lat: 39.0, lng: -105.5 },
  { match: /\barizona\b/i, lat: 34.05, lng: -111.09 },
  { match: /\bnevada\b/i, lat: 39.87, lng: -117.22 },

  // --- Ireland (qualifier required) ---
  { match: /\blondonderry\b/i, lat: 54.99, lng: -7.31 },
  { match: /\bderry\b/i, lat: 54.99, lng: -7.31 },
  { match: /\bdublin\b/i, lat: 53.35, lng: -6.26 },
  { match: /\bbelfast\b/i, lat: 54.6, lng: -5.93 },
  { match: /\bcork\b/i, lat: 51.9, lng: -8.47 },

  // --- Scotland ---
  { match: /\bperth\b.*\b(scotland|perthshire)\b/i, lat: 56.4, lng: -3.43 },
  { match: /\bedinburgh\b/i, lat: 55.95, lng: -3.19 },
  { match: /\bglasgow\b/i, lat: 55.86, lng: -4.25 },
];

// ---- Pass 2: country fallbacks (when only country is known) ------------
const COUNTRY_FALLBACKS: Entry[] = [
  { match: /\bengland\b/i, lat: 52.36, lng: -1.17 },
  { match: /\bscotland\b/i, lat: 56.49, lng: -4.2 },
  { match: /\b(ireland|\beire\b)\b/i, lat: 53.4, lng: -8.0 },
  { match: /\bwales\b/i, lat: 52.13, lng: -3.78 },
  { match: /\b(united kingdom|\buk\b|great britain)\b/i, lat: 54.0, lng: -2.5 },
  { match: /\bfrance\b/i, lat: 48.85, lng: 2.35 },
  { match: /\b(germany|deutschland)\b/i, lat: 51.17, lng: 10.45 },
  { match: /\b(netherlands|holland)\b/i, lat: 52.13, lng: 5.29 },
  { match: /\bbelgium\b/i, lat: 50.5, lng: 4.47 },
  { match: /\bswitzerland\b/i, lat: 46.82, lng: 8.23 },
  { match: /\bitaly\b/i, lat: 41.87, lng: 12.57 },
  { match: /\bspain\b/i, lat: 40.46, lng: -3.75 },
  { match: /\bnorway\b/i, lat: 60.47, lng: 8.47 },
  { match: /\bsweden\b/i, lat: 60.13, lng: 18.64 },
  { match: /\bdenmark\b/i, lat: 56.26, lng: 9.5 },
  { match: /\b(united states|\busa\b|u\.s\.a\.|u\.s\.)\b/i, lat: 39.5, lng: -98.35 },
  { match: /\bcanada\b/i, lat: 56.13, lng: -106.35 },
  { match: /\b(london|middlesex)\b/i, lat: 51.51, lng: -0.13, note: 'London default' },
];

export function geocodePlace(label: string): Place {
  const normalized = label.trim();
  if (!normalized || normalized === '—') {
    return { label: normalized, lat: null, lng: null };
  }

  // Pass 1: country-qualified
  for (const entry of COUNTRY_QUALIFIED) {
    if (entry.match.test(normalized)) {
      return { label: normalized, lat: entry.lat, lng: entry.lng };
    }
  }
  // Pass 2: country fallback
  for (const entry of COUNTRY_FALLBACKS) {
    if (entry.match.test(normalized)) {
      return { label: normalized, lat: entry.lat, lng: entry.lng };
    }
  }

  return { label: normalized, lat: null, lng: null };
}

// Batch geocode with a deterministic jitter so multiple people at the same
// approximate coordinates don't stack perfectly. Jitter is ±0.4 deg (~40km)
// keyed off a stable hash of the label so the same place always jitters
// the same way.
export function geocodePlaceWithJitter(
  label: string,
  personIdForJitter: string
): Place {
  const base = geocodePlace(label);
  if (base.lat == null || base.lng == null) return base;

  const h = hash(personIdForJitter);
  const jitterLat = ((h % 1000) / 1000 - 0.5) * 0.8;
  const jitterLng = (((h >> 10) % 1000) / 1000 - 0.5) * 0.8;
  return {
    label: base.label,
    lat: base.lat + jitterLat,
    lng: base.lng + jitterLng,
  };
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
