import { state, loadState, saveState, resetRoutes, upsertPoint, deletePoint, findPoint } from './orientacion-state.js';
import { normalizeUTM, isValidUTM, utmToLatLon, latLonToUTM, logMessage } from './orientacion-utils.js';
import { initMap, renderPoints, zoomToPoint, useCurrentLocation, searchPlace, renderRoutes as renderRouteLines, setPreferredLayer, setMapStatus, centerOnAll, invalidateMapSize } from './orientacion-map.js';
import { importExcel, importAtak, exportJson, importJson } from './orientacion-import.js';
import { generateRoutes } from './orientacion-generator.js';

const q = id => document.getElementById(id);
const qa = selector => Array.from(document.querySelectorAll(selector));
const stepMeta = {
  1: { title:'Paso 1 · Datos de la prueba', help:'Configura el nombre del ejercicio y los parámetros generales antes de pasar al mapa.' },
  2: { title:'Paso 2 · Mapa base', help:'Sitúate en la zona de trabajo, elige capa base y comprueba que el mapa está listo.' },
  3: { title:'Paso 3 · Balizas y puntos especiales', help:'Define salida, llegada y balizas. También puedes importar desde Excel o ATAK.' },
  4: { title:'Paso 4 · Generación', help:'Lanza el generador equilibrado: 50% distancia, 50% desnivel y coincidencias mínimas.' },
  5: { title:'Paso 5 · Revisión', help:'Comprueba resumen técnico, mensajes de sistema y tarjetas de recorridos generados.' }
};
let currentStep = 1;

function applyMetaToInputs() {
  q('exerciseName').value = state.meta.exerciseName || 'Orientación';
  q('participantsCount').value = state.meta.participantsCount || 8;
  q('pointsPerRoute').value = state.meta.pointsPerRoute || 10;
  q('startDesc').value = state.special.start.description || '';
  q('startUtm').value = state.special.start.utm || '';
  q('finishDesc').value = state.special.finish.description || '';
  q('finishUtm').value = state.special.finish.utm || '';
}

function updateSummaryAside() {
  q('miniExerciseName').textContent = state.meta.exerciseName || 'Orientación';
  q('miniParticipants').textContent = state.meta.participantsCount || 0;
  q('miniPoints').textContent = state.points.length;
  q('miniRoutes').textContent = state.routes.length;
}

function updateGlobalStatus(text='Listo') {
  q('globalStatusPill').textContent = text;
}

function updateStepUi() {
  qa('.step-tab').forEach(btn => btn.classList.toggle('active', Number(btn.dataset.step) === currentStep));
  qa('.step-panel').forEach(panel => panel.classList.toggle('hidden', Number(panel.dataset.stepPanel) !== currentStep));
  q('currentStepTitle').textContent = stepMeta[currentStep].title;
  q('currentStepHelp').textContent = stepMeta[currentStep].help;
  q('prevStepBtn').disabled = currentStep === 1;
  q('nextStepBtn').textContent = currentStep === 5 ? 'Finalizado ✓' : 'Continuar →';
  const showMap = [2,3,5].includes(currentStep);
  q('sharedMapShell').classList.toggle('hidden', !showMap);
  if (showMap) {
    setTimeout(() => {
      invalidateMapSize();
      centerOnAll(state.points, state.special);
    }, 80);
  }
}

function goToStep(step) {
  currentStep = Math.max(1, Math.min(5, step));
  updateStepUi();
}

function updatePointSelector() {
  const select = q('pointSelect');
  const items = [state.special.start, state.special.finish, ...state.points];
  select.innerHTML = items.map(item => `<option value="${item.id}" ${state.selectedPointId === item.id ? 'selected' : ''}>${item.id} · ${item.description || ''}</option>`).join('');
}

function renderTable() {
  const body = q('pointsTableBody');
  const rows = [state.special.start, state.special.finish, ...state.points];
  body.innerHTML = rows.map(point => {
    const typeLabel = point.type === 'start' ? 'Salida' : point.type === 'finish' ? 'Llegada' : 'Baliza';
    return `
      <tr>
        <td>${typeLabel}</td>
        <td>${point.id}</td>
        <td>${point.description || ''}</td>
        <td>${point.utm || ''}</td>
        <td><button class="row-btn" data-edit-id="${point.id}">Editar</button></td>
      </tr>
    `;
  }).join('');
  body.querySelectorAll('[data-edit-id]').forEach(btn => {
    btn.addEventListener('click', () => editPoint(btn.dataset.editId));
  });
}

function renderSummary() {
  const box = q('summaryCards');
  const note = q('summaryNote');
  if (!state.routes.length) {
    box.innerHTML = `
      <div class="summary-card"><div class="k">Recorridos</div><div class="v">0</div><div class="s">Aún no generados</div></div>
      <div class="summary-card"><div class="k">Distancia media</div><div class="v">—</div></div>
      <div class="summary-card"><div class="k">Desnivel medio</div><div class="v">—</div></div>
      <div class="summary-card"><div class="k">Dificultad</div><div class="v">—</div></div>
    `;
    note.textContent = 'Cuando generes recorridos aparecerán aquí las métricas globales.';
    return;
  }
  const routes = state.routes;
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
    <div class="summary-card"><div class="k">Más corto / largo</div><div class="v">${(Math.min(...distances)/1000).toFixed(3)} / ${(Math.max(...distances)/1000).toFixed(3)} km</div></div>
    <div class="summary-card"><div class="k">Desnivel medio</div><div class="v">${avgDesnivel} m</div><div class="s">+${avgPos} / -${avgNeg} m</div></div>
    <div class="summary-card"><div class="k">Dificultad</div><div class="v">${baja} / ${media} / ${alta}</div><div class="s">Baja / Media / Alta</div></div>
  `;
  note.textContent = 'Objetivo aplicado: equilibrio 50% distancia, 50% desnivel y coincidencias mínimas entre recorridos.';
}

function renderParticipantCards() {
  const box = q('routesGrid');
  if (!state.routes.length) {
    box.innerHTML = '<div class="info-callout subtle">Todavía no hay recorridos generados.</div>';
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
  renderParticipantCards();
  centerOnAll(state.points, state.special);
  updateSummaryAside();
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
  goToStep(3);
}

function wireMetaEvents() {
  q('exerciseName').addEventListener('input', e => { state.meta.exerciseName = e.target.value; saveState(); updateSummaryAside(); });
  q('participantsCount').addEventListener('input', e => { state.meta.participantsCount = Math.max(1, Number(e.target.value)||1); saveState(); updateSummaryAside(); });
  q('pointsPerRoute').addEventListener('input', e => { state.meta.pointsPerRoute = Math.max(1, Number(e.target.value)||1); saveState(); });
}

function wireSpecialEvents() {
  q('saveSpecialBtn').addEventListener('click', () => {
    state.special.start.description = q('startDesc').value.trim() || 'Salida';
    state.special.start.utm = normalizeUTM(q('startUtm').value);
    state.special.start.type = 'start';
    const startLl = utmToLatLon(state.special.start.utm);
    state.special.start.lat = startLl?.lat ?? null;
    state.special.start.lon = startLl?.lon ?? null;

    state.special.finish.description = q('finishDesc').value.trim() || 'Llegada';
    state.special.finish.utm = normalizeUTM(q('finishUtm').value);
    state.special.finish.type = 'finish';
    const finishLl = utmToLatLon(state.special.finish.utm);
    state.special.finish.lat = finishLl?.lat ?? null;
    state.special.finish.lon = finishLl?.lon ?? null;

    saveState();
    refreshAll();
    updateGlobalStatus('Salida y llegada guardadas');
    logMessage('Salida y llegada guardadas.');
  });

  q('pickStartBtn').addEventListener('click', () => {
    state.pointPlacementMode = 'start';
    setMapStatus('Pulsa sobre el mapa para fijar la SALIDA');
    updateGlobalStatus('Colocando salida');
  });
  q('pickFinishBtn').addEventListener('click', () => {
    state.pointPlacementMode = 'finish';
    setMapStatus('Pulsa sobre el mapa para fijar la LLEGADA');
    updateGlobalStatus('Colocando llegada');
  });
}

function wirePointEvents() {
  q('savePointBtn').addEventListener('click', () => {
    const id = q('pointId').value.trim().toUpperCase();
    const description = q('pointDesc').value.trim();
    const utm = normalizeUTM(q('pointUtm').value);
    if (!id || !isValidUTM(utm)) {
      logMessage('Baliza no guardada: revisa el ID y la coordenada UTM.');
      updateGlobalStatus('Revisar baliza');
      return;
    }
    const ll = utmToLatLon(utm);
    upsertPoint({ id, type:'point', description, utm, lat:ll?.lat ?? null, lon:ll?.lon ?? null, elev:null });
    state.selectedPointId = id;
    saveState();
    refreshAll();
    updateGlobalStatus(`Baliza ${id} guardada`);
    logMessage(`Baliza ${id} guardada.`);
  });

  q('newPointBtn').addEventListener('click', () => {
    q('pointId').value = '';
    q('pointDesc').value = '';
    q('pointUtm').value = '';
    state.selectedPointId = null;
    updatePointSelector();
    updateGlobalStatus('Nueva baliza');
  });

  q('pickPointBtn').addEventListener('click', () => {
    state.pointPlacementMode = 'point';
    setMapStatus('Pulsa sobre el mapa para colocar la baliza');
    updateGlobalStatus('Colocando baliza');
  });

  q('zoomPointBtn').addEventListener('click', () => zoomToPoint(q('pointSelect').value));
  q('deletePointBtn').addEventListener('click', () => {
    const id = q('pointId').value.trim().toUpperCase() || state.selectedPointId;
    if (!id || id === 'SALIDA' || id === 'LLEGADA') return;
    deletePoint(id);
    resetRoutes();
    q('pointId').value = '';
    q('pointDesc').value = '';
    q('pointUtm').value = '';
    refreshAll();
    updateGlobalStatus(`Baliza ${id} borrada`);
    logMessage(`Baliza ${id} borrada.`);
  });

  q('pointSelect').addEventListener('change', e => editPoint(e.target.value));
}

function wireMapAndImportEvents() {
  q('locateBtn').addEventListener('click', useCurrentLocation);
  q('placeSearchBtn').addEventListener('click', async () => {
    await searchPlace(q('placeSearch').value);
  });

  const setLayerButtonState = active => {
    ['setLayerMapant','setLayerIgn','setLayerAerial'].forEach(id => q(id).classList.remove('active'));
    q(active).classList.add('active');
  };
  q('setLayerMapant').addEventListener('click', () => { setPreferredLayer('mapant'); state.meta.preferredLayer = 'mapant'; saveState(); setLayerButtonState('setLayerMapant'); });
  q('setLayerIgn').addEventListener('click', () => { setPreferredLayer('ign'); state.meta.preferredLayer = 'ign'; saveState(); setLayerButtonState('setLayerIgn'); });
  q('setLayerAerial').addEventListener('click', () => { setPreferredLayer('aerial'); state.meta.preferredLayer = 'aerial'; saveState(); setLayerButtonState('setLayerAerial'); });

  q('excelInput').addEventListener('change', async e => {
    if (!e.target.files[0]) return;
    await importExcel(e.target.files[0]);
    refreshAll();
    updateGlobalStatus('Excel importado');
  });
  q('atakInput').addEventListener('change', async e => {
    if (!e.target.files[0]) return;
    await importAtak(e.target.files[0]);
    refreshAll();
    updateGlobalStatus('ATAK importado');
  });
  q('exportJsonBtn').addEventListener('click', exportJson);
  q('importJsonBtn').addEventListener('click', () => q('jsonInput').click());
  q('jsonInput').addEventListener('change', async e => {
    if (!e.target.files[0]) return;
    await importJson(e.target.files[0]);
    applyMetaToInputs();
    refreshAll();
    updateGlobalStatus('JSON importado');
  });
}

function wireGenerationEvents() {
  q('generateRoutesBtn').addEventListener('click', async () => {
    try {
      updateGlobalStatus('Generando...');
      await generateRoutes();
      renderSummary();
      renderParticipantCards();
      updateSummaryAside();
      updateGlobalStatus('Recorridos generados');
      goToStep(5);
    } catch (err) {
      logMessage(`Error generando recorridos: ${err.message}`);
      updateGlobalStatus('Error de generación');
    }
  });

  q('clearRoutesBtn').addEventListener('click', () => {
    resetRoutes();
    renderSummary();
    renderParticipantCards();
    updateSummaryAside();
    updateGlobalStatus('Resultados limpiados');
  });
}

function wireWizardEvents() {
  qa('.step-tab').forEach(btn => btn.addEventListener('click', () => goToStep(Number(btn.dataset.step))));
  q('prevStepBtn').addEventListener('click', () => goToStep(currentStep - 1));
  q('nextStepBtn').addEventListener('click', () => { if (currentStep < 5) goToStep(currentStep + 1); });
  q('saveDraftBtn').addEventListener('click', () => {
    saveState();
    updateGlobalStatus('Borrador guardado');
    logMessage('Borrador guardado en almacenamiento local del navegador.');
  });
}

function handleMapPick(latlng) {
  if (!state.pointPlacementMode) return;
  const utm = latLonToUTM(latlng.lat, latlng.lng) || '';
  if (state.pointPlacementMode === 'start') {
    state.special.start.utm = utm;
    state.special.start.lat = latlng.lat;
    state.special.start.lon = latlng.lng;
    q('startUtm').value = utm;
  } else if (state.pointPlacementMode === 'finish') {
    state.special.finish.utm = utm;
    state.special.finish.lat = latlng.lat;
    state.special.finish.lon = latlng.lng;
    q('finishUtm').value = utm;
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
  updateGlobalStatus('Punto colocado');
  refreshAll();
}

function init() {
  loadState();
  applyMetaToInputs();
  initMap(handleMapPick);
  setPreferredLayer(state.meta.preferredLayer || 'mapant');
  wireMetaEvents();
  wireSpecialEvents();
  wirePointEvents();
  wireMapAndImportEvents();
  wireGenerationEvents();
  wireWizardEvents();
  document.addEventListener('orientacion:pointdrag', e => {
    const point = e.detail.point;
    if (point.type === 'start') state.special.start = { ...state.special.start, ...point };
    else if (point.type === 'finish') state.special.finish = { ...state.special.finish, ...point };
    else upsertPoint(point);
    saveState();
    refreshAll();
    updateGlobalStatus('Punto movido');
  });
  refreshAll();
  updateStepUi();
}

init();
