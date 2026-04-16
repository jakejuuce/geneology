'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { DotAtYear, ArcPoint, Person } from '@/lib/types';
import type { KinshipModule } from '@/lib/kinship';

interface Props {
  dots: DotAtYear[];
  arcs: Array<{ id: string; points: ArcPoint[] }>;
  selectedId: string | null;
  onSelectDot: (id: string) => void;
  peopleIndex: Map<string, Person>;
  kinship: KinshipModule;
  year: number;
}

export default function MapCanvas({
  dots,
  arcs,
  selectedId,
  onSelectDot,
  peopleIndex,
  kinship,
  year,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const dotLayerRef = useRef<L.LayerGroup | null>(null);
  const arcLayerRef = useRef<L.LayerGroup | null>(null);
  const tagLayerRef = useRef<L.LayerGroup | null>(null);

  // Initialize map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [42, -40],
      zoom: 3,
      minZoom: 2,
      maxZoom: 9,
      worldCopyJump: false,
      zoomControl: false,
    });

    // Stamen Watercolor via Stadia (free tier, attribution required)
    L.tileLayer(
      'https://tiles.stadiamaps.com/tiles/stamen_watercolor/{z}/{x}/{y}.jpg',
      {
        maxZoom: 16,
        attribution:
          '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://stamen.com">Stamen Design</a> &copy; OSM',
      }
    ).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    dotLayerRef.current = L.layerGroup().addTo(map);
    arcLayerRef.current = L.layerGroup().addTo(map);
    tagLayerRef.current = L.layerGroup().addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Render dots when they change.
  useEffect(() => {
    const dotLayer = dotLayerRef.current;
    if (!dotLayer) return;
    dotLayer.clearLayers();

    for (const dot of dots) {
      const person = peopleIndex.get(dot.id);
      if (!person) continue;
      const isSelected = dot.id === selectedId;
      const marker = L.circleMarker([dot.lat, dot.lng], {
        radius: isSelected ? 9 : 5,
        color: isSelected ? '#A68835' : '#6B2E2B',
        weight: isSelected ? 3 : 1,
        fillColor: isSelected ? '#6B2E2B' : '#2B1A0D',
        fillOpacity: 0.85,
        className: isSelected ? 'dot-selected' : 'dot',
      });
      marker.on('click', () => onSelectDot(dot.id));

      // Tooltip on hover (desktop)
      const kin = kinship.labelFor(dot.id);
      const years = `${person.birth?.date?.year ?? '?'}–${person.death?.date?.year ?? '?'}`;
      marker.bindTooltip(`${person.name} · ${kin.label} · ${years}`, {
        direction: 'top',
        offset: [0, -4],
        className: 'ancestor-tooltip',
      });

      dotLayer.addLayer(marker);
    }
  }, [dots, selectedId, peopleIndex, kinship, onSelectDot]);

  // Render arcs
  useEffect(() => {
    const arcLayer = arcLayerRef.current;
    if (!arcLayer) return;
    arcLayer.clearLayers();

    for (const arc of arcs) {
      const latlngs = arc.points.map((p) => [p.lat, p.lng] as [number, number]);
      const polyline = L.polyline(latlngs, {
        color: '#A68835',
        weight: 1,
        opacity: 0.35,
        dashArray: '2,4',
      });
      arcLayer.addLayer(polyline);
    }
  }, [arcs]);

  // Render floating tag at selected dot
  useEffect(() => {
    const tagLayer = tagLayerRef.current;
    if (!tagLayer) return;
    tagLayer.clearLayers();

    if (!selectedId) return;
    const person = peopleIndex.get(selectedId);
    if (!person) return;
    const dot = dots.find((d) => d.id === selectedId);
    if (!dot) return;

    const years = `${person.birth?.date?.year ?? '?'}–${person.death?.date?.year ?? '?'}`;
    const html = `
      <div class="floating-tag">
        <span class="name">${escapeHtml(person.name).toUpperCase()}</span>
        <span class="years"> · ${years}</span>
      </div>
    `;
    const icon = L.divIcon({
      html,
      className: 'floating-tag-wrap',
      iconSize: undefined as unknown as L.PointTuple,
      iconAnchor: [0, 28],
    });
    const marker = L.marker([dot.lat, dot.lng], { icon, interactive: false });
    tagLayer.addLayer(marker);
  }, [selectedId, dots, peopleIndex]);

  return <div ref={containerRef} className="map-canvas" />;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    if (c === '&') return '&amp;';
    if (c === '<') return '&lt;';
    if (c === '>') return '&gt;';
    if (c === '"') return '&quot;';
    return '&#39;';
  });
}
