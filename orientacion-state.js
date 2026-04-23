const STORAGE_KEY = 'militopo_orientacion_clean_v1';

export const state = {
  meta: {
    exerciseName: 'Orientación',
    participantsCount: 8,
    pointsPerRoute: 10,
    preferredLayer: 'mapant'
  },
  special: {
    start: { id: 'SALIDA', type: 'start', description: 'Salida', utm: '', lat: null, lon: null, elev: null },
    finish: { id: 'LLEGADA', type: 'finish', description: 'Llegada', utm: '', lat: null, lon: null, elev: null }
  },
  points: [],
  routes: [],
  selectedPointId: null,
  pointPlacementMode: null
};

export function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (raw.meta) Object.assign(state.meta, raw.meta);
    if (raw.special) {
      state.special.start = { ...state.special.start, ...(raw.special.start || {}) };
      state.special.finish = { ...state.special.finish, ...(raw.special.finish || {}) };
    }
    if (Array.isArray(raw.points)) state.points = raw.points;
    if (Array.isArray(raw.routes)) state.routes = raw.routes;
    state.selectedPointId = raw.selectedPointId || null;
  } catch (_) {}
}

export function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resetRoutes() {
  state.routes = [];
  saveState();
}

export function upsertPoint(point) {
  const idx = state.points.findIndex(p => p.id === point.id);
  if (idx >= 0) state.points[idx] = { ...state.points[idx], ...point };
  else state.points.push(point);
  state.points.sort((a,b) => String(a.id).localeCompare(String(b.id), 'es', {numeric:true}));
  saveState();
}

export function deletePoint(id) {
  state.points = state.points.filter(p => p.id !== id);
  if (state.selectedPointId === id) state.selectedPointId = null;
  saveState();
}

export function findPoint(id) {
  if (id === 'SALIDA') return state.special.start;
  if (id === 'LLEGADA') return state.special.finish;
  return state.points.find(p => p.id === id) || null;
}
