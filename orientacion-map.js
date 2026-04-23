import { state, findPoint } from './orientacion-state.js';
import { utmToLatLon, latLonToUTM, logMessage } from './orientacion-utils.js';

let map;
let markers = new Map();
let routeLayers = [];
let locateMarker = null;
let searchMarker = null;
let pointPlacementCallback = null;

const layers = {};

function pointIcon(type) {
  if (type === 'start') return L.divIcon({ className:'', html:'<div class="map-marker-start"></div>', iconSize:[24,24], iconAnchor:[12,20] });
  if (type === 'finish') return L.divIcon({ className:'', html:'<div class="map-marker-finish"></div>', iconSize:[24,24], iconAnchor:[12,12] });
  return L.divIcon({ className:'', html:'<div class="map-marker-point"></div>', iconSize:[20,20], iconAnchor:[10,10] });
}

function addLayerDefinitions() {
  layers.mapant = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 20,
    attribution: 'MAPANT principal pendiente de endpoint público verificado · fallback OSM'
  });
  layers.ign = L.tileLayer('https://www.ign.es/wmts/ign-base?request=GetTile&service=WMTS&Version=1.0.0&Layer=IGNBaseTodo&Style=default&Format=image/jpeg&TileMatrixSet=GoogleMapsCompatible&TileMatrix={z}&TileRow={y}&TileCol={x}', {
    maxZoom: 19,
    attribution: 'IGN'
  });
  layers.aerial = L.tileLayer('https://www.ign.es/wmts/pnoa-ma?request=GetTile&service=WMTS&Version=1.0.0&Layer=OI.OrthoimageCoverage&Style=default&Format=image/jpeg&TileMatrixSet=GoogleMapsCompatible&TileMatrix={z}&TileRow={y}&TileCol={x}', {
    maxZoom: 19,
    attribution: 'PNOA'
  });
}

export function initMap(onMapPointPicked) {
  pointPlacementCallback = onMapPointPicked;
  map = L.map('map', { zoomControl:true }).setView([40.35, -1.35], 14);
  addLayerDefinitions();
  layers.mapant.addTo(map);
  L.control.layers({ 'MAPANT': layers.mapant, 'IGN': layers.ign, 'Aérea': layers.aerial }, {}).addTo(map);

  map.on('click', e => {
    if (pointPlacementCallback) pointPlacementCallback(e.latlng);
  });
}

export function setPreferredLayer(name) {
  if (!map || !layers[name]) return;
  Object.values(layers).forEach(layer => { if (map.hasLayer(layer)) map.removeLayer(layer); });
  layers[name].addTo(map);
}

export function renderPoints(points, special) {
  if (!map) return;
  const all = [special.start, special.finish, ...points].filter(Boolean);
  const currentIds = new Set(all.map(p => p.id));

  for (const [id, marker] of markers.entries()) {
    if (!currentIds.has(id)) {
      map.removeLayer(marker);
      markers.delete(id);
    }
  }

  all.forEach(point => {
    const ll = point.lat && point.lon ? { lat: point.lat, lon: point.lon } : utmToLatLon(point.utm);
    if (!ll) return;
    point.lat = ll.lat;
    point.lon = ll.lon;
    const existing = markers.get(point.id);
    if (existing) {
      existing.setLatLng([ll.lat, ll.lon]);
      existing.setIcon(pointIcon(point.type));
      existing.setTooltipContent(point.id);
    } else {
      const marker = L.marker([ll.lat, ll.lon], { icon: pointIcon(point.type), draggable:true })
        .addTo(map)
        .bindTooltip(point.id, { permanent:true, direction:'top', className:'point-label' });
      marker.on('dragend', ev => {
        const latlng = ev.target.getLatLng();
        const utm = latLonToUTM(latlng.lat, latlng.lng);
        if (!utm) return;
        point.lat = latlng.lat;
        point.lon = latlng.lng;
        point.utm = utm;
        document.dispatchEvent(new CustomEvent('orientacion:pointdrag', { detail:{ point } }));
      });
      markers.set(point.id, marker);
    }
  });
}

export function zoomToPoint(id) {
  const p = findPoint(id);
  if (!p) return;
  const ll = p.lat && p.lon ? { lat:p.lat, lon:p.lon } : utmToLatLon(p.utm);
  if (!ll || !map) return;
  map.setView([ll.lat, ll.lon], 18);
}

export function useCurrentLocation() {
  if (!navigator.geolocation || !map) return;
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude, longitude } = pos.coords;
    if (locateMarker) map.removeLayer(locateMarker);
    locateMarker = L.marker([latitude, longitude]).addTo(map).bindPopup('Tu ubicación').openPopup();
    map.setView([latitude, longitude], 17);
  });
}

export async function searchPlace(query) {
  if (!query || !map) return;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers:{ 'Accept':'application/json' }});
  const json = await res.json();
  if (!Array.isArray(json) || !json.length) return;
  const hit = json[0];
  const lat = Number(hit.lat), lon = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  if (searchMarker) map.removeLayer(searchMarker);
  searchMarker = L.marker([lat, lon]).addTo(map).bindPopup(hit.display_name).openPopup();
  map.setView([lat, lon], 15);
}

export function renderRoutes(routes) {
  if (!map) return;
  routeLayers.forEach(layer => map.removeLayer(layer));
  routeLayers = [];

  routes.forEach(route => {
    const latlngs = (route.sequence || []).map(id => {
      const p = findPoint(id);
      const ll = p ? (p.lat && p.lon ? { lat:p.lat, lon:p.lon } : utmToLatLon(p.utm)) : null;
      return ll ? [ll.lat, ll.lon] : null;
    }).filter(Boolean);
    if (latlngs.length >= 2) {
      const line = L.polyline(latlngs, { color:'#ff4be1', weight:3, opacity:.9 }).addTo(map);
      routeLayers.push(line);
    }
  });
}

export function setMapStatus(text) {
  const el = document.getElementById('mapStatus');
  if (el) el.textContent = text;
}

export function centerOnAll(points, special) {
  if (!map) return;
  const all = [special.start, special.finish, ...points].map(p => p && (p.lat && p.lon ? [p.lat,p.lon] : (() => { const ll = utmToLatLon(p.utm); return ll ? [ll.lat,ll.lon] : null; })())).filter(Boolean);
  if (all.length) map.fitBounds(all, { padding:[30,30] });
}
