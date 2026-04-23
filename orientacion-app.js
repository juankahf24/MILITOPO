import { state, loadState, saveState, upsertPoint, deletePoint, findPoint, resetRoutes } from './orientacion-state.js';
import { isValidUTM, normalizeUTM, utmToLatLon, logMessage } from './orientacion-utils.js';
import { initMap, renderPoints, zoomToPoint, useCurrentLocation, searchPlace, renderRoutes as renderRouteLines, setPreferredLayer, centerOnAll, setMapStatus } from './orientacion-map.js';
import { importExcel, importAtak, exportJson, importJson } from './orientacion-import.js';
import { generateRoutes } from './orientacion-generator.js';

loadState();

function q(id){ return document.getElementById(id); }

function applyMetaToInputs() {
  q('exerciseName').value = state.meta.exerciseName;
  q('participantsCount').value = state.meta.participantsCount;
  q('pointsPerRoute').value = state.meta.pointsPerRoute;
  q('startDesc').value = state.special.start.description;
  q('startUtm').value = state.special.start.utm;
  q('finishDesc').value = state.special.finish.description;
  q('finishUtm').value = state.special.finish.utm;
}

function updatePointSelector() {
  const select = q('pointSelect');
  const ids = ['SALIDA', 'LLEGADA', ...state.points.map(p => p.id)];
  select.innerHTML = ids.map(id => `<option value="${id}" ${state.selectedPointId===id?'selected':''}>${id}</option>`).join('');
}

function renderTable() {
  const body = q('pointsTableBody');
  const rows = [state.special.start, state.special.finish, ...state.points];
  body.innerHTML = rows.map(point => `
    <tr>
      <td>${point.type === 'start' ? 'Salida' : point.type === 'finish' ? 'Llegada' : 'Baliza'}</td>
      <td>${point.id}</td>
      <td>${point.description || ''}</td>
      <td>${point.utm || ''}</td>
      <td><button class="btn secondary" data-edit-id="${point.id}">Editar</button></td>
    </tr>
  `).join('');

  body.querySelectorAll('[data-edit-id]').forEach(btn => {
    btn.addEventListener('click', () => editPoint(btn.dataset.editId));
  });
}

function renderSummary() {
  const box = q('summaryCards');
  const note = q('summaryNote');
  const routes = state.routes || [];
  if (!routes.length) {
    box.innerHTML = '<div class="summary-card"><div class="k">Recorridos</div><div class="v">0</div><div class="s">Todavía no se ha generado ninguna propuesta.</div></div>';
    note.textContent = 'Pendiente de generar.';
    return;
  }
  const distances = routes.map(r => Number(r.distance) || 0);
  const desniveles = routes.map(r => Number(r.desnivelGlobal) || 0);
  const avgDistance = Math.round(distances.reduce((a,b)=>a+b,0) / routes.length);
  const avgDesnivel = Math.round(desniveles.reduce((a,b)=>a+b,0) / routes.length);
  const avgPos = Math.round(routes.reduce((a,r)=>a+(Number(r.desnivelPositivo)||0),0) / routes.length);
  const avgNeg = Math.round(routes.reduce((a,r)=>a+(Number(r.desnivelNegativo)||0),0) / routes.length);
  let baja=0, media=0, alta=0;
  routes.forEach(r => { if (r.difficulty === 'BAJA') baja++; else if (r.difficulty === 'ALTA') alta++; else media++; });
  box.innerHTML = `
    <div class="summary-card"><div class="k">Recorridos</div><div class="v">${routes.length}</div></div>
    <div class="summary-card"><div class="k">Distancia media</div><div class="v">${(avgDistance/1000).toFixed(3)} km</div></div>
    <div class="summary-card"><div class="k">Más corto / largo</div><div class="v">${(Math.min(...distances)/1000).toFixed(3)} / ${(Math.max(...distances)/1000).toFixed(3)}</div></div>
    <div class="summary-card"><div class="k">Desnivel medio</div><div class="v">${avgDesnivel} m</div><div class="s">+${avgPos} / -${avgNeg} m</div></div>
    <div class="summary-card"><div class="k">Dificultad</div><div class="v">${baja} / ${media} / ${alta}</div><div class="s">Baja / Media / Alta</div></div>
  `;
  note.textContent = 'Equilibrio objetivo: 50% distancia · 50% desnivel · coincidencias mínimas.';
}

function renderRoutes() {
  const box = q('routesGrid');
  if (!state.routes.length) {
    box.innerHTML = '';
    renderRouteLines([]);
    return;
  }
  box.innerHTML = state.routes.map((route, idx) => `
    <article class="route-card">
      <div class="route-head">
        <div class="route-title">${idx+1}. ${route.participant}</div>
        <div class="route-badge">${route.qrId}</div>
      </div>
      <div class="route-grid">
        <div class="metric-card"><div class="k">Balizas</div><div class="v">${route.variableSequence.length}</div></div>
        <div class="metric-card"><div class="k">Distancia</div><div class="v">${route.distance} m</div></div>
        <div class="metric-card"><div class="k">Coincidencias</div><div class="v">${route.coincidencias}</div></div>
      </div>
      <div class="route-extra-grid">
        <div class="metric-card"><div class="k">Tramo más largo</div><div class="v">${route.maxLeg} m</div></div>
        <div class="metric-card"><div class="k">Desnivel</div><div class="v">${route.desnivelGlobal} m</div><div class="s">+${route.desnivelPositivo} / -${route.desnivelNegativo} m</div></div>
        <div class="metric-card"><div class="k">Dificultad</div><div class="v">${route.difficulty}</div></div>
      </div>
      <div class="route-seq">${route.sequence.map(id => `<span class="route-chip ${id==='SALIDA'?'start':id==='LLEGADA'?'finish':''}">${id}</span>`).join('')}</div>
    </article>
  `).join('');
  renderRouteLines(state.routes);
}

function refreshAll() {
  updatePointSelector();
  renderTable();
  renderPoints(state.points, state.special);
  renderSummary();
  renderRoutes();
  centerOnAll(state.points, state.special);
}

function editPoint(id) {
  state.selectedPointId = id;
  updatePointSelector();
  const point = findPoint(id);
  if (!point) return;
  if (id === 'SALIDA') {
    q('startDesc').value = point.description || '';
    q('startUtm').value = point.utm || '';
  } else if (id === 'LLEGADA') {
    q('finishDesc').value = point.description || '';
    q('finishUtm').value = point.utm || '';
  } else {
    q('pointId').value = point.id || '';
    q('pointDesc').value = point.description || '';
    q('pointUtm').value = point.utm || '';
  }
  zoomToPoint(id);
}

function bindEvents() {
  q('exerciseName').addEventListener('input', e => { state.meta.exerciseName = e.target.value; saveState(); });
  q('participantsCount').addEventListener('input', e => { state.meta.participantsCount = Math.max(1, Number(e.target.value)||1); saveState(); });
  q('pointsPerRoute').addEventListener('input', e => { state.meta.pointsPerRoute = Math.max(1, Number(e.target.value)||1); saveState(); });

  q('saveSpecialBtn').addEventListener('click', () => {
    state.special.start.description = q('startDesc').value.trim() || 'Salida';
    state.special.start.utm = normalizeUTM(q('startUtm').value);
    state.special.start.type = 'start';
    state.special.start.lat = utmToLatLon(state.special.start.utm)?.lat ?? null;
    state.special.start.lon = utmToLatLon(state.special.start.utm)?.lon ?? null;

    state.special.finish.description = q('finishDesc').value.trim() || 'Llegada';
    state.special.finish.utm = normalizeUTM(q('finishUtm').value);
    state.special.finish.type = 'finish';
    state.special.finish.lat = utmToLatLon(state.special.finish.utm)?.lat ?? null;
    state.special.finish.lon = utmToLatLon(state.special.finish.utm)?.lon ?? null;
    saveState();
    refreshAll();
    logMessage('Salida y llegada guardadas.');
  });

  q('savePointBtn').addEventListener('click', () => {
    const id = q('pointId').value.trim().toUpperCase();
    const description = q('pointDesc').value.trim();
    const utm = normalizeUTM(q('pointUtm').value);
    if (!id || !isValidUTM(utm)) {
      logMessage('Baliza no guardada: revisa ID y UTM.');
      return;
    }
    const ll = utmToLatLon(utm);
    upsertPoint({ id, type:'point', description, utm, lat:ll?.lat ?? null, lon:ll?.lon ?? null, elev:null });
    state.selectedPointId = id;
    refreshAll();
    logMessage(`Baliza ${id} guardada.`);
  });

  q('newPointBtn').addEventListener('click', () => {
    q('pointId').value = '';
    q('pointDesc').value = '';
    q('pointUtm').value = '';
    state.selectedPointId = null;
    updatePointSelector();
  });

  q('deletePointBtn').addEventListener('click', () => {
    const id = q('pointId').value.trim().toUpperCase() || state.selectedPointId;
    if (!id || id === 'SALIDA' || id === 'LLEGADA') return;
    deletePoint(id);
    q('pointId').value = q('pointDesc').value = q('pointUtm').value = '';
    resetRoutes();
    refreshAll();
    logMessage(`Baliza ${id} borrada.`);
  });

  q('pickPointBtn').addEventListener('click', () => {
    state.pointPlacementMode = 'point';
    setMapStatus('Pulsa sobre el mapa para colocar la baliza seleccionada.');
  });
  q('pickStartBtn').addEventListener('click', () => { state.pointPlacementMode = 'start'; setMapStatus('Pulsa sobre el mapa para colocar SALIDA.'); });
  q('pickFinishBtn').addEventListener('click', () => { state.pointPlacementMode = 'finish'; setMapStatus('Pulsa sobre el mapa para colocar LLEGADA.'); });

  q('zoomPointBtn').addEventListener('click', () => zoomToPoint(q('pointSelect').value));
  q('pointSelect').addEventListener('change', e => editPoint(e.target.value));
  q('locateBtn').addEventListener('click', useCurrentLocation);
  q('placeSearchBtn').addEventListener('click', async () => { await searchPlace(q('placeSearch').value); });

  q('setLayerMapant').addEventListener('click', () => setPreferredLayer('mapant'));
  q('setLayerIgn').addEventListener('click', () => setPreferredLayer('ign'));
  q('setLayerAerial').addEventListener('click', () => setPreferredLayer('aerial'));

  q('excelInput').addEventListener('change', async e => { if (e.target.files[0]) { await importExcel(e.target.files[0]); refreshAll(); } });
  q('atakInput').addEventListener('change', async e => { if (e.target.files[0]) { await importAtak(e.target.files[0]); refreshAll(); } });
  q('exportJsonBtn').addEventListener('click', exportJson);
  q('importJsonBtn').addEventListener('click', () => q('jsonInput').click());
  q('jsonInput').addEventListener('change', async e => { if (e.target.files[0]) { await importJson(e.target.files[0]); applyMetaToInputs(); refreshAll(); } });

  q('generateRoutesBtn').addEventListener('click', async () => {
    try {
      await generateRoutes();
      renderSummary();
      renderRoutes();
    } catch (err) {
      logMessage(`Error generando recorridos: ${err.message}`);
    }
  });

  q('clearRoutesBtn').addEventListener('click', () => {
    resetRoutes();
    renderSummary();
    renderRoutes();
  });

  document.addEventListener('orientacion:pointdrag', e => {
    const point = e.detail.point;
    if (point.type === 'start') state.special.start = { ...state.special.start, ...point };
    else if (point.type === 'finish') state.special.finish = { ...state.special.finish, ...point };
    else upsertPoint(point);
    refreshAll();
  });
}

function handleMapPick(latlng) {
  if (!state.pointPlacementMode) return;
  const utm = window.proj4 ? (() => {
    const zoneNum = Math.floor((latlng.lng + 180) / 6) + 1;
    const bandLetters = 'CDEFGHJKLMNPQRSTUVWX';
    const bandIndex = Math.max(0, Math.min(bandLetters.length - 1, Math.floor((latlng.lat + 80) / 8)));
    const zoneLetter = bandLetters[bandIndex];
    const projUTM = `+proj=utm +zone=${zoneNum} +${latlng.lat >= 0 ? 'north' : 'south'} +ellps=WGS84 +datum=WGS84 +units=m +no_defs`;
    const wgs84 = '+proj=longlat +datum=WGS84 +no_defs';
    const [easting, northing] = proj4(wgs84, projUTM, [latlng.lng, latlng.lat]);
    return `${zoneNum}${zoneLetter} ${Math.round(easting).toString().padStart(6,'0')} ${Math.round(northing).toString().padStart(7,'0')}`;
  })() : '';

  if (state.pointPlacementMode === 'start') {
    state.special.start.utm = utm; state.special.start.lat = latlng.lat; state.special.start.lon = latlng.lng; q('startUtm').value = utm;
  } else if (state.pointPlacementMode === 'finish') {
    state.special.finish.utm = utm; state.special.finish.lat = latlng.lat; state.special.finish.lon = latlng.lng; q('finishUtm').value = utm;
  } else {
    q('pointUtm').value = utm;
    const id = q('pointId').value.trim().toUpperCase();
    if (id) {
      upsertPoint({ id, type:'point', description:q('pointDesc').value.trim(), utm, lat:latlng.lat, lon:latlng.lng, elev:null });
    }
  }
  saveState();
  state.pointPlacementMode = null;
  setMapStatus('Listo');
  refreshAll();
}

applyMetaToInputs();
initMap(handleMapPick);
bindEvents();
refreshAll();
