import { upsertPoint, state, saveState } from './orientacion-state.js';
import { normalizeUTM, isValidUTM, utmToLatLon, logMessage } from './orientacion-utils.js';

function buildPoint(id, description, utm) {
  const cleanId = String(id || '').trim().toUpperCase();
  const cleanDesc = String(description || '').trim();
  const cleanUtm = normalizeUTM(utm);
  const ll = isValidUTM(cleanUtm) ? utmToLatLon(cleanUtm) : null;
  return {
    id: cleanId,
    type: 'point',
    description: cleanDesc,
    utm: cleanUtm,
    lat: ll?.lat ?? null,
    lon: ll?.lon ?? null,
    elev: null
  };
}

export async function importExcel(file) {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type:'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval:'' });
  let count = 0;
  rows.forEach(row => {
    const id = row.id ?? row.ID ?? row.Id;
    const description = row.descripción ?? row.descripcion ?? row.DESCRIPCIÓN ?? row.DESCRIPCION ?? row.description;
    const utm = row.utm ?? row.UTM;
    if (!id || !utm) return;
    upsertPoint(buildPoint(id, description, utm));
    count++;
  });
  logMessage(`Excel importado: ${count} balizas.`);
  return count;
}

function parseWaypointName(name) {
  const txt = String(name || '').trim();
  const match = txt.match(/^([A-Za-z]\d+|B\d+|\d+)\s+(.+)$/);
  if (!match) return null;
  return { id: match[1].toUpperCase(), description: match[2].trim() };
}

export async function importAtak(file) {
  const text = await file.text();
  const xml = new DOMParser().parseFromString(text, 'text/xml');
  let count = 0;

  const wpts = Array.from(xml.getElementsByTagName('wpt'));
  wpts.forEach(wpt => {
    const lat = Number(wpt.getAttribute('lat'));
    const lon = Number(wpt.getAttribute('lon'));
    const name = wpt.getElementsByTagName('name')[0]?.textContent || '';
    const parsed = parseWaypointName(name);
    if (!parsed || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const utm = window.proj4 ? null : null;
    const converted = typeof window.proj4 !== 'undefined' ? latLonToUTMFromWindow(lat, lon) : null;
    if (!converted) return;
    upsertPoint(buildPoint(parsed.id, parsed.description, converted));
    count++;
  });

  const placemarks = Array.from(xml.getElementsByTagName('Placemark'));
  placemarks.forEach(pm => {
    const name = pm.getElementsByTagName('name')[0]?.textContent || '';
    const parsed = parseWaypointName(name);
    const coordTxt = pm.getElementsByTagName('coordinates')[0]?.textContent || '';
    const parts = coordTxt.trim().split(',');
    const lon = Number(parts[0]);
    const lat = Number(parts[1]);
    if (!parsed || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const converted = typeof window.proj4 !== 'undefined' ? latLonToUTMFromWindow(lat, lon) : null;
    if (!converted) return;
    upsertPoint(buildPoint(parsed.id, parsed.description, converted));
    count++;
  });

  logMessage(`ATAK importado: ${count} balizas actualizadas.`);
  return count;
}

function latLonToUTMFromWindow(lat, lon) {
  const zoneNum = Math.floor((lon + 180) / 6) + 1;
  const bandLetters = 'CDEFGHJKLMNPQRSTUVWX';
  const bandIndex = Math.max(0, Math.min(bandLetters.length - 1, Math.floor((lat + 80) / 8)));
  const zoneLetter = bandLetters[bandIndex];
  const projUTM = `+proj=utm +zone=${zoneNum} +${lat >= 0 ? 'north' : 'south'} +ellps=WGS84 +datum=WGS84 +units=m +no_defs`;
  const wgs84 = '+proj=longlat +datum=WGS84 +no_defs';
  const [easting, northing] = proj4(wgs84, projUTM, [lon, lat]);
  return `${zoneNum}${zoneLetter} ${Math.round(easting).toString().padStart(6,'0')} ${Math.round(northing).toString().padStart(7,'0')}`;
}

export function exportJson() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'orientacion_state.json';
  a.click();
  URL.revokeObjectURL(url);
}

export async function importJson(file) {
  const raw = JSON.parse(await file.text());
  if (raw.meta) state.meta = { ...state.meta, ...raw.meta };
  if (raw.special) state.special = { ...state.special, ...raw.special };
  if (Array.isArray(raw.points)) state.points = raw.points;
  if (Array.isArray(raw.routes)) state.routes = raw.routes;
  saveState();
  logMessage('JSON importado.');
}
