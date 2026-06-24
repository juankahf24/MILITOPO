/* MILITOPO LIVE · Fase final
   Sincronización automática de salida, controles, llegada y resultado.
   El organizador recibe e importa el ORI|RESULT sin escanearlo.
   El QR final y el código manual permanecen como respaldo. */
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
const AUTO_IMPORT_KEY_PREFIX = "militopo_live_v2_auto_import_";

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
let organizerClockTimer = null;
const organizerAutoImportBusy = new Set();
let organizerAutoImportedCount = 0;

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
    .militopo-live2-table-wrap{margin-top:14px;overflow-x:auto;border-radius:18px;border:1px solid rgba(237,214,145,.16);scrollbar-width:thin}.militopo-live2-table{width:100%;border-collapse:collapse;table-layout:fixed;min-width:620px;background:rgba(0,0,0,.12)}.militopo-live2-table th,.militopo-live2-table td{padding:7px 5px;border-bottom:1px solid rgba(237,214,145,.12);text-align:left;font-size:.63rem;line-height:1.18;vertical-align:middle;overflow:hidden}.militopo-live2-table th{color:#ffe2a0;font-size:.57rem;letter-spacing:.035em;text-transform:uppercase;background:rgba(0,0,0,.18);position:sticky;top:0;white-space:normal;overflow-wrap:anywhere}.militopo-live2-table th:not(:first-child),.militopo-live2-table td:not(:first-child){text-align:center}.militopo-live2-name{min-width:0}.militopo-live2-name b{display:block;color:#fff7e8;font-size:.69rem;line-height:1.15;white-space:normal;overflow-wrap:anywhere}.militopo-live2-name small{display:flex;align-items:center;gap:4px;color:#cbb894;margin-top:3px;min-width:0;flex-wrap:wrap}.militopo-live2-route-tag{display:inline-flex;padding:1px 5px;border-radius:999px;background:rgba(230,188,122,.12);border:1px solid rgba(230,188,122,.20);color:#ffe2a0;font-weight:900}.militopo-live2-time{white-space:nowrap;font-variant-numeric:tabular-nums;font-size:.60rem}.militopo-live2-time.is-running{color:#d5edff;font-weight:900}.militopo-live2-time.is-finished{color:#eaffd8;font-weight:900}.militopo-live2-state{display:inline-flex;align-items:center;justify-content:center;max-width:100%;padding:4px 6px;border-radius:999px;font-weight:900;font-size:.55rem;line-height:1.05;white-space:normal;overflow-wrap:anywhere;text-align:center;border:1px solid rgba(255,255,255,.12)}.militopo-live2-state.ready,.militopo-live2-state.not_started{color:#ffe2a0;background:rgba(230,188,122,.12)}.militopo-live2-state.racing{color:#d5edff;background:rgba(70,139,206,.15);border-color:rgba(93,168,255,.36)}.militopo-live2-state.finished{color:#eaffd8;background:rgba(107,140,62,.18);border-color:rgba(139,181,106,.42)}.militopo-live2-state.offline{color:#ffd7ce;background:rgba(151,49,34,.15)}.militopo-live2-state.imported{color:#eaffd8;background:rgba(74,135,52,.24);border-color:rgba(157,220,108,.55)}.militopo-live2-progress{font-weight:900;color:#fff7e8}.militopo-live2-empty{padding:18px;text-align:center;color:rgba(255,247,232,.65);font-size:.75rem}
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
      <div class="militopo-live2-title"><div class="militopo-live2-title-icon">📡</div><div><h3>SEGUIMIENTO EN VIVO</h3><p>Salida, controles, llegada y resultado se sincronizan automáticamente. No se comparte ubicación.</p></div></div>
      <div class="militopo-live2-phase">FASE FINAL · AUTOMÁTICO</div>
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
      <table class="militopo-live2-table"><colgroup><col style="width:24%"><col style="width:14%"><col style="width:10%"><col style="width:16%"><col style="width:11%"><col style="width:11%"><col style="width:14%"></colgroup><thead><tr><th>Participante</th><th>Estado</th><th>Progreso</th><th>Última sincronización</th><th>Salida</th><th>Llegada</th><th>Tiempo total</th></tr></thead><tbody id="live2ParticipantsBody"><tr><td colspan="7" class="militopo-live2-empty">Inicia la carrera en vivo para preparar los participantes.</td></tr></tbody></table>
    </div>`;
  const header = step5.querySelector(":scope > .card-header");
  if (header) header.insertAdjacentElement("afterend", panel); else step5.prepend(panel);
  $("live2StartRunBtn")?.addEventListener("click", startOrganizerRun);
  $("live2StopRunBtn")?.addEventListener("click", stopOrganizerRun);
  if (!organizerClockTimer) organizerClockTimer = window.setInterval(refreshOrganizerTimeCells, 1000);
}

function setBadge(id, text, state = "neutral") {
  const el = $(id); if (!el) return; el.textContent = text; el.dataset.state = state;
}
function setMessage(text, type = "info") {
  const el = $("live2Message"); if (!el) return; el.className = `militopo-live2-message is-${type}`; el.textContent = text;
}
function parseLiveDate(value) {
  if (!value) return null;
  const d = new Date(typeof value === "number" ? value : String(value));
  return Number.isFinite(d.getTime()) ? d : null;
}
function formatLastSeen(value) {
  const d = parseLiveDate(value);
  if (!d) return "—";
  return d.toLocaleTimeString("es-ES", { hour:"2-digit", minute:"2-digit", second:"2-digit" });
}
function formatLiveClock(value) {
  const d = parseLiveDate(value);
  if (!d) return "—";
  return d.toLocaleTimeString("es-ES", { hour:"2-digit", minute:"2-digit", second:"2-digit" });
}
function formatLiveDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2,"0")}:${String(minutes).padStart(2,"0")}:${String(seconds).padStart(2,"0")}`;
}
function refreshOrganizerTimeCells() {
  document.querySelectorAll(".militopo-live2-total-time[data-start]").forEach(cell => {
    const start = parseLiveDate(cell.dataset.start);
    const finish = parseLiveDate(cell.dataset.finish);
    if (!start) {
      cell.textContent = "—";
      cell.classList.remove("is-running","is-finished");
      return;
    }
    const end = finish || new Date();
    cell.textContent = formatLiveDuration(end.getTime() - start.getTime());
    cell.classList.toggle("is-running", !finish);
    cell.classList.toggle("is-finished", !!finish);
  });
}

function autoImportStorageKey(){
  return `${AUTO_IMPORT_KEY_PREFIX}${organizerEventKey}_${organizerRunId}`;
}
function readAutoImportMap(){
  try {
    const data = JSON.parse(localStorage.getItem(autoImportStorageKey()) || "{}");
    return data && typeof data === "object" ? data : {};
  } catch (_) { return {}; }
}
function writeAutoImportMap(data){
  try { localStorage.setItem(autoImportStorageKey(), JSON.stringify(data || {})); } catch (_) {}
}
function resultFingerprint(value){
  const text=String(value||"");
  let hash=2166136261;
  for(let i=0;i<text.length;i++){
    hash^=text.charCodeAt(i);
    hash=Math.imul(hash,16777619);
  }
  return (hash>>>0).toString(36);
}
async function markLiveResultImported(participantId,resultCode,result){
  if(!db||!organizerEventKey||!organizerRunId)return;
  const pid=String(participantId||"");
  await update(ref(db,participantPath(organizerEventKey,organizerRunId,pid)),{
    resultImported:true,
    resultImportedAt:serverTimestamp(),
    resultImportedClient:nowIso(),
    resultImportHash:resultFingerprint(resultCode),
    resultImportStatus:result?.duplicate?"already_imported":"imported",
    resultImportError:null
  });
}
async function processFinishedResults(rows){
  if(!organizerRunId||!organizerEventKey||!Array.isArray(rows))return;
  if(typeof window.MILITOPO_LIVE_IMPORT_RESULT!=="function")return;
  const importedMap=readAutoImportMap();
  for(const participant of rows){
    const pid=String(participant?.participantId||"");
    const resultCode=String(participant?.resultCode||"").trim();
    if(!pid||participant?.status!=="finished"||!resultCode)continue;
    const fingerprint=resultFingerprint(resultCode);
    const busyKey=`${pid}:${fingerprint}`;
    if(organizerAutoImportBusy.has(busyKey))continue;
    if(importedMap[pid]===fingerprint&&participant?.resultImported===true)continue;
    organizerAutoImportBusy.add(busyKey);
    try{
      const result=window.MILITOPO_LIVE_IMPORT_RESULT(resultCode,{
        runId:organizerRunId,
        receivedAt:participant?.finishTime||nowIso()
      });
      if(result?.ok){
        importedMap[pid]=fingerprint;
        writeAutoImportMap(importedMap);
        await markLiveResultImported(pid,resultCode,result);
        organizerAutoImportedCount=Object.keys(importedMap).length;
        setMessage(`Resultado de ${pid} importado automáticamente. Total recibidos en vivo: ${organizerAutoImportedCount}.`,"ok");
      }else{
        await update(ref(db,participantPath(organizerEventKey,organizerRunId,pid)),{
          resultImportStatus:"error",
          resultImportError:String(result?.error||"Resultado no válido"),
          resultImportAttemptAt:serverTimestamp()
        });
        setMessage(`Llegada recibida de ${pid}, pero el resultado no pudo importarse: ${result?.error||"error desconocido"}. Usa su QR final como respaldo.`,"error");
      }
    }catch(error){
      console.warn("MILITOPO LIVE · autoimport",error);
      setMessage(`No se pudo importar automáticamente el resultado de ${pid}. El QR final sigue disponible.`,"warn");
    }finally{
      organizerAutoImportBusy.delete(busyKey);
    }
  }
}

function stateLabel(status, online, resultImported = false) {
  if (resultImported) return { cls:"imported", label:"FINALIZADO ✓" };
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
    body.innerHTML = `<tr><td colspan="7" class="militopo-live2-empty">Todavía no hay participantes preparados.</td></tr>`;
    return;
  }
  body.innerHTML = rows.map(p => {
    const st = stateLabel(p.status, p.online, p.resultImported === true);
    const pid = String(p.participantId || "—");
    const name = String(p.participantName || "").trim();
    const completed = Math.max(0, Number(p.completedControls) || 0);
    const total = Math.max(0, Number(p.totalControls) || 0);
    const routeId = String(p.routeId || "—");
    const startRaw = p.startTime || "";
    const finishRaw = p.finishTime || "";
    return `<tr>
      <td class="militopo-live2-name"><b>${safeText(name || pid)}</b><small><span>${safeText(name ? pid : "Sin nombre asignado")}</span><span class="militopo-live2-route-tag">${safeText(routeId)}</span></small></td>
      <td><span class="militopo-live2-state ${st.cls}">${st.label}</span></td>
      <td class="militopo-live2-progress">${completed} / ${total}</td>
      <td class="militopo-live2-time">${safeText(formatLastSeen(p.lastSeenClient || p.lastSeen))}</td>
      <td class="militopo-live2-time">${safeText(formatLiveClock(startRaw))}</td>
      <td class="militopo-live2-time">${safeText(formatLiveClock(finishRaw))}</td>
      <td class="militopo-live2-time militopo-live2-total-time" data-start="${safeText(startRaw)}" data-finish="${safeText(finishRaw)}">—</td>
    </tr>`;
  }).join("");
  refreshOrganizerTimeCells();
  processFinishedResults(rows).catch(error=>console.warn("MILITOPO LIVE · procesar resultados",error));
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
    organizerAutoImportedCount = 0;
    setBadge("live2RunBadge", "CARRERA · NO INICIADA", "neutral");
    if ($("live2RunText")) $("live2RunText").textContent = "Sin carrera en vivo activa para este ejercicio.";
    renderOrganizerParticipants({});
    updateOrganizerButtons();
    return;
  }
  setBadge("live2RunBadge", "CARRERA · ACTIVA", "ok");
  organizerAutoImportedCount = Object.keys(readAutoImportMap()).length;
  const ctx = organizerContext() || {};
  if ($("live2RunText")) $("live2RunText").innerHTML = `Ejercicio: <b>${safeText(ctx.eventName || meta?.eventName || "ORIENTACIÓN")}</b><br>Sesión: <b>${safeText(runId)}</b>`;
  try { localStorage.setItem(ORGANIZER_RUN_KEY_PREFIX + eventKey, runId); } catch (_) {}
  organizerUnsubParticipants = onValue(ref(db, `${runPath(eventKey, runId)}/participants`), snap => {
    renderOrganizerParticipants(snap.val() || {});
  }, error => setMessage(`No se pudo leer el progreso: ${error.message}`, "error"));
  updateOrganizerButtons();
  setMessage("Carrera en vivo activa. La llegada y el resultado se importarán automáticamente; el QR final queda como respaldo.", "ok");
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
        resultImported: false,
        resultImportStatus: "pending",
        online: false,
        preparedAt: serverTimestamp(),
        lastSeenClient: null
      };
    });
    await set(ref(db, `${runPath(eventKey, runId)}/meta`), {
      version: 3,
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
    runId: String(participantRunId || participantContext?.liveRunId || ""),
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
      persistParticipantContext({...participantContext,liveRunId:participantRunId});
      try { await markParticipantReady(); await flushParticipantQueue(); } catch (error) { console.warn("MILITOPO LIVE participante", error); }
    } else {
      const savedRunId=String(participantContext?.liveRunId||"");
      const hasPending=readQueue().some(event=>event.eventKey===participantEventKey&&String(event.participantId||"")===String(participantContext?.participantId||""));
      participantRunId=hasPending?savedRunId:"";
      if(participantRunId)flushParticipantQueue();
    }
  }, error => console.warn("MILITOPO LIVE · sesión participante", error));
}

async function applyParticipantEvent(event) {
  const targetRunId=String(event?.runId||participantRunId||participantContext?.liveRunId||"");
  if (!participantContext || !participantEventKey || !targetRunId || !currentUser) throw new Error("Sesión en vivo no preparada");
  const payload = { ...participantContext, ...(event.payload || {}) };
  const pid = String(payload.participantId || participantContext.participantId);
  const pBase = participantPath(participantEventKey, targetRunId, pid);
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
    Object.assign(common, { status:"finished", finishTime:payload.finishTime || payload.clientTime || nowIso(), startTime:payload.startTime || null, completed:!!payload.completed, resultCode:String(payload.resultCode || ""), resultImportStatus:"pending", resultImported:false, missingControlsCount:Array.isArray(payload.missingControls)?payload.missingControls.length:Number(payload.missingControlsCount)||0 });
  } else {
    Object.assign(common, { status:payload.finishTime ? "finished" : (payload.startTime ? "racing" : "ready") });
  }
  await set(ref(db, `${runPath(participantEventKey, targetRunId)}/events/${safeFirebaseKey(pid)}/${event.id}`), {
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
  phase: "final",
  get connected() { return firebaseConnected; },
  get runId() { return organizerRunId || participantRunId; },
  startOrganizerRun,
  stopOrganizerRun,
  flushParticipantQueue
};

document.addEventListener("DOMContentLoaded", initLivePhase2, { once:true });
