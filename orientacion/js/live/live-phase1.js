/* MILITOPO LIVE · Fase 1
   Conexión experimental de organizador con Firebase.
   No modifica resultados, recorridos, PDF, QR ni estado deportivo. */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  getDatabase,
  ref,
  set,
  update,
  push,
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

const STORAGE_KEY = "militopo_live_phase1_session";
const ROOT_PATH = "militopoLive/v1/phase1/sessions";

let app = null;
let auth = null;
let db = null;
let currentUser = null;
let currentSessionId = "";
let unsubscribeClients = null;
let unsubscribePulses = null;
let heartbeatTimer = null;
let firebaseConnected = false;

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
    .slice(0, 80) || "MILITOPO";
}

function eventInfo() {
  const eventId = $("eventId")?.value?.trim() || "SIN-EVENTO";
  const eventName = $("eventName")?.value?.trim() || "ENTRENAMIENTO ORIENTACIÓN";
  return { eventId, eventName };
}

function shortUid(uid) {
  return uid ? `${uid.slice(0, 6)}…${uid.slice(-4)}` : "—";
}

function setBadge(id, text, state = "neutral") {
  const el = $(id);
  if (!el) return;
  el.textContent = text;
  el.dataset.state = state;
}

function setMessage(message, type = "info") {
  const el = $("livePhase1Message");
  if (!el) return;
  el.className = `militopo-live-message is-${type}`;
  el.textContent = message;
}

function updateControls() {
  const ready = Boolean(currentUser && firebaseConnected);
  const inSession = Boolean(currentSessionId);
  ["livePhase1CreateBtn", "livePhase1JoinBtn"].forEach(id => {
    const el = $(id);
    if (el) el.disabled = !ready;
  });
  const pulse = $("livePhase1PulseBtn");
  if (pulse) pulse.disabled = !(ready && inSession);
  const leave = $("livePhase1LeaveBtn");
  if (leave) leave.disabled = !inSession;
}

function injectStyles() {
  if ($("militopoLivePhase1Styles")) return;
  const style = document.createElement("style");
  style.id = "militopoLivePhase1Styles";
  style.textContent = `
    .militopo-live-panel{margin:18px 0 20px;padding:18px;border-radius:28px;border:1px solid rgba(237,214,145,.24);background:linear-gradient(180deg,rgba(27,45,26,.96),rgba(14,28,16,.97));box-shadow:0 18px 42px rgba(0,0,0,.22),inset 0 1px 0 rgba(255,255,255,.08);color:#fff7e8;overflow:hidden}
    .militopo-live-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:14px}
    .militopo-live-title{display:flex;gap:11px;align-items:center}.militopo-live-title-icon{width:44px;height:44px;border-radius:16px;display:grid;place-items:center;font-size:1.35rem;background:rgba(139,181,106,.16);border:1px solid rgba(190,238,150,.25)}
    .militopo-live-title h3{margin:0;font-size:1rem;letter-spacing:.04em}.militopo-live-title p{margin:4px 0 0;font-size:.73rem;line-height:1.35;color:rgba(255,247,232,.68)}
    .militopo-live-phase{padding:7px 10px;border-radius:999px;background:rgba(230,188,122,.14);border:1px solid rgba(230,188,122,.25);font-size:.65rem;font-weight:900;white-space:nowrap}
    .militopo-live-statuses{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:14px}.militopo-live-badge{padding:9px 8px;border-radius:14px;text-align:center;font-size:.68rem;font-weight:900;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08)}
    .militopo-live-badge[data-state="ok"]{color:#dff6c4;border-color:rgba(139,181,106,.42);background:rgba(107,140,62,.16)}.militopo-live-badge[data-state="error"]{color:#ffd5ca;border-color:rgba(221,92,67,.42);background:rgba(151,49,34,.16)}.militopo-live-badge[data-state="warn"]{color:#ffe4a6;border-color:rgba(230,188,122,.38);background:rgba(151,103,34,.14)}
    .militopo-live-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.militopo-live-actions button{min-height:46px;border:0;border-radius:16px;padding:10px 12px;font-weight:900;font-size:.76rem;cursor:pointer}.militopo-live-actions button:disabled{opacity:.45;cursor:not-allowed}.militopo-live-actions .primary{background:linear-gradient(180deg,#9acb68,#6d9f45);color:#17220f}.militopo-live-actions .secondary{background:rgba(255,255,255,.08);color:#fff7e8;border:1px solid rgba(255,255,255,.12)}
    .militopo-live-join{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:9px;margin:12px 0}.militopo-live-join input{min-width:0;border-radius:15px;border:1px solid rgba(230,188,122,.35);background:rgba(42,28,17,.92);color:#fff7e8;padding:11px 12px;font-weight:800}.militopo-live-join button{border-radius:15px;border:1px solid rgba(230,188,122,.28);background:rgba(230,188,122,.14);color:#fff7e8;padding:10px 14px;font-weight:900}
    .militopo-live-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:14px}.militopo-live-metric{padding:11px 8px;border-radius:16px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.075);text-align:center}.militopo-live-metric strong{display:block;font-size:1rem}.militopo-live-metric span{display:block;margin-top:3px;font-size:.61rem;color:rgba(255,247,232,.62)}
    .militopo-live-session{margin-top:12px;padding:10px 12px;border-radius:15px;background:rgba(0,0,0,.14);font-size:.68rem;line-height:1.45;word-break:break-word}.militopo-live-message{margin-top:10px;padding:10px 12px;border-radius:14px;font-size:.7rem;line-height:1.4;background:rgba(255,255,255,.05)}.militopo-live-message.is-ok{color:#dff6c4}.militopo-live-message.is-error{color:#ffd0c5}.militopo-live-message.is-warn{color:#ffe0a0}
    @media(max-width:620px){.militopo-live-panel{padding:15px;border-radius:24px}.militopo-live-statuses,.militopo-live-metrics{grid-template-columns:1fr}.militopo-live-actions{grid-template-columns:1fr}.militopo-live-head{align-items:center}.militopo-live-phase{font-size:.58rem}}
  `;
  document.head.appendChild(style);
}

function buildPanel() {
  if ($("militopoLivePhase1Panel")) return;
  const step5 = $("step5");
  if (!step5) return;
  injectStyles();
  const panel = document.createElement("section");
  panel.id = "militopoLivePhase1Panel";
  panel.className = "militopo-live-panel";
  panel.innerHTML = `
    <div class="militopo-live-head">
      <div class="militopo-live-title">
        <div class="militopo-live-title-icon">📡</div>
        <div><h3>SEGUIMIENTO EN VIVO</h3><p>Prueba de conexión. Todavía no envía salidas, controles ni resultados.</p></div>
      </div>
      <div class="militopo-live-phase">FASE 1 · PRUEBA</div>
    </div>
    <div class="militopo-live-statuses">
      <div id="livePhase1AuthBadge" class="militopo-live-badge" data-state="warn">AUTENTICACIÓN · ESPERANDO</div>
      <div id="livePhase1DbBadge" class="militopo-live-badge" data-state="warn">FIREBASE · CONECTANDO</div>
      <div id="livePhase1SessionBadge" class="militopo-live-badge">SESIÓN · NO CREADA</div>
    </div>
    <div class="militopo-live-actions">
      <button id="livePhase1CreateBtn" class="primary" type="button" disabled>＋ CREAR SESIÓN DE PRUEBA</button>
      <button id="livePhase1PulseBtn" class="secondary" type="button" disabled>📶 ENVIAR PULSO DE PRUEBA</button>
    </div>
    <div class="militopo-live-join">
      <input id="livePhase1JoinInput" type="text" inputmode="text" autocomplete="off" placeholder="Código de sesión de prueba">
      <button id="livePhase1JoinBtn" type="button" disabled>UNIR</button>
    </div>
    <div class="militopo-live-actions">
      <button id="livePhase1CopyBtn" class="secondary" type="button" disabled>📋 COPIAR CÓDIGO</button>
      <button id="livePhase1LeaveBtn" class="secondary" type="button" disabled>DESCONECTAR PRUEBA</button>
    </div>
    <div class="militopo-live-metrics">
      <div class="militopo-live-metric"><strong id="livePhase1Devices">0</strong><span>DISPOSITIVOS CONECTADOS</span></div>
      <div class="militopo-live-metric"><strong id="livePhase1Pulses">0</strong><span>PULSOS RECIBIDOS</span></div>
      <div class="militopo-live-metric"><strong id="livePhase1Uid">—</strong><span>IDENTIDAD TEMPORAL</span></div>
    </div>
    <div id="livePhase1SessionText" class="militopo-live-session">Sin sesión activa. Crea una sesión para comprobar la sincronización.</div>
    <div id="livePhase1Message" class="militopo-live-message">Inicializando Firebase…</div>
  `;
  const header = step5.querySelector(":scope > .card-header");
  if (header) header.insertAdjacentElement("afterend", panel);
  else step5.prepend(panel);

  $("livePhase1CreateBtn")?.addEventListener("click", createTestSession);
  $("livePhase1PulseBtn")?.addEventListener("click", sendTestPulse);
  $("livePhase1JoinBtn")?.addEventListener("click", () => joinSession($("livePhase1JoinInput")?.value || ""));
  $("livePhase1CopyBtn")?.addEventListener("click", copySessionCode);
  $("livePhase1LeaveBtn")?.addEventListener("click", leaveSession);
}

function cleanupListeners() {
  if (typeof unsubscribeClients === "function") unsubscribeClients();
  if (typeof unsubscribePulses === "function") unsubscribePulses();
  unsubscribeClients = null;
  unsubscribePulses = null;
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

async function markCurrentClientOnline() {
  if (!db || !currentUser || !currentSessionId) return;
  const { eventId, eventName } = eventInfo();
  const clientRef = ref(db, `${ROOT_PATH}/${currentSessionId}/clients/${currentUser.uid}`);
  const payload = {
    uid: currentUser.uid,
    role: "organizer-test",
    online: true,
    eventId,
    eventName,
    connectedAt: serverTimestamp(),
    lastSeen: serverTimestamp(),
    userAgent: navigator.userAgent.slice(0, 240)
  };
  await update(clientRef, payload);
  onDisconnect(clientRef).update({ online: false, lastSeen: serverTimestamp() }).catch(() => {});
  heartbeatTimer = window.setInterval(() => {
    if (!firebaseConnected || !currentSessionId) return;
    update(clientRef, { online: true, lastSeen: serverTimestamp() }).catch(() => {});
  }, 20000);
}

async function attachSession(sessionId) {
  if (!db || !currentUser) throw new Error("Firebase todavía no está preparado.");
  const normalized = safeFirebaseKey(sessionId).toUpperCase();
  if (!normalized) throw new Error("Código de sesión no válido.");
  cleanupListeners();
  currentSessionId = normalized;
  localStorage.setItem(STORAGE_KEY, normalized);
  if ($("livePhase1JoinInput")) $("livePhase1JoinInput").value = normalized;
  setBadge("livePhase1SessionBadge", "SESIÓN · ACTIVA", "ok");
  $("livePhase1SessionText").innerHTML = `Código: <b>${safeText(normalized)}</b><br>Comparte este código para abrir la misma prueba en otro dispositivo.`;
  const copyBtn = $("livePhase1CopyBtn");
  if (copyBtn) copyBtn.disabled = false;
  updateControls();
  await markCurrentClientOnline();

  unsubscribeClients = onValue(ref(db, `${ROOT_PATH}/${normalized}/clients`), snapshot => {
    const clients = snapshot.val() || {};
    const onlineCount = Object.values(clients).filter(client => client && client.online === true).length;
    if ($("livePhase1Devices")) $("livePhase1Devices").textContent = String(onlineCount);
  }, error => setMessage(`Error leyendo dispositivos: ${error.message}`, "error"));

  unsubscribePulses = onValue(ref(db, `${ROOT_PATH}/${normalized}/pulses`), snapshot => {
    const pulses = snapshot.val() || {};
    if ($("livePhase1Pulses")) $("livePhase1Pulses").textContent = String(Object.keys(pulses).length);
  }, error => setMessage(`Error leyendo pulsos: ${error.message}`, "error"));

  setMessage("Sesión de prueba conectada. Puedes enviar un pulso o abrirla en otro dispositivo.", "ok");
}

async function createTestSession() {
  try {
    const { eventId, eventName } = eventInfo();
    const stamp = Date.now().toString(36).slice(-7).toUpperCase();
    const sessionId = `${safeFirebaseKey(eventId).slice(0, 34)}-TEST-${stamp}`.toUpperCase();
    await set(ref(db, `${ROOT_PATH}/${sessionId}/meta`), {
      phase: 1,
      type: "connection-test",
      status: "active",
      eventId,
      eventName,
      createdBy: currentUser.uid,
      createdAt: serverTimestamp()
    });
    await attachSession(sessionId);
  } catch (error) {
    console.error("MILITOPO LIVE · create session", error);
    setMessage(`No se pudo crear la sesión: ${error.message}`, "error");
  }
}

async function joinSession(rawSessionId) {
  try {
    const sessionId = safeFirebaseKey(rawSessionId).toUpperCase();
    if (!sessionId) throw new Error("Introduce el código de sesión.");
    await attachSession(sessionId);
  } catch (error) {
    console.error("MILITOPO LIVE · join session", error);
    setMessage(`No se pudo unir a la sesión: ${error.message}`, "error");
  }
}

async function sendTestPulse() {
  try {
    if (!currentSessionId) throw new Error("No hay una sesión activa.");
    const pulseRef = push(ref(db, `${ROOT_PATH}/${currentSessionId}/pulses`));
    await set(pulseRef, {
      uid: currentUser.uid,
      type: "test-pulse",
      sentAt: serverTimestamp(),
      clientTime: new Date().toISOString()
    });
    setMessage("Pulso enviado y recibido por Firebase correctamente.", "ok");
  } catch (error) {
    console.error("MILITOPO LIVE · pulse", error);
    setMessage(`No se pudo enviar el pulso: ${error.message}`, "error");
  }
}

async function copySessionCode() {
  if (!currentSessionId) return;
  try {
    await navigator.clipboard.writeText(currentSessionId);
    setMessage("Código de sesión copiado.", "ok");
  } catch (_) {
    const input = $("livePhase1JoinInput");
    input?.select();
    setMessage("Selecciona y copia el código mostrado.", "warn");
  }
}

function leaveSession() {
  cleanupListeners();
  currentSessionId = "";
  localStorage.removeItem(STORAGE_KEY);
  setBadge("livePhase1SessionBadge", "SESIÓN · NO CREADA", "neutral");
  if ($("livePhase1Devices")) $("livePhase1Devices").textContent = "0";
  if ($("livePhase1Pulses")) $("livePhase1Pulses").textContent = "0";
  if ($("livePhase1SessionText")) $("livePhase1SessionText").textContent = "Sin sesión activa. Crea una sesión para comprobar la sincronización.";
  const copyBtn = $("livePhase1CopyBtn");
  if (copyBtn) copyBtn.disabled = true;
  updateControls();
  setMessage("Prueba desconectada. El resto de MILITOPO continúa funcionando con normalidad.", "warn");
}

async function initFirebasePhase1() {
  buildPanel();
  try {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getDatabase(app);

    onValue(ref(db, ".info/connected"), snapshot => {
      firebaseConnected = snapshot.val() === true;
      setBadge("livePhase1DbBadge", firebaseConnected ? "FIREBASE · CONECTADO" : "FIREBASE · SIN CONEXIÓN", firebaseConnected ? "ok" : "error");
      updateControls();
      if (!firebaseConnected) setMessage("Sin conexión con Firebase. MILITOPO sigue funcionando de forma local.", "warn");
    });

    onAuthStateChanged(auth, async user => {
      currentUser = user || null;
      if (user) {
        setBadge("livePhase1AuthBadge", "AUTENTICACIÓN · CORRECTA", "ok");
        if ($("livePhase1Uid")) $("livePhase1Uid").textContent = shortUid(user.uid);
        updateControls();
        setMessage("Firebase autenticado. Crea una sesión de prueba para verificar el tiempo real.", "ok");
        const savedSession = localStorage.getItem(STORAGE_KEY);
        if (savedSession && !currentSessionId) {
          try { await attachSession(savedSession); } catch (error) { setMessage(`No se pudo recuperar la sesión anterior: ${error.message}`, "warn"); }
        }
      } else {
        setBadge("livePhase1AuthBadge", "AUTENTICACIÓN · CONECTANDO", "warn");
        updateControls();
      }
    });

    await signInAnonymously(auth);
  } catch (error) {
    console.error("MILITOPO LIVE · Firebase init", error);
    setBadge("livePhase1AuthBadge", "AUTENTICACIÓN · ERROR", "error");
    setBadge("livePhase1DbBadge", "FIREBASE · ERROR", "error");
    setMessage(`No se pudo iniciar Firebase: ${error.message}. El resto de MILITOPO no se ha modificado.`, "error");
    updateControls();
  }
}

window.MILITOPO_LIVE_PHASE1 = {
  get sessionId() { return currentSessionId; },
  get connected() { return firebaseConnected; },
  createTestSession,
  sendTestPulse,
  leaveSession
};

document.addEventListener("DOMContentLoaded", initFirebasePhase1, { once: true });
