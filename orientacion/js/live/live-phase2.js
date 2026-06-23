/* MILITOPO LIVE · Fase 2
   Sesión de carrera automática por eventId.
   Participantes: conexión silenciosa desde su QR, salida y progreso en vivo.
   Organizador: panel en Paso 5 con nombre, estado y controles completados.
   No modifica resultados, clasificación, PDF ni la lógica local de carrera. */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  getDatabase,
  ref,
  set,
  update,
  get,
  onValue,
  onDisconnect,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDchEGOYe22ojtlo4qAiAzZkARqSRgXW14",
  authDomain: "militopo-live.firebaseapp.com",
  databaseURL: "https://militopo-live-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "militopo-live",
  storageBucket: "militopo-live.firebasestorage.app",
  messagingSenderId: "975622693671",
  appId: "1:975622693671:web:1453bdd168b58817b9bf02"
};

const ROOT_PATH = "militopoLive/v2";
const QUEUE_KEY = "militopo_live_v2_pending_events";
const PARTICIPANT_CONTEXT_KEY = "militopo_live_v2_participant_context";
const ORGANIZER_RUN_KEY_PREFIX = "militopo_live_v2_organizer_run_";

let app = null;
let auth = null;
let db = null;
let currentUser = null;
let firebaseConnected = false;

let organizerEventKey = "";
let organizerRunId = "";
let organizerUnsubActive = null;
let organizerUnsubParticipants = null;
let organizerContextTimer = null;

let participantContext = null;
let participantEventKey = "";
let participantRunId = "";
let participantUnsubActive = null;
let participantPresenceRef = null;
let participantFlushBusy = false;

const $ = id => document.getElementById(id);

function safeText(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[char]);
}

function safeFirebaseKey(value) {
  return String(value || "MILITOPO")
    .trim()
    .replace(/[.#$\[\]\/]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 100) || "MILITOPO";
}

function nowIso() { return new Date().toISOString(); }

function isParticipantAccess() {
  try {
    const params = new URLSearchParams(location.search || "");
    if ((params.get("modo") || "").toLowerCase() === "participante") return true;
    return localStorage.getItem("militopo_orientacion_access_mode_v1") === "participante";
  } catch (_) { return false; }
}

function organizerContext() {
  try {
    if (typeof window.MILITOPO_LIVE_GET_ORGANIZER_CONTEXT === "function") {
      return window.MILITOPO_LIVE_GET_ORGANIZER_CONTEXT();
    }
  } catch (_) {}
  return null;
}

function eventPath(eventKey) { return `${ROOT_PATH}/events/${eventKey}`; }
function activeRunPath(eventKey) { return `${eventPath(eventKey)}/activeRun`; }
function runPath(eventKey, runId) { return `${eventPath(eventKey)}/runs/${runId}`; }
function participantPath(eventKey, runId, pid) { return `${runPath(eventKey, runId)}/participants/${safeFirebaseKey(pid)}`; }

function injectStyles() {
  if ($("militopoLivePhase2Styles")) return;
  const style = document.createElement("style");
  style.id = "militopoLivePhase2Styles";
  style.textContent = `
    .militopo-live2-panel{margin:18px 0 22px;padding:18px;border-radius:28px;border:1px solid rgba(237,214,145,.25);background:linear-gradient(180deg,rgba(25,45,25,.97),rgba(12,27,15,.98));box-shadow:0 18px 44px rgba(0,0,0,.24),inset 0 1px 0 rgba(255,255,255,.08);color:#fff7e8;overflow:hidden}
    .militopo-live2-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}.militopo-live2-title{display:flex;gap:11px;align-items:center}.militopo-live2-title-icon{width:46px;height:46px;border-radius:17px;display:grid;place-items:center;font-size:1.42rem;background:rgba(139,181,106,.16);border:1px solid rgba(190,238,150,.28)}
    .militopo-live2-title h3{margin:0;font-size:1.02rem;letter-spacing:.04em}.militopo-live2-title p{margin:4px 0 0;font-size:.72rem;line-height:1.35;color:rgba(255,247,232,.68)}.militopo-live2-phase{padding:7px 10px;border-radius:999px;background:rgba(230,188,122,.14);border:1px solid rgba(230,188,122,.25);font-size:.63rem;font-weight:900;white-space:nowrap}
    .militopo-live2-statuses{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:12px}.militopo-live2-badge{padding:9px 8px;border-radius:14px;text-align:center;font-size:.68rem;font-weight:900;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08)}.militopo-live2-badge[data-state="ok"]{color:#dff6c4;border-color:rgba(139,181,106,.42);background:rgba(107,140,62,.16)}.militopo-live2-badge[data-state="error"]{color:#ffd5ca;border-color:rgba(221,92,67,.42);background:rgba(151,49,34,.16)}.militopo-live2-badge[data-state="warn"]{color:#ffe4a6;border-color:rgba(230,188,122,.38);background:rgba(151,103,34,.14)}
    .militopo-live2-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}.militopo-live2-actions button{min-height:50px;border-radius:17px;padding:11px 14px;font-weight:900;font-size:.78rem;cursor:pointer}.militopo-live2-actions button:disabled{opacity:.45;cursor:not-allowed}.militopo-live2-start{border:0;background:linear-gradient(180deg,#9dce6b,#6c9f45);color:#17220f}.militopo-live2-stop{border:1px solid rgba(225,104,80,.44);background:rgba(157,56,39,.18);color:#ffe0d8}
    .militopo-live2-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:14px 0}.militopo-live2-metric{padding:11px 7px;border-radius:16px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.075);text-align:center}.militopo-live2-metric strong{display:block;font-size:1.1rem}.militopo-live2-metric span{display:block;margin-top:3px;font-size:.59rem;color:rgba(255,247,232,.62)}
    .militopo-live2-run{margin-top:11px;padding:10px 12px;border-radius:15px;background:rgba(0,0,0,.16);font-size:.69rem;line-height:1.45;word-break:break-word}.militopo-live2-message{margin-top:10px;padding:10px 12px;border-radius:14px;font-size:.7rem;line-height:1.4;background:rgba(255,255,255,.05)}.militopo-live2-message.is-ok{color:#dff6c4}.militopo-live2-message.is-error{color:#ffd0c5}.militopo-live2-message.is-warn{color:#ffe0a0}
    .militopo-live2-table-wrap{margin-top:14px;overflow-x:auto;border-radius:18px;border:1px solid rgba(237,214,145,.16)}.militopo-live2-table{width:100%;border-collapse:collapse;min-width:680px;background:rgba(0,0,0,.12)}.militopo-live2-table th,.militopo-live2-table td{padding:10px 9px;border-bottom:1px solid rgba(237,214,145,.12);text-align:left;font-size:.69rem;vertical-align:middle}.militopo-live2-table th{color:#ffe2a0;font-size:.63rem;letter-spacing:.06em;text-transform:uppercase;background:rgba(0,0,0,.18);position:sticky;top:0}.militopo-live2-name b{display:block;color:#fff7e8;font-size:.75rem}.militopo-live2-name small{display:block;color:#cbb894;margin-top:2px}.militopo-live2-state{display:inline-flex;padding:5px 8px;border-radius:999px;font-weight:900;font-size:.62rem;border:1px solid rgba(255,255,255,.12)}.militopo-live2-state.ready,.militopo-live2-state.not_started{color:#ffe2a0;background:rgba(230,188,122,.12)}.militopo-live2-state.racing{color:#d5edff;background:rgba(70,139,206,.15);border-color:rgba(93,168,255,.36)}.militopo-live2-state.finished{color:#eaffd8;background:rgba(107,140,62,.18);border-color:rgba(139,181,106,.42)}.militopo-live2-state.offline{color:#ffd7ce;background:rgba(151,49,34,.15)}.militopo-live2-progress{font-weight:900;color:#fff7e8}.militopo-live2-empty{padding:18px;text-align:center;color:rgba(255,247,232,.65);font-size:.75rem}
    @media(max-width:680px){.militopo-live2-panel{padding:15px;border-radius:24px}.militopo-live2-statuses{grid-template-columns:1fr}.militopo-live2-actions{grid-template-columns:1fr}.militopo-live2-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.militopo-live2-head{align-items:center}.militopo-live2-phase{font-size:.56rem}}
  `;
  document.head.appendChild(style);
}

function buildOrganizerPanel() {
  if ($("militopoLivePhase2Panel")) return;
  const step5 = $("step5");
  if (!step5) return;
  injectStyles();
  const panel = document.createElement("section");
  panel.id = "militopoLivePhase2Panel";
  panel.className = "militopo-live2-panel";
  panel.innerHTML = `
    <div class="militopo-live2-head">
      <div class="militopo-live2-title"><div class="militopo-live2-title-icon">📡</div><div><h3>SEGUIMIENTO EN VIVO</h3><p>Los participantes se conectan automáticamente al escanear su QR. No se comparte ubicación.</p></div></div>
      <div class="militopo-live2-phase">FASE 2 · PROGRESO</div>
    </div>
    <div class="militopo-live2-statuses">
      <div id="live2AuthBadge" class="militopo-live2-badge" data-state="warn">AUTENTICACIÓN · ESPERANDO</div>
      <div id="live2DbBadge" class="militopo-live2-badge" data-state="warn">FIREBASE · CONECTANDO</div>
      <div id="live2RunBadge" class="militopo-live2-badge">CARRERA · NO INICIADA</div>
    </div>
    <div class="militopo-live2-actions">
      <button id="live2StartRunBtn" class="militopo-live2-start" type="button" disabled>▶ INICIAR CARRERA EN VIVO</button>
      <button id="live2StopRunBtn" class="militopo-live2-stop" type="button" disabled>■ CERRAR CARRERA EN VIVO</button>
    </div>
    <div class="militopo-live2-metrics">
      <div class="militopo-live2-metric"><strong id="live2Total">0</strong><span>PARTICIPANTES</span></div>
      <div class="militopo-live2-metric"><strong id="live2Pending">0</strong><span>SIN SALIR</span></div>
      <div class="militopo-live2-metric"><strong id="live2Racing">0</strong><span>EN CARRERA</span></div>
      <div class="militopo-live2-metric"><strong id="live2Finished">0</strong><span>FINALIZADOS</span></div>
    </div>
    <div id="live2RunText" class="militopo-live2-run">Sin carrera en vivo activa para este ejercicio.</div>
    <div id="live2Message" class="militopo-live2-message">Inicializando Firebase…</div>
    <div class="militopo-live2-table-wrap">
      <table class="militopo-live2-table"><thead><tr><th>Participante</th><th>Estado</th><th>Progreso</th><th>Recorrido</th><th>Última sincronización</th></tr></thead><tbody id="live2ParticipantsBody"><tr><td colspan="5" class="militopo-live2-empty">Inicia la carrera en vivo para preparar los participantes.</td></tr></tbody></table>
    </div>`;
  const header = step5.querySelector(":scope > .card-header");
  if (header) header.insertAdjacentElement("afterend", panel); else step5.prepend(panel);
  $("live2StartRunBtn")?.addEventListener("click", startOrganizerRun);
  $("live2StopRunBtn")?.addEventListener("click", stopOrganizerRun);
}

function setBadge(id, text, state = "neutral") {
  const el = $(id); if (!el) return; el.textContent = text; el.dataset.state = state;
}
function setMessage(text, type = "info") {
  const el = $("live2Message"); if (!el) return; el.className = `militopo-live2-message is-${type}`; el.textContent = text;
}
function formatLastSeen(value) {
  if (!value) return "—";
  const d = new Date(typeof value === "number" ? value : value);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleTimeString("es-ES", { hour:"2-digit", minute:"2-digit", second:"2-digit" });
}
function stateLabel(status, online) {
  if (online === false && status !== "finished") return { cls:"offline", label:"SIN CONEXIÓN" };
  if (status === "racing") return { cls:"racing", label:"EN CARRERA" };
  if (status === "finished") return { cls:"finished", label:"FINALIZADO" };
  if (status === "ready") return { cls:"ready", label:"CONECTADO" };
  return { cls:"not_started", label:"SIN SALIR" };
}

function renderOrganizerParticipants(participantsValue) {
  const participants = participantsValue && typeof participantsValue === "object" ? participantsValue : {};
  const rows = Object.values(participants).sort((a,b)=>String(a.participantId||"").localeCompare(String(b.participantId||""),"es",{numeric:true}));
  const counts = { total: rows.length, pending:0, racing:0, finished:0 };
  rows.forEach(p => {
    if (p.status === "racing") counts.racing++;
    else if (p.status === "finished") counts.finished++;
    else counts.pending++;
  });
  if ($("live2Total")) $("live2Total").textContent = String(counts.total);
  if ($("live2Pending")) $("live2Pending").textContent = String(counts.pending);
  if ($("live2Racing")) $("live2Racing").textContent = String(counts.racing);
  if ($("live2Finished")) $("live2Finished").textContent = String(counts.finished);
  const body = $("live2ParticipantsBody");
  if (!body) return;
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="5" class="militopo-live2-empty">Todavía no hay participantes preparados.</td></tr>`;
    return;
  }
  body.innerHTML = rows.map(p => {
    const st = stateLabel(p.status, p.online);
    const pid = String(p.participantId || "—");
    const name = String(p.participantName || "").trim();
    const completed = Math.max(0, Number(p.completedControls) || 0);
    const total = Math.max(0, Number(p.totalControls) || 0);
    return `<tr>
      <td class="militopo-live2-name"><b>${safeText(name || pid)}</b><small>${safeText(name ? pid : "Sin nombre asignado")}</small></td>
      <td><span class="militopo-live2-state ${st.cls}">${st.label}</span></td>
      <td class="militopo-live2-progress">${completed} / ${total}</td>
      <td>${safeText(p.routeId || "—")}</td>
      <td>${safeText(formatLastSeen(p.lastSeenClient || p.lastSeen))}</td>
    </tr>`;
  }).join("");
}

function updateOrganizerButtons() {
  const ready = Boolean(currentUser && firebaseConnected);
  const active = Boolean(organizerRunId);
  const start = $("live2StartRunBtn");
  const stop = $("live2StopRunBtn");
  if (start) start.disabled = !ready || active;
  if (stop) stop.disabled = !ready || !active;
}

function cleanupOrganizerRunListener() {
  if (typeof organizerUnsubParticipants === "function") organizerUnsubParticipants();
  organizerUnsubParticipants = null;
}

async function attachOrganizerRun(eventKey, runId, meta = null) {
  cleanupOrganizerRunListener();
  organizerEventKey = eventKey;
  organizerRunId = runId || "";
  if (!runId) {
    setBadge("live2RunBadge", "CARRERA · NO INICIADA", "neutral");
    if ($("live2RunText")) $("live2RunText").textContent = "Sin carrera en vivo activa para este ejercicio.";
    renderOrganizerParticipants({});
    updateOrganizerButtons();
    return;
  }
  setBadge("live2RunBadge", "CARRERA · ACTIVA", "ok");
  const ctx = organizerContext() || {};
  if ($("live2RunText")) $("live2RunText").innerHTML = `Ejercicio: <b>${safeText(ctx.eventName || meta?.eventName || "ORIENTACIÓN")}</b><br>Sesión: <b>${safeText(runId)}</b>`;
  try { localStorage.setItem(ORGANIZER_RUN_KEY_PREFIX + eventKey, runId); } catch (_) {}
  organizerUnsubParticipants = onValue(ref(db, `${runPath(eventKey, runId)}/participants`), snap => {
    renderOrganizerParticipants(snap.val() || {});
  }, error => setMessage(`No se pudo leer el progreso: ${error.message}`, "error"));
  updateOrganizerButtons();
  setMessage("Carrera en vivo activa. Los participantes se conectarán automáticamente con su QR.", "ok");
}

async function bindOrganizerEvent(ctx) {
  if (!db || !currentUser || !ctx?.eventId) return;
  const eventKey = safeFirebaseKey(ctx.eventId);
  if (eventKey === organizerEventKey && organizerUnsubActive) return;
  if (typeof organizerUnsubActive === "function") organizerUnsubActive();
  cleanupOrganizerRunListener();
  organizerEventKey = eventKey;
  organizerRunId = "";
  organizerUnsubActive = onValue(ref(db, activeRunPath(eventKey)), snap => {
    const active = snap.val();
    if (active && active.status === "active" && active.runId) attachOrganizerRun(eventKey, String(active.runId), active);
    else attachOrganizerRun(eventKey, "");
  }, error => setMessage(`No se pudo comprobar la carrera activa: ${error.message}`, "error"));
}

function buildRunId() {
  const d = new Date();
  const pad = n => String(n).padStart(2,"0");
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
}

async function startOrganizerRun() {
  try {
    const ctx = organizerContext();
    if (!ctx?.eventId) throw new Error("No se pudo leer el identificador del ejercicio.");
    if (!Array.isArray(ctx.routes) || !ctx.routes.length) throw new Error("Genera primero los recorridos.");
    const eventKey = safeFirebaseKey(ctx.eventId);
    const runId = buildRunId();
    const participants = {};
    ctx.routes.forEach(route => {
      const pid = String(route.participantId || "").trim();
      if (!pid) return;
      participants[safeFirebaseKey(pid)] = {
        participantId: pid,
        participantName: String(route.participantName || "").trim(),
        routeId: String(route.routeId || ""),
        totalControls: Number(route.totalControls) || 0,
        completedControls: 0,
        pendingControls: Number(route.totalControls) || 0,
        status: "not_started",
        online: false,
        preparedAt: serverTimestamp(),
        lastSeenClient: null
      };
    });
    await set(ref(db, `${runPath(eventKey, runId)}/meta`), {
      version: 2,
      status: "active",
      eventId: String(ctx.eventId),
      eventName: String(ctx.eventName || "ENTRENAMIENTO ORIENTACIÓN"),
      runId,
      createdBy: currentUser.uid,
      createdAt: serverTimestamp(),
      createdAtClient: nowIso()
    });
    await set(ref(db, `${runPath(eventKey, runId)}/participants`), participants);
    await set(ref(db, activeRunPath(eventKey)), {
      status: "active",
      eventId: String(ctx.eventId),
      eventName: String(ctx.eventName || "ENTRENAMIENTO ORIENTACIÓN"),
      runId,
      startedAt: serverTimestamp(),
      startedAtClient: nowIso()
    });
    await attachOrganizerRun(eventKey, runId, {eventName:ctx.eventName});
  } catch (error) {
    console.error("MILITOPO LIVE · iniciar carrera", error);
    setMessage(`No se pudo iniciar la carrera: ${error.message}`, "error");
  }
}

async function stopOrganizerRun() {
  if (!organizerEventKey || !organizerRunId) return;
  if (!window.confirm("¿Cerrar la carrera en vivo? Los participantes conservarán todo localmente, pero dejarán de sincronizar con esta sesión.")) return;
  try {
    await update(ref(db, `${runPath(organizerEventKey, organizerRunId)}/meta`), { status:"closed", closedAt:serverTimestamp(), closedAtClient:nowIso() });
    await set(ref(db, activeRunPath(organizerEventKey)), null);
    setMessage("Carrera en vivo cerrada. MILITOPO local continúa funcionando.", "warn");
  } catch (error) {
    setMessage(`No se pudo cerrar la carrera: ${error.message}`, "error");
  }
}

function startOrganizerContextWatcher() {
  buildOrganizerPanel();
  const tick = () => {
    const ctx = organizerContext();
    if (ctx?.eventId && currentUser && db) bindOrganizerEvent(ctx);
  };
  tick();
  organizerContextTimer = window.setInterval(tick, 1800);
}

function readQueue() {
  try {
    const value = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch (_) { return []; }
}
function writeQueue(queue) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-300))); } catch (_) {}
}
function enqueueParticipantEvent(kind, payload) {
  const cleanPayload = payload || {};
  const event = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`,
    kind,
    eventKey: safeFirebaseKey(cleanPayload.eventId || participantContext?.eventId || ""),
    participantId: String(cleanPayload.participantId || participantContext?.participantId || ""),
    payload: cleanPayload,
    queuedAt: nowIso()
  };
  const queue = readQueue();
  queue.push(event);
  writeQueue(queue);
  flushParticipantQueue();
}

function persistParticipantContext(ctx) {
  participantContext = ctx;
  try { localStorage.setItem(PARTICIPANT_CONTEXT_KEY, JSON.stringify(ctx)); } catch (_) {}
}
function restoreParticipantContext() {
  try {
    const ctx = JSON.parse(localStorage.getItem(PARTICIPANT_CONTEXT_KEY) || "null");
    if (ctx?.eventId && ctx?.participantId) participantContext = ctx;
  } catch (_) {}
}

async function markParticipantReady() {
  if (!db || !currentUser || !participantContext || !participantEventKey || !participantRunId) return;
  const ctx = participantContext;
  const pRef = ref(db, participantPath(participantEventKey, participantRunId, ctx.participantId));
  participantPresenceRef = pRef;
  const readyData = {
    participantId: String(ctx.participantId),
    routeId: String(ctx.routeId || ""),
    totalControls: Number(ctx.totalControls) || 0,
    completedControls: Number(ctx.completedControls) || 0,
    pendingControls: Math.max(0, (Number(ctx.totalControls)||0) - (Number(ctx.completedControls)||0)),
    status: ctx.finishTime ? "finished" : (ctx.startTime ? "racing" : "ready"),
    online: true,
    connectedUid: currentUser.uid,
    lastSeen: serverTimestamp(),
    lastSeenClient: nowIso()
  };
  const readyName = String(ctx.participantName || "").trim();
  if (readyName) readyData.participantName = readyName;
  await update(pRef, readyData);
  onDisconnect(pRef).update({online:false,lastSeen:serverTimestamp(),lastSeenClient:nowIso()}).catch(()=>{});
}

async function bindParticipantEvent(ctx) {
  if (!db || !currentUser || !ctx?.eventId || !ctx?.participantId) return;
  persistParticipantContext(ctx);
  const eventKey = safeFirebaseKey(ctx.eventId);
  if (participantEventKey === eventKey && participantUnsubActive) return;
  if (typeof participantUnsubActive === "function") participantUnsubActive();
  participantEventKey = eventKey;
  participantRunId = "";
  participantUnsubActive = onValue(ref(db, activeRunPath(eventKey)), async snap => {
    const active = snap.val();
    if (active && active.status === "active" && active.runId) {
      participantRunId = String(active.runId);
      try { await markParticipantReady(); await flushParticipantQueue(); } catch (error) { console.warn("MILITOPO LIVE participante", error); }
    } else {
      participantRunId = "";
    }
  }, error => console.warn("MILITOPO LIVE · sesión participante", error));
}

async function applyParticipantEvent(event) {
  if (!participantContext || !participantEventKey || !participantRunId || !currentUser) throw new Error("Sesión en vivo no preparada");
  const payload = { ...participantContext, ...(event.payload || {}) };
  const pid = String(payload.participantId || participantContext.participantId);
  const pBase = participantPath(participantEventKey, participantRunId, pid);
  const completed = Math.max(0, Number(payload.completedControls) || 0);
  const total = Math.max(0, Number(payload.totalControls) || 0);
  const common = {
    participantId: pid,
    routeId: String(payload.routeId || participantContext.routeId || ""),
    totalControls: total,
    completedControls: completed,
    pendingControls: Math.max(0, total - completed),
    online: true,
    connectedUid: currentUser.uid,
    lastSeen: serverTimestamp(),
    lastSeenClient: payload.clientTime || nowIso()
  };
  const liveName = String(payload.participantName || participantContext.participantName || "").trim();
  if (liveName) common.participantName = liveName;
  if (event.kind === "START") {
    Object.assign(common, { status:"racing", startTime:payload.startTime || payload.clientTime || nowIso(), finishTime:null, completed:false });
  } else if (event.kind === "CONTROL") {
    Object.assign(common, { status:payload.finishTime ? "finished" : "racing", lastScanStatus:String(payload.scanStatus || ""), startTime:payload.startTime || null });
  } else if (event.kind === "FINISH") {
    Object.assign(common, { status:"finished", finishTime:payload.finishTime || payload.clientTime || nowIso(), startTime:payload.startTime || null, completed:!!payload.completed, resultCode:String(payload.resultCode || ""), missingControlsCount:Array.isArray(payload.missingControls)?payload.missingControls.length:Number(payload.missingControlsCount)||0 });
  } else {
    Object.assign(common, { status:payload.finishTime ? "finished" : (payload.startTime ? "racing" : "ready") });
  }
  await set(ref(db, `${runPath(participantEventKey, participantRunId)}/events/${safeFirebaseKey(pid)}/${event.id}`), {
    kind:event.kind,
    participantId:pid,
    progress:completed,
    totalControls:total,
    clientTime:payload.clientTime || nowIso(),
    receivedAt:serverTimestamp()
  });
  await update(ref(db, pBase), common);
}

async function flushParticipantQueue() {
  if (participantFlushBusy || !firebaseConnected || !db || !currentUser || !participantRunId || !participantContext) return;
  participantFlushBusy = true;
  try {
    let queue = readQueue();
    while (queue.length) {
      const index = queue.findIndex(event => event.eventKey === participantEventKey && String(event.participantId||"") === String(participantContext.participantId||""));
      if (index < 0) break;
      const event = queue[index];
      try {
        await applyParticipantEvent(event);
        queue.splice(index,1);
        writeQueue(queue);
      } catch (error) {
        console.warn("MILITOPO LIVE · evento pendiente", error);
        break;
      }
    }
  } finally { participantFlushBusy = false; }
}

function handleParticipantMessage(event) {
  const msg = event.data;
  if (!msg || msg.source !== "MILITOPO_LIVE_V2" || !msg.payload) return;
  const ctx = msg.payload;
  if (!ctx.eventId || !ctx.participantId) return;
  persistParticipantContext(ctx);
  if (db && currentUser) bindParticipantEvent(ctx);
  if (msg.kind === "READY") {
    if (participantRunId) markParticipantReady().catch(()=>{});
    return;
  }
  enqueueParticipantEvent(msg.kind, ctx);
}

async function initFirebase() {
  try {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getDatabase(app);

    onValue(ref(db, ".info/connected"), snap => {
      firebaseConnected = snap.val() === true;
      if (!isParticipantAccess()) {
        setBadge("live2DbBadge", firebaseConnected ? "FIREBASE · CONECTADO" : "FIREBASE · SIN CONEXIÓN", firebaseConnected ? "ok" : "error");
        if (!firebaseConnected) setMessage("Sin conexión. MILITOPO continúa funcionando de forma local.", "warn");
      }
      updateOrganizerButtons();
      if (firebaseConnected) flushParticipantQueue();
    });

    onAuthStateChanged(auth, user => {
      currentUser = user || null;
      if (!isParticipantAccess()) {
        setBadge("live2AuthBadge", user ? "AUTENTICACIÓN · CORRECTA" : "AUTENTICACIÓN · CONECTANDO", user ? "ok" : "warn");
        if (user) setMessage("Firebase preparado. Puedes iniciar la carrera en vivo.", "ok");
      }
      updateOrganizerButtons();
      if (user && participantContext) bindParticipantEvent(participantContext);
    });

    await signInAnonymously(auth);
  } catch (error) {
    console.error("MILITOPO LIVE · Firebase init", error);
    if (!isParticipantAccess()) {
      setBadge("live2AuthBadge", "AUTENTICACIÓN · ERROR", "error");
      setBadge("live2DbBadge", "FIREBASE · ERROR", "error");
      setMessage(`No se pudo iniciar Firebase: ${error.message}. MILITOPO local sigue operativo.`, "error");
    }
  }
}

function initLivePhase2() {
  const participant = isParticipantAccess();
  if (!participant) startOrganizerContextWatcher();
  else restoreParticipantContext();
  window.addEventListener("message", handleParticipantMessage);
  window.addEventListener("online", flushParticipantQueue);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") flushParticipantQueue(); });
  initFirebase();
}

window.MILITOPO_LIVE_PHASE2 = {
  get connected() { return firebaseConnected; },
  get runId() { return organizerRunId || participantRunId; },
  startOrganizerRun,
  stopOrganizerRun,
  flushParticipantQueue
};

document.addEventListener("DOMContentLoaded", initLivePhase2, { once:true });
