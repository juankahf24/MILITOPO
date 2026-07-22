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
const PARTICIPANT_LAST_SYNC_KEY_PREFIX = "militopo_live_v2_last_sync_";

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
let participantUnsubOwnRecord = null;
let participantPresenceRef = null;
let participantFlushBusy = false;
let participantMessageSource = null;
let participantActiveRunAvailable = false;
let participantLastImportNoticeKey = "";
let participantPresenceConfirmed = false;
let participantResultReceived = false;
let participantTrackReceived = false;
let participantExpectedTrackPointCount = 0;
let participantLastSyncAt = "";
let participantLastSyncIdentity = "";
let participantHeartbeatTimer = null;
let organizerAutoImportTimer = null;
let organizerLatestRows = [];
let organizerSort = { key: "default", direction: "asc" };

const $ = id => document.getElementById(id);

function getDiscardPenaltyMinutes(){
  try{ return Math.max(0,Number(globalThis.MILITOPO_GET_DISCARD_PENALTY_MINUTES?.())||15); }catch(_){ return 15; }
}

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

function participantLastSyncKey(ctx = participantContext) {
  if (!ctx?.eventId || !ctx?.participantId) return "";
  return PARTICIPANT_LAST_SYNC_KEY_PREFIX + safeFirebaseKey(ctx.eventId) + ":" + safeFirebaseKey(ctx.participantId);
}
function loadParticipantLastSync(ctx = participantContext) {
  const key = participantLastSyncKey(ctx);
  if (!key) return "";
  if (participantLastSyncIdentity === key) return participantLastSyncAt;
  participantLastSyncIdentity = key;
  try { participantLastSyncAt = String(localStorage.getItem(key) || ""); } catch (_) { participantLastSyncAt = ""; }
  return participantLastSyncAt;
}
function confirmParticipantSync(value = nowIso()) {
  const key = participantLastSyncKey();
  if (!key) return;
  participantLastSyncIdentity = key;
  participantLastSyncAt = String(value || nowIso());
  try { localStorage.setItem(key, participantLastSyncAt); } catch (_) {}
}

function isParticipantAccess() {
  try {
    const path = String(location.pathname || "").toLowerCase();
    if (path.includes("/orientacion/participante/")) return true;
    const params = new URLSearchParams(location.search || "");
    return (params.get("modo") || "").toLowerCase() === "participante";
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
    .militopo-live2-table-wrap{margin-top:14px;overflow-x:auto;border-radius:18px;border:1px solid rgba(237,214,145,.16);scrollbar-width:thin}.militopo-live2-table{width:100%;border-collapse:collapse;table-layout:fixed;min-width:850px;background:rgba(0,0,0,.12)}.militopo-live2-table th,.militopo-live2-table td{padding:7px 5px;border-bottom:1px solid rgba(237,214,145,.12);text-align:left;font-size:.63rem;line-height:1.18;vertical-align:middle;overflow:hidden}.militopo-live2-table th{color:#ffe2a0;font-size:.57rem;letter-spacing:.035em;text-transform:uppercase;background:rgba(0,0,0,.18);position:sticky;top:0;white-space:normal;overflow-wrap:normal;word-break:normal}.militopo-live2-th-nowrap{white-space:nowrap!important}.militopo-live2-th-two-lines{white-space:normal!important}.militopo-live2-th-two-lines span{display:block;white-space:nowrap}.militopo-live2-sortable{cursor:pointer;user-select:none;touch-action:manipulation}.militopo-live2-sortable>span.militopo-live2-sort-label{display:inline-flex;align-items:center;justify-content:center;gap:4px;max-width:100%}.militopo-live2-sortable .militopo-live2-sort-arrow{display:inline-block;min-width:10px;font-size:.62rem;line-height:1;color:rgba(255,226,160,.48)}.militopo-live2-sortable[aria-sort="ascending"] .militopo-live2-sort-arrow,.militopo-live2-sortable[aria-sort="descending"] .militopo-live2-sort-arrow{color:#fff3c8}.militopo-live2-sortable:focus-visible{outline:2px solid rgba(255,226,160,.8);outline-offset:-2px}.militopo-live2-table th:not(:first-child),.militopo-live2-table td:not(:first-child){text-align:center}.militopo-live2-name{min-width:0}.militopo-live2-name b{display:block;color:#fff7e8;font-size:.69rem;line-height:1.15;white-space:normal;overflow-wrap:anywhere}.militopo-live2-name small{display:flex;align-items:center;gap:4px;color:#cbb894;margin-top:3px;min-width:0;flex-wrap:wrap}.militopo-live2-route-tag{display:inline-flex;padding:1px 5px;border-radius:999px;background:rgba(230,188,122,.12);border:1px solid rgba(230,188,122,.20);color:#ffe2a0;font-weight:900}.militopo-live2-time{white-space:nowrap;font-variant-numeric:tabular-nums;font-size:.60rem}.militopo-live2-time.is-running{color:#d5edff;font-weight:900}.militopo-live2-time.is-finished{color:#eaffd8;font-weight:900}.militopo-live2-state{display:inline-flex;align-items:center;justify-content:center;max-width:100%;padding:4px 6px;border-radius:999px;font-weight:900;font-size:.55rem;line-height:1.05;white-space:normal;overflow-wrap:anywhere;text-align:center;border:1px solid rgba(255,255,255,.12)}.militopo-live2-state.ready,.militopo-live2-state.not_started{color:#ffe2a0;background:rgba(230,188,122,.12)}.militopo-live2-state.racing{color:#d5edff;background:rgba(70,139,206,.15);border-color:rgba(93,168,255,.36)}.militopo-live2-state.finished{color:#eaffd8;background:rgba(107,140,62,.18);border-color:rgba(139,181,106,.42)}.militopo-live2-state.offline{color:#ffd7ce;background:rgba(151,49,34,.15)}.militopo-live2-state.imported{color:#eaffd8;background:rgba(74,135,52,.24);border-color:rgba(157,220,108,.55)}.militopo-live2-progress{font-weight:900;color:#fff7e8}.militopo-live2-empty{padding:18px;text-align:center;color:rgba(255,247,232,.65);font-size:.75rem}
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
      <div class="militopo-live2-title"><div class="militopo-live2-title-icon">📡</div><div><h3>SEGUIMIENTO EN VIVO</h3></div></div>
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
      <table class="militopo-live2-table"><colgroup><col style="width:18%"><col style="width:11%"><col style="width:9%"><col style="width:10%"><col style="width:10%"><col style="width:11%"><col style="width:10%"><col style="width:10%"><col style="width:11%"><col style="width:8%"><col style="width:8%"></colgroup><thead><tr><th class="militopo-live2-sortable" data-sort-key="participant" tabindex="0" role="button" aria-sort="none"><span class="militopo-live2-sort-label">Participante <span class="militopo-live2-sort-arrow">↕</span></span></th><th class="militopo-live2-sortable" data-sort-key="status" tabindex="0" role="button" aria-sort="none"><span class="militopo-live2-sort-label">Estado <span class="militopo-live2-sort-arrow">↕</span></span></th><th class="militopo-live2-th-nowrap militopo-live2-sortable" data-sort-key="progress" tabindex="0" role="button" aria-sort="none"><span class="militopo-live2-sort-label">Progreso <span class="militopo-live2-sort-arrow">↕</span></span></th><th class="militopo-live2-th-two-lines militopo-live2-sortable" data-sort-key="pending" tabindex="0" role="button" aria-sort="none"><span>Puntos</span><span class="militopo-live2-sort-label">pendientes <span class="militopo-live2-sort-arrow">↕</span></span></th><th class="militopo-live2-th-two-lines militopo-live2-sortable" data-sort-key="discarded" tabindex="0" role="button" aria-sort="none"><span>Puntos</span><span class="militopo-live2-sort-label">descartados <span class="militopo-live2-sort-arrow">↕</span></span></th><th class="militopo-live2-th-two-lines militopo-live2-sortable" data-sort-key="adjustedTime" tabindex="0" role="button" aria-sort="none"><span>Tiempo</span><span class="militopo-live2-sort-label">ajustado <span class="militopo-live2-sort-arrow">↕</span></span></th><th class="militopo-live2-th-two-lines militopo-live2-sortable" data-sort-key="penalty" tabindex="0" role="button" aria-sort="none"><span>Penalización</span><span class="militopo-live2-sort-label">controles <span class="militopo-live2-sort-arrow">↕</span></span></th><th class="militopo-live2-th-two-lines militopo-live2-sortable" data-sort-key="totalTime" tabindex="0" role="button" aria-sort="none"><span>Tiempo</span><span class="militopo-live2-sort-label">real <span class="militopo-live2-sort-arrow">↕</span></span></th><th class="militopo-live2-sortable" data-sort-key="lastSync" tabindex="0" role="button" aria-sort="none"><span class="militopo-live2-sort-label">Última sincronización <span class="militopo-live2-sort-arrow">↕</span></span></th><th class="militopo-live2-sortable" data-sort-key="start" tabindex="0" role="button" aria-sort="none"><span class="militopo-live2-sort-label">Salida <span class="militopo-live2-sort-arrow">↕</span></span></th><th class="militopo-live2-sortable" data-sort-key="finish" tabindex="0" role="button" aria-sort="none"><span class="militopo-live2-sort-label">Llegada <span class="militopo-live2-sort-arrow">↕</span></span></th></tr></thead><tbody id="live2ParticipantsBody"><tr><td colspan="11" class="militopo-live2-empty">Inicia la carrera en vivo para preparar los participantes.</td></tr></tbody></table>
    </div>`;
  const header = step5.querySelector(":scope > .card-header");
  const segments = step5.querySelector("#raceSegmentsConfigBlock");
  if (segments) segments.insertAdjacentElement("afterend", panel);
  else if (header) header.insertAdjacentElement("afterend", panel);
  else step5.prepend(panel);
  $("live2StartRunBtn")?.addEventListener("click", startOrganizerRun);
  $("live2StopRunBtn")?.addEventListener("click", stopOrganizerRun);
  bindOrganizerSortHeaders(panel);
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
    const raw = Math.max(0,end.getTime() - start.getTime());
    const penalty = Math.max(0,Number(cell.dataset.penaltyMs)||0);
    const adjusted = cell.classList.contains("militopo-live2-adjusted-time");
    cell.textContent = formatLiveDuration(raw + (adjusted ? penalty : 0));
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
        receivedAt:participant?.finishTime||nowIso(),
        track:Array.isArray(participant?.track)?participant.track:[],
        trackPointCount:Number(participant?.trackPointCount)||0
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
  if (resultImported) return { cls:"imported", label:"FINALIZADO CON RESULTADO" };
  if (online === false && status !== "finished") return { cls:"offline", label:"SIN CONEXIÓN" };
  if (status === "racing") return { cls:"racing", label:"EN CARRERA" };
  if (status === "finished") return { cls:"finished", label:"FINALIZADO" };
  if (status === "ready") return { cls:"ready", label:"CONECTADO" };
  return { cls:"not_started", label:"SIN SALIR" };
}

function liveParticipantIdCompare(a, b) {
  return String(a?.participantId || "").localeCompare(
    String(b?.participantId || ""),
    "es",
    { numeric:true }
  );
}

function liveTimeMs(value) {
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) ? ms : null;
}

function liveElapsedMs(participant, now = Date.now()) {
  const start = liveTimeMs(participant?.startTime);
  if (start === null) return Number.POSITIVE_INFINITY;
  const finish = liveTimeMs(participant?.finishTime);
  return Math.max(0, (finish === null ? now : finish) - start);
}

function sortOrganizerParticipants(participants) {
  const rows = Object.values(participants);
  const allStarted = rows.length > 0 && rows.every(p =>
    p?.status === "racing" || p?.status === "finished" || liveTimeMs(p?.startTime) !== null
  );

  if (!allStarted) {
    // Mientras se están dando las salidas: primero quienes ya salieron,
    // respetando exactamente el orden cronológico de salida.
    return rows.sort((a, b) => {
      const aStart = liveTimeMs(a?.startTime);
      const bStart = liveTimeMs(b?.startTime);
      if (aStart !== null && bStart !== null && aStart !== bStart) return aStart - bStart;
      if (aStart !== null && bStart === null) return -1;
      if (aStart === null && bStart !== null) return 1;
      return liveParticipantIdCompare(a, b);
    });
  }

  const now = Date.now();
  return rows.sort((a, b) => {
    const progressDifference = (Math.max(0, Number(b?.completedControls) || 0)) -
                               (Math.max(0, Number(a?.completedControls) || 0));
    if (progressDifference) return progressDifference;

    const elapsedDifference = liveElapsedMs(a, now) - liveElapsedMs(b, now);
    if (elapsedDifference) return elapsedDifference;

    return liveParticipantIdCompare(a, b);
  });
}


function liveSortTime(value) {
  const d = parseLiveDate(value);
  return d ? d.getTime() : -1;
}
function liveSortStatusRank(status) {
  return ({ finished:4, racing:3, ready:2, not_started:1, offline:0 })[String(status || "")] ?? 0;
}
function organizerSortValue(p, key) {
  const completed = Math.max(0, Number(p?.completedControls) || 0);
  const discarded = Math.max(0, Number(p?.discardedControls) || 0, Number(p?.skippedControlsCount) || 0);
  const total = Math.max(0, Number(p?.totalControls) || 0);
  const pending = Math.max(0, total - completed - discarded);
  switch (key) {
    case "participant": return `${String(p?.participantName || "").trim()} ${String(p?.participantId || "")}`.trim().toLocaleLowerCase("es");
    case "status": return liveSortStatusRank(p?.status);
    case "progress": return completed;
    case "pending": return pending;
    case "discarded": return discarded;
    case "penalty": { const finished=liveSortTime(p?.finishTime)>=0||String(p?.status||"")==="finished"; return (discarded+(finished?pending:0))*getDiscardPenaltyMinutes()*60000; }
    case "adjustedTime": {
      const start = liveSortTime(p?.startTime);
      if (start < 0) return -1;
      const finish = liveSortTime(p?.finishTime);
      const raw = (finish >= 0 ? finish : Date.now()) - start;
      const finished=finish>=0||String(p?.status||"")==="finished"; return raw + (discarded+(finished?pending:0))*getDiscardPenaltyMinutes()*60000;
    }
    case "lastSync": return liveSortTime(p?.lastSeenClient || p?.lastSeen);
    case "start": return liveSortTime(p?.startTime);
    case "finish": return liveSortTime(p?.finishTime);
    case "totalTime": {
      const start = liveSortTime(p?.startTime);
      if (start < 0) return -1;
      const finish = liveSortTime(p?.finishTime);
      return (finish >= 0 ? finish : Date.now()) - start;
    }
    default: return 0;
  }
}
function applyOrganizerColumnSort(rows) {
  if (!organizerSort || organizerSort.key === "default") return rows;
  const factor = organizerSort.direction === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = organizerSortValue(a, organizerSort.key);
    const bv = organizerSortValue(b, organizerSort.key);
    let result = 0;
    if (typeof av === "string" || typeof bv === "string") result = String(av).localeCompare(String(bv), "es", { numeric:true, sensitivity:"base" });
    else result = Number(av) - Number(bv);
    if (result) return result * factor;
    // Al ordenar por progreso, los empates se resuelven siempre por menor tiempo ajustado.
    if (organizerSort.key === "progress") {
      const adjustedDiff = organizerSortValue(a, "adjustedTime") - organizerSortValue(b, "adjustedTime");
      if (adjustedDiff) return adjustedDiff;
      const rawDiff = organizerSortValue(a, "totalTime") - organizerSortValue(b, "totalTime");
      if (rawDiff) return rawDiff;
      const discardedDiff = organizerSortValue(a, "discarded") - organizerSortValue(b, "discarded");
      if (discardedDiff) return discardedDiff;
    }
    return liveParticipantIdCompare(a, b);
  });
}
function updateOrganizerSortHeaders() {
  document.querySelectorAll(".militopo-live2-sortable[data-sort-key]").forEach(th => {
    const active = th.dataset.sortKey === organizerSort.key;
    th.setAttribute("aria-sort", active ? (organizerSort.direction === "desc" ? "descending" : "ascending") : "none");
    const arrow = th.querySelector(".militopo-live2-sort-arrow");
    if (arrow) arrow.textContent = active ? (organizerSort.direction === "desc" ? "▼" : "▲") : "↕";
  });
}
function setOrganizerSort(key) {
  if (!key) return;
  if (organizerSort.key === key) organizerSort.direction = organizerSort.direction === "asc" ? "desc" : "asc";
  else organizerSort = { key, direction:key === "progress" ? "desc" : "asc" };
  updateOrganizerSortHeaders();
  renderOrganizerParticipants(Object.fromEntries(organizerLatestRows.map((p, i) => [String(p?.participantId || i), p])));
}
function bindOrganizerSortHeaders(panel) {
  panel.querySelectorAll(".militopo-live2-sortable[data-sort-key]").forEach(th => {
    const activate = () => setOrganizerSort(th.dataset.sortKey);
    th.addEventListener("click", activate);
    th.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(); }
    });
  });
  updateOrganizerSortHeaders();
}

function renderOrganizerParticipants(participantsValue) {
  const participants = participantsValue && typeof participantsValue === "object" ? participantsValue : {};
  const rows = applyOrganizerColumnSort(sortOrganizerParticipants(participants));
  organizerLatestRows = rows;
  const counts = { total: rows.length, pending:0, racing:0, finished:0 };
  rows.forEach(p => {
    if (typeof window.MILITOPO_LIVE_SYNC_STARTFLOW_STATUS === "function") {
      window.MILITOPO_LIVE_SYNC_STARTFLOW_STATUS(p.participantId, p.status);
    }
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
    body.innerHTML = `<tr><td colspan="11" class="militopo-live2-empty">Todavía no hay participantes preparados.</td></tr>`;
    return;
  }
  body.innerHTML = rows.map(p => {
    const st = stateLabel(p.status, p.online, p.resultImported === true);
    const pid = String(p.participantId || "—");
    const name = String(p.participantName || "").trim();
    const completed = Math.max(0, Number(p.completedControls) || 0);
    const discarded = Math.max(0, Number(p.discardedControls) || 0, Number(p.skippedControlsCount) || 0);
    const total = Math.max(0, Number(p.totalControls) || 0);
    const pending = Math.max(0, total - completed - discarded);
    const routeId = String(p.routeId || "—");
    const startRaw = p.startTime || "";
    const finishRaw = p.finishTime || "";
    const penaltyMinutes = getDiscardPenaltyMinutes();
    const finishedForPenalty=Boolean(finishRaw)||String(p.status||"")==="finished";
    const penaltyMs = (discarded + (finishedForPenalty ? pending : 0)) * penaltyMinutes * 60000;
    return `<tr>
      <td class="militopo-live2-name"><b>${safeText(name || pid)}</b><small><span>${safeText(name ? pid : "Sin nombre asignado")}</span><span class="militopo-live2-route-tag">${safeText(routeId)}</span></small></td>
      <td><span class="militopo-live2-state ${st.cls}">${st.label}</span></td>
      <td class="militopo-live2-progress">${completed} / ${total}</td>
      <td class="militopo-live2-progress">${pending}</td>
      <td class="militopo-live2-progress">${discarded}</td>
      <td class="militopo-live2-time militopo-live2-total-time militopo-live2-adjusted-time" data-start="${safeText(startRaw)}" data-finish="${safeText(finishRaw)}" data-penalty-ms="${penaltyMs}">—</td>
      <td class="militopo-live2-time">${penaltyMs ? "+"+formatLiveDuration(penaltyMs) : "—"}</td>
      <td class="militopo-live2-time militopo-live2-total-time" data-start="${safeText(startRaw)}" data-finish="${safeText(finishRaw)}" data-penalty-ms="${penaltyMs}">—</td>
      <td class="militopo-live2-time">${safeText(formatLastSeen(p.lastSeenClient || p.lastSeen))}</td>
      <td class="militopo-live2-time">${safeText(formatLiveClock(startRaw))}</td>
      <td class="militopo-live2-time">${safeText(formatLiveClock(finishRaw))}</td>
    </tr>`;
  }).join("");
  refreshOrganizerTimeCells();
  if(typeof window.MILITOPO_LIVE_ATTACH_TRACK==="function") rows.forEach(p=>{if(Array.isArray(p?.track)&&p.track.length)window.MILITOPO_LIVE_ATTACH_TRACK(p.participantId,p.track,{trackPointCount:p.trackPointCount,live:true})});
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

async function resetOrganizerEventForReusableExercise(eventId) {
  const eventKey = safeFirebaseKey(eventId || organizerEventKey || "");
  if (!eventKey) return false;
  try { localStorage.removeItem(ORGANIZER_RUN_KEY_PREFIX + eventKey); } catch (_) {}
  try { localStorage.removeItem(AUTO_IMPORT_KEY_PREFIX + eventKey); } catch (_) {}
  try { organizerAutoImportedCount = 0; organizerLatestRows = []; organizerAutoImportBusy.clear(); } catch (_) {}
  try {
    if (typeof organizerUnsubActive === "function") organizerUnsubActive();
    organizerUnsubActive = null;
  } catch (_) {}
  cleanupOrganizerRunListener();
  const previousRunId = organizerRunId || "";
  organizerEventKey = eventKey;
  organizerRunId = "";
  if (db && currentUser) {
    try {
      const activeSnap = await get(ref(db, activeRunPath(eventKey)));
      const active = activeSnap.val();
      const runId = String(active?.runId || previousRunId || "");
      if (runId) {
        try { await update(ref(db, `${runPath(eventKey, runId)}/meta`), { status:"reset", resetAt:serverTimestamp(), resetAtClient:nowIso() }); } catch (_) {}
        try { await set(ref(db, `${runPath(eventKey, runId)}/participants`), null); } catch (_) {}
        try { await set(ref(db, `${runPath(eventKey, runId)}/events`), null); } catch (_) {}
      }
      await set(ref(db, activeRunPath(eventKey)), null);
    } catch (error) {
      console.warn("MILITOPO LIVE · reset reusable exercise", error);
    }
  }
  try { attachOrganizerRun(eventKey, ""); } catch (_) {}
  try { renderOrganizerParticipants({}); } catch (_) {}
  try { updateOrganizerButtons(); } catch (_) {}
  try { setMessage("Ejercicio restaurado limpio. La carrera en vivo queda cerrada hasta que pulses INICIAR CARRERA EN VIVO.", "warn"); } catch (_) {}
  try { if (currentUser && db) bindOrganizerEvent({eventId:eventKey}); } catch (_) {}
  return true;
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
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify((Array.isArray(queue) ? queue : []).slice(-1200)));
    return true;
  } catch (error) {
    console.warn("MILITOPO LIVE · no se pudo guardar la cola local", error);
    return false;
  }
}
function removeQueuedEventById(eventId) {
  const latest = readQueue();
  const next = latest.filter(item => String(item?.id || "") !== String(eventId || ""));
  writeQueue(next);
  return next;
}
function participantPendingQueueSummary() {
  if (!participantContext) return { total:0, controls:0, result:false, start:false };
  const eventKey = participantEventKey || safeFirebaseKey(participantContext.eventId || "");
  const pid = String(participantContext.participantId || "");
  const own = readQueue().filter(event => event.eventKey === eventKey && String(event.participantId || "") === pid);
  return {
    total: own.length,
    controls: own.filter(event => event.kind === "CONTROL").length,
    result: own.some(event => event.kind === "FINISH"),
    start: own.some(event => event.kind === "START")
  };
}
function participantPendingQueueCount() {
  return participantPendingQueueSummary().total;
}
function participantSyncSnapshot() {
  const summary = participantPendingQueueSummary();
  const pending = summary.total;
  const extra = { pending, pendingControls:summary.controls, pendingResult:summary.result, pendingStart:summary.start, resultReceived:participantResultReceived, trackReceived:participantTrackReceived, expectedTrackPointCount:participantExpectedTrackPointCount };
  const lastSyncAt = loadParticipantLastSync() || "";
  if ((!participantActiveRunAvailable && pending === 0) || !participantRunId) {
    return { state:"inactive", text:"⚪ CARRERA EN VIVO NO ACTIVA", lastSyncAt, ...extra };
  }
  if (!firebaseConnected || !db || !currentUser) {
    return { state:"offline", text:"🟠 SIN COBERTURA · GUARDADO EN EL MÓVIL", lastSyncAt, ...extra };
  }
  if (pending > 0) {
    return { state:"syncing", text:`🔄 SINCRONIZANDO ${pending} ${pending === 1 ? "CAMBIO" : "CAMBIOS"}`, lastSyncAt, ...extra };
  }
  if (participantFlushBusy || !participantPresenceConfirmed) {
    return { state:"syncing", text:"🔄 SINCRONIZANDO CON EN VIVO", lastSyncAt, ...extra };
  }
  return { state:"synced", text:"🟢 EN VIVO · SINCRONIZADO", lastSyncAt, ...extra };
}
function publishParticipantSyncStatus(target = participantMessageSource) {
  if (!target || typeof target.postMessage !== "function") return;
  try {
    target.postMessage({ source:"MILITOPO_LIVE_SYNC_STATUS", payload:participantSyncSnapshot() }, "*");
  } catch (_) {}
}
function publishParticipantResultImported(data, target = participantMessageSource) {
  if (!target || typeof target.postMessage !== "function" || !data) return;
  try {
    target.postMessage({
      source:"MILITOPO_LIVE_RESULT_IMPORTED",
      payload:{
        participantId:String(data.participantId || participantContext?.participantId || ""),
        routeId:String(data.routeId || participantContext?.routeId || ""),
        resultImportStatus:String(data.resultImportStatus || "imported"),
        resultImportedAt:data.resultImportedClient || data.finishTime || nowIso()
      }
    }, "*");
  } catch (_) {}
}
function bindParticipantOwnRecord() {
  if (typeof participantUnsubOwnRecord === "function") participantUnsubOwnRecord();
  participantUnsubOwnRecord = null;
  if (!db || !currentUser || !participantContext || !participantEventKey || !participantRunId) return;
  const ownRef = ref(db, participantPath(participantEventKey, participantRunId, participantContext.participantId));
  participantUnsubOwnRecord = onValue(ownRef, snap => {
    const data = snap.val();
    if (data && data.online === true && (!data.connectedUid || data.connectedUid === currentUser?.uid)) {
      participantPresenceConfirmed = true;
    }
    if (data) {
      const localFinished = !!participantContext?.finishTime;
      const localTrackCount = Math.max(0, Number(participantContext?.trackPointCount) || 0);
      participantExpectedTrackPointCount = localTrackCount;
      participantResultReceived = localFinished && data.status === "finished" && !!data.finishTime && !!String(data.resultCode || "").trim();
      participantTrackReceived = localFinished && localTrackCount > 0 && data.trackComplete === true && Number(data.trackPointCount || 0) >= localTrackCount && Array.isArray(data.track) && data.track.length >= localTrackCount;
      publishParticipantSyncStatus();
    }
    if (!data || data.resultImported !== true) return;
    const noticeKey = `${participantRunId}:${data.resultImportHash || data.resultImportedClient || data.finishTime || "imported"}`;
    if (participantLastImportNoticeKey === noticeKey) return;
    participantLastImportNoticeKey = noticeKey;
    publishParticipantResultImported(data);
  }, error => {
    participantPresenceConfirmed = false;
    publishParticipantSyncStatus();
    console.warn("MILITOPO LIVE · confirmación de importación", error);
  });
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
  if (!writeQueue(queue)) {
    publishParticipantSyncStatus();
    console.error("MILITOPO LIVE · cola local llena; conserva los QR como respaldo");
    return;
  }
  publishParticipantSyncStatus();
  flushParticipantQueue();
}

function persistParticipantContext(ctx) {
  participantContext = ctx;
  loadParticipantLastSync(ctx);
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
    discardedControls: Math.max(0, Number(ctx.discardedControls) || 0, Number(ctx.skippedControlsCount) || 0),
    skippedControlsCount: Math.max(0, Number(ctx.discardedControls) || 0, Number(ctx.skippedControlsCount) || 0),
    pendingControls: Math.max(0, (Number(ctx.totalControls)||0) - (Number(ctx.completedControls)||0)),
    status: ctx.finishTime ? "finished" : (ctx.startTime ? "racing" : "ready"),
    online: true,
    connectedUid: currentUser.uid,
    lastSeen: serverTimestamp(),
    lastSeenClient: nowIso()
  };
  const readyName = String(ctx.participantName || "").trim();
  if (readyName) readyData.participantName = readyName;
  if (ctx.startTime) readyData.startTime = ctx.startTime;
  if (ctx.finishTime) {
    readyData.finishTime = ctx.finishTime;
    readyData.completed = !!ctx.completed;
    readyData.missingControlsCount = Array.isArray(ctx.missingControls) ? ctx.missingControls.length : Number(ctx.missingControlsCount) || 0;
    const savedResultCode = String(ctx.resultCode || "").trim();
    if (savedResultCode) readyData.resultCode = savedResultCode;
  }
  try {
    await update(pRef, readyData);
    participantPresenceConfirmed = true;
    confirmParticipantSync();
    onDisconnect(pRef).update({online:false,lastSeen:serverTimestamp(),lastSeenClient:nowIso()}).catch(()=>{});
    publishParticipantSyncStatus();
  } catch (error) {
    participantPresenceConfirmed = false;
    publishParticipantSyncStatus();
    throw error;
  }
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
      participantActiveRunAvailable = true;
      participantRunId = String(active.runId);
      persistParticipantContext({...participantContext,liveRunId:participantRunId});
      publishParticipantSyncStatus();
      try { await markParticipantReady(); bindParticipantOwnRecord(); await flushParticipantQueue(); } catch (error) { console.warn("MILITOPO LIVE participante", error); }
      publishParticipantSyncStatus();
    } else {
      participantActiveRunAvailable = false;
      participantPresenceConfirmed = false;
      if (typeof participantUnsubOwnRecord === "function") participantUnsubOwnRecord();
      participantUnsubOwnRecord = null;
      const savedRunId=String(participantContext?.liveRunId||"");
      const hasPending=readQueue().some(event=>event.eventKey===participantEventKey&&String(event.participantId||"")===String(participantContext?.participantId||""));
      participantRunId=hasPending?savedRunId:"";
      publishParticipantSyncStatus();
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
    discardedControls: Math.max(0, Number(payload.discardedControls) || 0, Number(payload.skippedControlsCount) || 0),
    skippedControlsCount: Math.max(0, Number(payload.discardedControls) || 0, Number(payload.skippedControlsCount) || 0),
    pendingControls: Math.max(0, total - completed),
    online: true,
    connectedUid: currentUser.uid,
    lastSeen: serverTimestamp(),
    lastSeenClient: payload.clientTime || nowIso()
  };
  const liveName = String(payload.participantName || participantContext.participantName || "").trim();
  if (liveName) common.participantName = liveName;
  if (Array.isArray(payload.trackSnapshot) && payload.trackSnapshot.length) {
    common.track = payload.trackSnapshot;
    common.trackPointCount = Math.max(Number(payload.trackPointCount)||0, common.track.length);
    common.trackReceivedClient = payload.clientTime || nowIso();
    common.trackComplete = common.track.length >= common.trackPointCount;
    common.trackUpdatedClient = payload.clientTime || nowIso();
  }
  if (event.kind === "TRACK_CHUNK") {
    const transferId = safeFirebaseKey(payload.transferId || "track");
    const chunkIndex = Math.max(0, Number(payload.chunkIndex) || 0);
    const totalChunks = Math.max(1, Number(payload.totalChunks) || 1);
    const chunk = Array.isArray(payload.trackChunk) ? payload.trackChunk : [];
    await set(ref(db, `${pBase}/trackTransfers/${transferId}/chunks/${chunkIndex}`), chunk);
    await update(ref(db, `${pBase}/trackTransfers/${transferId}`), {
      transferId,
      totalChunks,
      trackPointCount: Math.max(0, Number(payload.trackPointCount) || 0),
      lastChunkClient: payload.clientTime || nowIso(),
      receivedChunks: chunkIndex + 1
    });
    await update(ref(db, pBase), {
      trackTransferId: transferId,
      trackTransferTotalChunks: totalChunks,
      trackPointCount: Math.max(0, Number(payload.trackPointCount) || 0),
      trackComplete: false,
      trackUpdatedClient: payload.clientTime || nowIso(),
      lastSeen: serverTimestamp(),
      lastSeenClient: payload.clientTime || nowIso()
    });
    participantPresenceConfirmed = true;
    confirmParticipantSync();
    publishParticipantSyncStatus();
    return;
  }
  if (event.kind === "TRACK_COMMIT") {
    const transferId = safeFirebaseKey(payload.transferId || "track");
    const totalChunks = Math.max(1, Number(payload.totalChunks) || 1);
    const expectedCount = Math.max(0, Number(payload.trackPointCount) || 0);
    const chunksSnap = await get(ref(db, `${pBase}/trackTransfers/${transferId}/chunks`));
    const rawChunks = chunksSnap.val() || {};
    const track = [];
    for (let i = 0; i < totalChunks; i++) {
      const chunk = rawChunks[i] ?? rawChunks[String(i)];
      if (!Array.isArray(chunk)) throw new Error(`Falta la parte ${i + 1}/${totalChunks} del track`);
      track.push(...chunk);
    }
    if (expectedCount && track.length !== expectedCount) throw new Error(`Track incompleto: ${track.length}/${expectedCount} puntos`);
    await update(ref(db, pBase), {
      track,
      trackPointCount: track.length,
      trackComplete: true,
      trackReceivedClient: payload.clientTime || nowIso(),
      trackUpdatedClient: payload.clientTime || nowIso(),
      trackTransferId: transferId,
      trackTransferReceivedChunks: totalChunks,
      lastSeen: serverTimestamp(),
      lastSeenClient: payload.clientTime || nowIso()
    });
    participantPresenceConfirmed = true;
    confirmParticipantSync();
    publishParticipantSyncStatus();
    return;
  }
  if (event.kind === "START") {
    Object.assign(common, { status:"racing", startTime:payload.startTime || payload.clientTime || nowIso(), finishTime:null, completed:false });
  } else if (event.kind === "CONTROL") {
    Object.assign(common, { status:payload.finishTime ? "finished" : "racing", lastScanStatus:String(payload.scanStatus || ""), startTime:payload.startTime || null });
  } else if (event.kind === "FINISH") {
    Object.assign(common, { status:"finished", finishTime:payload.finishTime || payload.clientTime || nowIso(), startTime:payload.startTime || null, completed:!!payload.completed, missingControlsCount:Array.isArray(payload.missingControls)?payload.missingControls.length:Number(payload.missingControlsCount)||0 });
    const finishResultCode = String(payload.resultCode || "").trim();
    if (finishResultCode) { common.resultCode = finishResultCode; common.resultReceivedClient = payload.clientTime || nowIso(); }
  } else {
    Object.assign(common, { status:payload.finishTime ? "finished" : (payload.startTime ? "racing" : "ready") });
  }
  await set(ref(db, `${runPath(participantEventKey, targetRunId)}/events/${safeFirebaseKey(pid)}/${event.id}`), {
    kind:event.kind,
    participantId:pid,
    progress:completed,
    totalControls:total,
    discardedControls:Math.max(0, Number(payload.discardedControls) || 0, Number(payload.skippedControlsCount) || 0),
    clientTime:payload.clientTime || nowIso(),
    receivedAt:serverTimestamp()
  });
  await update(ref(db, pBase), common);
  participantPresenceConfirmed = true;
  confirmParticipantSync();
  publishParticipantSyncStatus();
}

async function flushParticipantQueue() {
  if (participantFlushBusy || !firebaseConnected || !db || !currentUser || !participantRunId || !participantContext) {
    publishParticipantSyncStatus();
    return;
  }
  participantFlushBusy = true;
  publishParticipantSyncStatus();
  try {
    while (true) {
      // Siempre releer la cola actual. Mientras Firebase espera, el iframe puede añadir
      // nuevos bloques del track; nunca debemos sobrescribirlos con una copia antigua.
      const queue = readQueue();
      const event = queue.find(item => item.eventKey === participantEventKey && String(item.participantId||"") === String(participantContext.participantId||""));
      if (!event) break;
      try {
        await applyParticipantEvent(event);
        removeQueuedEventById(event.id);
        publishParticipantSyncStatus();
      } catch (error) {
        console.warn("MILITOPO LIVE · evento pendiente", error);
        publishParticipantSyncStatus();
        break;
      }
    }
  } finally {
    participantFlushBusy = false;
    publishParticipantSyncStatus();
    // Cubre la llegada de mensajes justo entre la última lectura y la liberación del bloqueo.
    const remaining = participantPendingQueueCount();
    if (remaining > 0 && firebaseConnected && db && currentUser && participantRunId && participantContext) {
      setTimeout(() => flushParticipantQueue(), 0);
    }
  }
}

async function recoverParticipantConnection() {
  if (!participantContext || !firebaseConnected || !db || !currentUser) {
    participantPresenceConfirmed = false;
    publishParticipantSyncStatus();
    return;
  }
  try {
    if (!participantEventKey) await bindParticipantEvent(participantContext);
    if (participantRunId) {
      await markParticipantReady();
      bindParticipantOwnRecord();
    }
    await flushParticipantQueue();
  } catch (error) {
    participantPresenceConfirmed = false;
    publishParticipantSyncStatus();
    console.warn("MILITOPO LIVE · reconexión participante", error);
  }
}

function handleParticipantMessage(event) {
  const msg = event.data;
  if (!msg || msg.source !== "MILITOPO_LIVE_V2" || !msg.payload) return;
  const ctx = msg.payload;
  if (!ctx.eventId || !ctx.participantId) return;
  if (event.source && participantMessageSource !== event.source) participantLastImportNoticeKey = "";
  participantMessageSource = event.source || participantMessageSource;
  if (msg.kind === "TRACK_CHUNK" || msg.kind === "TRACK_COMMIT") {
    // Los mensajes de track llevan resultCode vacío para aligerar el envío. No deben
    // borrar el código final ni el estado de llegada ya guardados en el contexto.
    const preservedResultCode = String(participantContext?.resultCode || "").trim();
    persistParticipantContext({
      ...participantContext,
      ...ctx,
      finishTime: ctx.finishTime || participantContext?.finishTime || null,
      resultCode: String(ctx.resultCode || "").trim() || preservedResultCode,
      trackChunk: undefined
    });
  } else {
    const preservedResultCode = String(participantContext?.resultCode || "").trim();
    persistParticipantContext({
      ...participantContext,
      ...ctx,
      resultCode: String(ctx.resultCode || "").trim() || preservedResultCode
    });
  }
  participantExpectedTrackPointCount = Math.max(0, Number(ctx.trackPointCount) || participantExpectedTrackPointCount || 0);
  const raceIsFinished = !!(ctx.finishTime || participantContext?.finishTime);
  if (!raceIsFinished) { participantResultReceived = false; participantTrackReceived = false; }
  publishParticipantSyncStatus();
  if (db && currentUser) bindParticipantEvent(ctx);
  if (msg.kind === "READY") {
    participantPresenceConfirmed = false;
    if (participantRunId) {
      bindParticipantOwnRecord();
      markParticipantReady().then(()=>publishParticipantSyncStatus()).catch(()=>publishParticipantSyncStatus());
    }
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
      if (!firebaseConnected) participantPresenceConfirmed = false;
      if (!isParticipantAccess()) {
        setBadge("live2DbBadge", firebaseConnected ? "FIREBASE · CONECTADO" : "FIREBASE · SIN CONEXIÓN", firebaseConnected ? "ok" : "error");
        if (!firebaseConnected) setMessage("Sin conexión. MILITOPO continúa funcionando de forma local.", "warn");
      }
      updateOrganizerButtons();
      publishParticipantSyncStatus();
      if (firebaseConnected) recoverParticipantConnection();
    });

    onAuthStateChanged(auth, user => {
      currentUser = user || null;
      if (!isParticipantAccess()) {
        setBadge("live2AuthBadge", user ? "AUTENTICACIÓN · CORRECTA" : "AUTENTICACIÓN · CONECTANDO", user ? "ok" : "warn");
        if (user) setMessage("Firebase preparado. Puedes iniciar la carrera en vivo.", "ok");
      }
      updateOrganizerButtons();
      if (!user) participantPresenceConfirmed = false;
      publishParticipantSyncStatus();
      if (user && participantContext) {
        bindParticipantEvent(participantContext);
        recoverParticipantConnection();
      }
    });

    await signInAnonymously(auth);
  } catch (error) {
    console.error("MILITOPO LIVE · Firebase init", error);
    if (!isParticipantAccess()) {
      setBadge("live2AuthBadge", "AUTENTICACIÓN · ERROR", "error");
      setBadge("live2DbBadge", "FIREBASE · ERROR", "error");
      setMessage(`No se pudo iniciar Firebase: ${error.message}. MILITOPO local sigue operativo.`, "error");
    }
    publishParticipantSyncStatus();
  }
}

function initLivePhase2() {
  const participant = isParticipantAccess();
  if (!participant) {
    startOrganizerContextWatcher();
    organizerAutoImportTimer = window.setInterval(() => {
      if (organizerLatestRows.length) processFinishedResults(organizerLatestRows).catch(error=>console.warn("MILITOPO LIVE · reintento resultados",error));
    }, 2500);
  } else {
    restoreParticipantContext();
    participantHeartbeatTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") recoverParticipantConnection();
    }, 12000);
  }
  window.addEventListener("message", handleParticipantMessage);
  window.addEventListener("online", recoverParticipantConnection);
  window.addEventListener("offline", () => {
    participantPresenceConfirmed = false;
    publishParticipantSyncStatus();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") recoverParticipantConnection();
  });
  initFirebase();
}

window.MILITOPO_LIVE_PHASE2 = {
  phase: "final",
  get connected() { return firebaseConnected; },
  get runId() { return organizerRunId || participantRunId; },
  startOrganizerRun,
  stopOrganizerRun,
  resetOrganizerEventForReusableExercise,
  flushParticipantQueue
};

document.addEventListener("DOMContentLoaded", initLivePhase2, { once:true });
