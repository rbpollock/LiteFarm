import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import * as pmtiles from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';

// irl.coop sovereign basemap (OpenMapServer): the self-hosted PMTiles served by
// MinIO range requests + self-hosted glyphs — no Google, no external tiles.
const TILES = 'https://s3api.irl.coop/maps/coverage.pmtiles';

const STYLE = {
  version: 8,
  glyphs: 'https://maps.irl.coop/glyphs/{fontstack}/{range}.pbf',
  sources: {
    basemap: { type: 'vector', url: `pmtiles://${TILES}`, maxzoom: 14 },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#f5f0e6' } },
    { id: 'water', type: 'fill', source: 'basemap', 'source-layer': 'water', paint: { 'fill-color': '#a9c8dc' } },
    {
      id: 'landcover',
      type: 'fill',
      source: 'basemap',
      'source-layer': 'landcover',
      filter: ['in', 'class', 'wood', 'grass', 'grassland'],
      paint: { 'fill-color': '#d7e0c4', 'fill-opacity': 0.7 },
    },
    {
      id: 'roads',
      type: 'line',
      source: 'basemap',
      'source-layer': 'transportation',
      filter: ['in', 'class', 'motorway', 'trunk', 'primary', 'secondary'],
      paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.8, 14, 5] },
    },
  ],
};

// A minimal, sovereign location picker: basemap + a marker at `center`, click to
// move the pin (onPick returns {lat, lng}).
export default function CoopMap({ center, onPick, height = 320 }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return; // container not mounted yet — should not happen (div is unconditional)
    const protocol = new pmtiles.Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);
    const hasCenter = center?.lng != null && center?.lat != null;
    const map = new maplibregl.Map({
      container: node,
      style: STYLE,
      center: hasCenter ? [center.lng, center.lat] : [-98.5, 39.8],
      zoom: hasCenter ? 16 : 3,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.on('click', (e) => onPickRef.current?.({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
    return () => map.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || center?.lng == null || center?.lat == null) return;
    const ll = [center.lng, center.lat];
    if (markerRef.current) {
      markerRef.current.setLngLat(ll);
    } else {
      markerRef.current = new maplibregl.Marker({ color: '#c25e3a' }).setLngLat(ll).addTo(map);
    }
    map.flyTo({ center: ll, zoom: 16 });
  }, [center?.lat, center?.lng]);

  return <div ref={containerRef} style={{ width: '100%', height, flexGrow: 1 }} />;
}
