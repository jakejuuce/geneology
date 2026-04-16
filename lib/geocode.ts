// Keyword-matching geocoder for v1 demo.
// A real geocoding run (LocationIQ / OpenCage / self-hosted Nominatim) is
// a separate script that writes public/data/places.json. This module is
// the fallback when a place isn't in the cache — it covers the most common
// historical regions in mom's tree (New England, England, Scotland, Ireland,
// Virginia, Pennsylvania, etc.) and returns { lat: null, lng: null } for the rest.

import type { Place } from './types';

// Ordered from most specific to least — first match wins.
// Lat/lng are approximate regional centers.
const KEYWORD_GAZETTEER: Array<{ match: RegExp; lat: number; lng: number }> = [
  // Massachusetts
  { match: /braintree|quincy/i, lat: 42.2, lng: -71.0 },
  { match: /boston|suffolk/i, lat: 42.36, lng: -71.06 },
  { match: /salem|essex/i, lat: 42.52, lng: -70.9 },
  { match: /plymouth/i, lat: 41.96, lng: -70.67 },
  { match: /cambridge|middlesex.*mass/i, lat: 42.37, lng: -71.11 },
  { match: /worcester/i, lat: 42.26, lng: -71.8 },
  { match: /springfield.*mass/i, lat: 42.1, lng: -72.59 },
  { match: /massachusetts/i, lat: 42.25, lng: -71.8 },
  // Connecticut
  { match: /hartford/i, lat: 41.76, lng: -72.67 },
  { match: /new haven/i, lat: 41.31, lng: -72.92 },
  { match: /ridgefield|fairfield.*conn/i, lat: 41.29, lng: -73.49 },
  { match: /connecticut/i, lat: 41.6, lng: -72.7 },
  // Rhode Island
  { match: /newport.*rhode|newport co.*rhode/i, lat: 41.49, lng: -71.31 },
  { match: /providence/i, lat: 41.82, lng: -71.41 },
  { match: /rhode island/i, lat: 41.6, lng: -71.5 },
  // New York
  { match: /manhattan|new york city|nyc/i, lat: 40.73, lng: -74.0 },
  { match: /albany/i, lat: 42.65, lng: -73.76 },
  { match: /new york/i, lat: 42.7, lng: -75.5 },
  // New Jersey
  { match: /pedricks neck|salem.*new jersey/i, lat: 39.57, lng: -75.47 },
  { match: /new jersey/i, lat: 40.2, lng: -74.7 },
  // Pennsylvania
  { match: /philadelphia/i, lat: 39.95, lng: -75.16 },
  { match: /berks.*penn/i, lat: 40.42, lng: -75.93 },
  { match: /pittsburgh/i, lat: 40.44, lng: -79.99 },
  { match: /pennsylvania/i, lat: 40.87, lng: -77.78 },
  // Virginia
  { match: /louisa.*virginia/i, lat: 38.03, lng: -77.99 },
  { match: /richmond.*virginia/i, lat: 37.54, lng: -77.44 },
  { match: /jamestown/i, lat: 37.21, lng: -76.78 },
  { match: /virginia/i, lat: 37.5, lng: -78.65 },
  // The Carolinas
  { match: /north carolina/i, lat: 35.55, lng: -79.38 },
  { match: /south carolina/i, lat: 33.84, lng: -81.16 },
  // Kentucky / mid-south
  { match: /kentucky/i, lat: 37.84, lng: -84.27 },
  { match: /tennessee/i, lat: 35.86, lng: -86.66 },
  // Mid-west migrations
  { match: /ohio/i, lat: 40.42, lng: -82.91 },
  { match: /indiana/i, lat: 40.27, lng: -86.13 },
  { match: /illinois/i, lat: 40.0, lng: -89.0 },
  { match: /iowa/i, lat: 42.03, lng: -93.58 },
  { match: /missouri/i, lat: 38.57, lng: -92.4 },
  // Great Lakes
  { match: /michigan/i, lat: 44.32, lng: -85.6 },
  { match: /wisconsin/i, lat: 44.5, lng: -89.5 },
  // Deep South
  { match: /georgia.*usa|georgia,\s*us|georgia,\s*united/i, lat: 32.17, lng: -82.9 },
  { match: /alabama/i, lat: 32.8, lng: -86.79 },
  { match: /mississippi/i, lat: 32.75, lng: -89.68 },
  { match: /louisiana/i, lat: 31.17, lng: -91.87 },
  { match: /texas/i, lat: 31.0, lng: -100.0 },
  // West
  { match: /california/i, lat: 36.78, lng: -119.42 },
  { match: /oregon/i, lat: 44.0, lng: -120.5 },
  { match: /washington.*usa|washington,\s*us/i, lat: 47.45, lng: -121.49 },
  { match: /utah/i, lat: 39.32, lng: -111.09 },
  { match: /colorado/i, lat: 39.0, lng: -105.5 },
  { match: /arizona/i, lat: 34.05, lng: -111.09 },
  { match: /nevada/i, lat: 39.87, lng: -117.22 },

  // England — counties
  { match: /london|middlesex/i, lat: 51.51, lng: -0.13 },
  { match: /kent/i, lat: 51.21, lng: 0.58 },
  { match: /devon|plympton/i, lat: 50.72, lng: -3.85 },
  { match: /wiltshire/i, lat: 51.35, lng: -1.97 },
  { match: /stafford|newcastle under lyme|trentham/i, lat: 52.87, lng: -2.17 },
  { match: /nottingham|wilford/i, lat: 52.95, lng: -1.16 },
  { match: /durham/i, lat: 54.78, lng: -1.58 },
  { match: /northumberland|flodden/i, lat: 55.51, lng: -2.08 },
  { match: /berkshire/i, lat: 51.46, lng: -1.14 },
  { match: /yorkshire/i, lat: 53.96, lng: -1.08 },
  { match: /england/i, lat: 52.36, lng: -1.17 },
  // Scotland
  { match: /perth|perthshire/i, lat: 56.4, lng: -3.43 },
  { match: /edinburgh/i, lat: 55.95, lng: -3.19 },
  { match: /glasgow/i, lat: 55.86, lng: -4.25 },
  { match: /scotland/i, lat: 56.49, lng: -4.2 },
  // Ireland
  { match: /londonderry|derry/i, lat: 54.99, lng: -7.31 },
  { match: /dublin/i, lat: 53.35, lng: -6.26 },
  { match: /belfast/i, lat: 54.6, lng: -5.93 },
  { match: /cork/i, lat: 51.9, lng: -8.47 },
  { match: /ireland/i, lat: 53.4, lng: -8.0 },
  // Wales
  { match: /wales|cardiff/i, lat: 52.13, lng: -3.78 },
  // Rest of Europe
  { match: /paris|france/i, lat: 48.85, lng: 2.35 },
  { match: /germany|deutschland/i, lat: 51.17, lng: 10.45 },
  { match: /netherlands|holland/i, lat: 52.13, lng: 5.29 },
  { match: /belgium/i, lat: 50.5, lng: 4.47 },
  { match: /switzerland/i, lat: 46.82, lng: 8.23 },
  { match: /italy/i, lat: 41.87, lng: 12.57 },
  { match: /spain/i, lat: 40.46, lng: -3.75 },
  { match: /norway/i, lat: 60.47, lng: 8.47 },
  { match: /sweden/i, lat: 60.13, lng: 18.64 },
  { match: /denmark/i, lat: 56.26, lng: 9.5 },

  // Generic fallback: "USA" → center of contiguous US
  { match: /united states|usa\b|u\.s\.a\.|u\.s\./i, lat: 39.5, lng: -98.35 },
];

export function geocodePlace(label: string): Place {
  const normalized = label.trim();
  if (!normalized || normalized === '—') {
    return { label: normalized, lat: null, lng: null };
  }

  for (const entry of KEYWORD_GAZETTEER) {
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
