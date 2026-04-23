export function isValidUTM(utm) {
  return /^(\d{1,2}[C-HJ-NP-X])\s+\d{6}\s+\d{7}$/i.test(String(utm || '').trim());
}

export function normalizeUTM(utm) {
  return String(utm || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

export function parseUTM(utm) {
  const txt = normalizeUTM(utm);
  const m = txt.match(/^(\d{1,2})([C-HJ-NP-X])\s+(\d{6})\s+(\d{7})$/i);
  if (!m) return null;
  return { zoneNum: Number(m[1]), zoneLetter: m[2].toUpperCase(), easting: Number(m[3]), northing: Number(m[4]) };
}

export function utmToLatLon(utm) {
  const p = parseUTM(utm);
  if (!p || typeof proj4 === 'undefined') return null;
  const northBands = ['N','P','Q','R','S','T','U','V','W','X'];
  const projUTM = `+proj=utm +zone=${p.zoneNum} +${northBands.includes(p.zoneLetter) ? 'north' : 'south'} +ellps=WGS84 +datum=WGS84 +units=m +no_defs`;
  const wgs84 = '+proj=longlat +datum=WGS84 +no_defs';
  try {
    const [lon, lat] = proj4(projUTM, wgs84, [p.easting, p.northing]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
  } catch (_) {
    return null;
  }
}

export function latLonToUTM(lat, lon) {
  if (typeof proj4 === 'undefined') return null;
  const zoneNum = Math.floor((lon + 180) / 6) + 1;
  const bandLetters = 'CDEFGHJKLMNPQRSTUVWX';
  const bandIndex = Math.max(0, Math.min(bandLetters.length - 1, Math.floor((lat + 80) / 8)));
  const zoneLetter = bandLetters[bandIndex];
  const projUTM = `+proj=utm +zone=${zoneNum} +${lat >= 0 ? 'north' : 'south'} +ellps=WGS84 +datum=WGS84 +units=m +no_defs`;
  const wgs84 = '+proj=longlat +datum=WGS84 +no_defs';
  try {
    const [easting, northing] = proj4(wgs84, projUTM, [lon, lat]);
    return `${zoneNum}${zoneLetter} ${Math.round(easting).toString().padStart(6,'0')} ${Math.round(northing).toString().padStart(7,'0')}`;
  } catch (_) {
    return null;
  }
}

export function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const la1 = toRad(a.lat), la2 = toRad(b.lat);
  const x = Math.sin(dLat/2)**2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon/2)**2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}

export function logMessage(message) {
  const box = document.getElementById('logBox');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'log-item';
  el.textContent = message;
  box.prepend(el);
}
