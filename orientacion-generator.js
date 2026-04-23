import { state, findPoint, saveState } from './orientacion-state.js';
import { utmToLatLon, haversineMeters, logMessage } from './orientacion-utils.js';

async function fetchElevations(points) {
  const coords = [];
  const index = new Map();
  points.forEach(p => {
    const ll = p.lat && p.lon ? { lat:p.lat, lon:p.lon } : utmToLatLon(p.utm);
    if (!ll) return;
    const key = `${ll.lat.toFixed(6)},${ll.lon.toFixed(6)}`;
    if (index.has(key)) return;
    index.set(key, coords.length);
    coords.push({ key, ...ll });
  });
  const elevations = new Map();
  if (!coords.length) return elevations;
  for (let i = 0; i < coords.length; i += 100) {
    const batch = coords.slice(i, i + 100);
    const lats = batch.map(c => c.lat.toFixed(6)).join(',');
    const lons = batch.map(c => c.lon.toFixed(6)).join(',');
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${encodeURIComponent(lats)}&longitude=${encodeURIComponent(lons)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('No se pudo consultar elevación.');
    const json = await res.json();
    const arr = Array.isArray(json.elevation) ? json.elevation : [];
    batch.forEach((c, idx) => elevations.set(c.key, Number(arr[idx]) || 0));
  }
  return elevations;
}

function routeMetrics(sequence, elevations) {
  let distance = 0, pos = 0, neg = 0, maxLeg = 0;
  for (let i = 1; i < sequence.length; i++) {
    const a = findPoint(sequence[i - 1]);
    const b = findPoint(sequence[i]);
    const llA = a?.lat && a?.lon ? { lat:a.lat, lon:a.lon } : utmToLatLon(a?.utm);
    const llB = b?.lat && b?.lon ? { lat:b.lat, lon:b.lon } : utmToLatLon(b?.utm);
    if (!llA || !llB) continue;
    const seg = haversineMeters(llA, llB);
    distance += seg;
    maxLeg = Math.max(maxLeg, seg);
    const kA = `${llA.lat.toFixed(6)},${llA.lon.toFixed(6)}`;
    const kB = `${llB.lat.toFixed(6)},${llB.lon.toFixed(6)}`;
    const diff = (elevations.get(kB) || 0) - (elevations.get(kA) || 0);
    if (diff > 0) pos += diff;
    else if (diff < 0) neg += Math.abs(diff);
  }
  return {
    distance: Math.round(distance),
    maxLeg: Math.round(maxLeg),
    desnivelPositivo: Math.round(pos),
    desnivelNegativo: Math.round(neg),
    desnivelGlobal: Math.round(pos + neg),
    desnivelNeto: Math.round(pos - neg)
  };
}

function overlapPenalty(candidate, routes) {
  const own = new Set(candidate);
  return routes.reduce((sum, route) => sum + route.variableSequence.reduce((n, id) => n + (own.has(id) ? 1 : 0), 0), 0);
}

function assignDifficulty(route, avgDistance, avgClimb) {
  const distanceFactor = avgDistance ? route.distance / avgDistance : 1;
  const climbFactor = avgClimb ? route.desnivelGlobal / avgClimb : 1;
  const score = distanceFactor * 0.5 + climbFactor * 0.5;
  route.difficulty = score < 0.92 ? 'BAJA' : score > 1.08 ? 'ALTA' : 'MEDIA';
}

export async function generateRoutes() {
  const points = state.points.filter(p => p.utm);
  if (!state.special.start.utm || !state.special.finish.utm) throw new Error('Define salida y llegada.');
  if (points.length < state.meta.pointsPerRoute) throw new Error('No hay suficientes balizas.');

  const elevations = await fetchElevations([state.special.start, state.special.finish, ...points]);
  const participants = Array.from({ length: state.meta.participantsCount }, (_, i) => ({ name:`Participante ${i+1}`, qrId:`ORI-${String(i+1).padStart(3,'0')}` }));
  const target = state.meta.pointsPerRoute;

  let best = null;
  for (let attempt = 0; attempt < Math.max(24, state.meta.participantsCount * 3); attempt++) {
    const available = [...points].sort(() => Math.random() - 0.5);
    const routes = [];

    participants.forEach(participant => {
      let bestLocal = null;
      for (let local = 0; local < 80; local++) {
        const pool = [...available].sort(() => Math.random() - 0.5).slice(0, Math.min(points.length, target + 6));
        const variableSequence = pool.slice(0, target).map(p => p.id);
        const sequence = ['SALIDA', ...variableSequence, 'LLEGADA'];
        const metrics = routeMetrics(sequence, elevations);
        const penalty = overlapPenalty(variableSequence, routes);
        const score = (metrics.distance * 0.5) + (metrics.desnivelGlobal * 6 * 0.5) + (penalty * 4000);
        if (!bestLocal || score < bestLocal.score) bestLocal = { participant, variableSequence, sequence, metrics, score };
      }
      routes.push({
        participant: participant.name,
        qrId: participant.qrId,
        variableSequence: bestLocal.variableSequence,
        sequence: bestLocal.sequence,
        coincidencias: 0,
        ...bestLocal.metrics
      });
    });

    routes.forEach((route, i) => {
      route.coincidencias = routes.reduce((sum, other, j) => {
        if (i === j) return sum;
        const own = new Set(route.variableSequence);
        return sum + other.variableSequence.reduce((n, id) => n + (own.has(id) ? 1 : 0), 0);
      }, 0);
    });

    const avgDistance = routes.reduce((a, r) => a + r.distance, 0) / routes.length;
    const avgClimb = routes.reduce((a, r) => a + r.desnivelGlobal, 0) / routes.length;
    routes.forEach(route => assignDifficulty(route, avgDistance, avgClimb));

    const distances = routes.map(r => r.distance);
    const climbs = routes.map(r => r.desnivelGlobal);
    const overlap = routes.reduce((a, r) => a + r.coincidencias, 0);
    const score = ((Math.max(...distances) - Math.min(...distances)) * 0.5) + ((Math.max(...climbs) - Math.min(...climbs)) * 0.5) + overlap * 900;
    if (!best || score < best.score) best = { routes, score };
  }

  state.routes = best.routes;
  saveState();
  logMessage(`Recorridos generados: ${state.routes.length}.`);
  return state.routes;
}
