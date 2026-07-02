(() => {
  "use strict";
  const EVENT_KEY = "militopo_participant_app_event_v1";
  const MODE_QUERY = "modo=participante";
  const frame = document.getElementById("participantFrame");
  const loading = document.getElementById("shellLoading");
  let currentEventData = null;
  let resetPayload = null;
  let deferredInstallPrompt = null;
  let runnerTemplate = "";

  const emptyEventData = () => ({
    version:"participant_independent_empty_v1",participantMode:true,webParticipantId:"",eventId:"",eventName:"MILITOPO PARTICIPANTE",
    points:{},routes:[],metrics:[],participantNames:{},participantLogs:{},skippedRoutes:{},importedResults:[],iofDescriptions:{}
  });
  const toast = text => {
    const el=document.getElementById("shellToast"); if(!el)return;
    el.textContent=String(text||"");el.classList.add("is-open");clearTimeout(el._timer);el._timer=setTimeout(()=>el.classList.remove("is-open"),2800);
  };
  const openDialog = id => { const el=document.getElementById(id); if(el){el.classList.add("is-open");el.setAttribute("aria-hidden","false");} };
  const closeDialog = el => { if(el){el.classList.remove("is-open");el.setAttribute("aria-hidden","true");} };

  function decodeB64UrlJson(value){
    try{
      const b64=String(value||"").replace(/-/g,"+").replace(/_/g,"/");const pad=b64.length%4?"=".repeat(4-(b64.length%4)):"";
      const bin=atob(b64+pad),bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
      return JSON.parse(new TextDecoder("utf-8").decode(bytes));
    }catch(error){return null;}
  }
  function expandCompact(compact){
    if(!compact||typeof compact!=="object")return null;
    if(compact.routes&&compact.points)return compact;
    if(compact.v===2){
      const points={};(compact.pts||[]).forEach(row=>{const id=String(row[0]||"");if(!id)return;const up=id.toUpperCase();points[id]={id,type:up==="START"?"SALIDA":up==="FINISH"?"LLEGADA":"BALIZA",lat:Number.isFinite(Number(row[1]))?Number(row[1]):null,lon:Number.isFinite(Number(row[2]))?Number(row[2]):null,elevation:null,utm:"",desc:""};});
      const pid=String(compact.p||"P01"),routeId=String(compact.r?.[0]||"R01"),routePoints=(compact.r?.[1]||[]).filter(Boolean);
      return {version:"participant_independent_compact_v2",participantMode:true,webParticipantId:pid,eventId:String(compact.e||""),eventName:String(compact.n||"ENTRENAMIENTO ORIENTACIÓN"),createdAt:new Date(Number(compact.t)||Date.now()).toISOString(),config:{participantCount:1,activeParticipantCount:1,controlCount:routePoints.length,controlsPerRoute:routePoints.length,maxControlReuse:1},points,routes:[{participantId:pid,routeId,points:routePoints}],metrics:[{participantId:pid,routeId,distanceKm:compact.m?.[0],climbUp:compact.m?.[1],climbDown:compact.m?.[2],netClimb:compact.m?.[3],difficulty:compact.m?.[4]}],participantNames:{[pid]:String(compact.pn||"")},participantLogs:{},skippedRoutes:{},importedResults:[],iofDescriptions:{}};
    }
    if(compact.v===1){
      const points={};(compact.pts||[]).forEach(row=>{const id=String(row[0]||"");if(!id)return;points[id]={id,type:String(row[1]||"BALIZA"),lat:Number.isFinite(Number(row[2]))?Number(row[2]):null,lon:Number.isFinite(Number(row[3]))?Number(row[3]):null,elevation:Number.isFinite(Number(row[4]))?Number(row[4]):null,utm:String(row[5]||""),desc:String(row[6]||"")};});
      const pid=String(compact.p||"P01"),routeId=String(compact.r?.d||"R01"),routePoints=(compact.r?.q||[]).filter(Boolean);
      return {version:"participant_independent_compact_v1",participantMode:true,webParticipantId:pid,eventId:String(compact.e||""),eventName:String(compact.n||"ENTRENAMIENTO ORIENTACIÓN"),points,routes:[{participantId:pid,routeId,points:routePoints}],metrics:[{participantId:pid,routeId,distanceKm:compact.m?.km,climbUp:compact.m?.pp,climbDown:compact.m?.pn,netClimb:compact.m?.dg,difficulty:compact.m?.df}],participantNames:{[pid]:String(compact.pn||"")},participantLogs:{},skippedRoutes:{},importedResults:[],iofDescriptions:{}};
    }
    return null;
  }
  function saveEventData(data){
    if(!data?.routes||!data?.points)return false;
    currentEventData=data;
    try{localStorage.setItem(EVENT_KEY,JSON.stringify({savedAt:new Date().toISOString(),eventData:data}));return true}catch(_){return false}
  }
  function readSavedEventData(){
    try{const value=JSON.parse(localStorage.getItem(EVENT_KEY)||"null");return value?.eventData||null}catch(_){return null}
  }
  function eventFromUrl(){
    const params=new URLSearchParams(location.search||"");const packed=params.get("c")||params.get("pdata")||params.get("data")||"";
    const data=expandCompact(decodeB64UrlJson(packed));if(data)saveEventData(data);
    if(packed){
      const clean=new URL(location.href);clean.search="";clean.searchParams.set("modo","participante");
      const install=params.get("install");if(install)clean.searchParams.set("install",install);
      history.replaceState({},document.title,clean.pathname+clean.search);
    }
    return data;
  }
  function safeJsonForScript(data){return JSON.stringify(data||emptyEventData()).replace(/<\/script/gi,"<\\/script").replace(/<!--/g,"<\\!--");}
  async function loadRunner(){
    try{
      if(!runnerTemplate){const response=await fetch("runner.html",{cache:"no-cache"});if(!response.ok)throw new Error("runner.html");runnerTemplate=await response.text();}
      currentEventData=eventFromUrl()||readSavedEventData()||emptyEventData();
      frame.srcdoc=runnerTemplate.replace("__EVENT_DATA__",safeJsonForScript(currentEventData));
      frame.addEventListener("load",()=>loading?.classList.add("is-hidden"),{once:true});
    }catch(error){
      loading.innerHTML="<b>No se pudo abrir MILITOPO Participante.</b><span>Comprueba la conexión y vuelve a cargar.</span>";
      console.error(error);
    }
  }

  function safeFirebaseKey(value){return String(value||"MILITOPO").trim().replace(/[.#$\[\]\/]/g,"-").replace(/\s+/g,"-").replace(/-+/g,"-").slice(0,100)||"MILITOPO";}
  function removeMatchingStorage(storage,predicate){
    try{const keys=[];for(let i=0;i<storage.length;i++)keys.push(storage.key(i));keys.filter(Boolean).forEach(key=>{if(predicate(key))storage.removeItem(key);});}catch(_){ }
  }
  function cleanParticipantQueue(eventId,participantId){
    try{
      const key="militopo_live_v2_pending_events",queue=JSON.parse(localStorage.getItem(key)||"[]");if(!Array.isArray(queue))return;
      const eventKey=safeFirebaseKey(eventId),pid=String(participantId||"");
      const keep=queue.filter(item=>!(String(item?.eventKey||"")===eventKey&&String(item?.participantId||"")===pid));
      keep.length?localStorage.setItem(key,JSON.stringify(keep)):localStorage.removeItem(key);
    }catch(_){ }
  }
  async function clearParticipantDataAndCache(payload={},hard=false){
    if(!navigator.onLine){toast("Conéctate a internet antes de borrar la caché completa.");return false;}
    try{frame.srcdoc="<!doctype html><body style='margin:0;background:#10190b;color:#f5e6c8;font-family:monospace;display:grid;place-items:center;height:100vh'>Restableciendo…</body>";}catch(_){ }
    cleanParticipantQueue(payload.eventId,currentEventData?.webParticipantId||payload.participantId);
    const prefixes=["militopo_runner_","militopo_participant_gps_enabled_v1:","militopo_participant_gps_lock_v1:","militopo_live_v2_last_sync_","militopo_participant_app_","militopo_participant_web_event_v1","militopo_jsqr_cache_v1"];
    const exact=new Set([EVENT_KEY,"militopo_live_v2_participant_context","militopo_participant_web_event_v1","militopo_jsqr_cache_v1"]);
    const predicate=key=>exact.has(key)||prefixes.some(prefix=>String(key).startsWith(prefix));
    removeMatchingStorage(localStorage,predicate);removeMatchingStorage(sessionStorage,predicate);
    try{window.name=""}catch(_){ }
    if("caches" in window){const names=await caches.keys();await Promise.all(names.filter(name=>name.startsWith("militopo-participante-")).map(name=>caches.delete(name)));}
    if("indexedDB" in window&&indexedDB.databases){try{const dbs=await indexedDB.databases();for(const db of dbs){if(String(db.name||"").startsWith("militopo-participante-"))indexedDB.deleteDatabase(db.name);}}catch(_){ }}
    if("serviceWorker" in navigator){try{const regs=await navigator.serviceWorker.getRegistrations();await Promise.all(regs.filter(reg=>new URL(reg.scope).pathname.includes("/orientacion/participante/")).map(reg=>reg.unregister()));}catch(_){ }}
    location.replace("./?modo=participante&fresh="+Date.now());
    return true;
  }

  function showResetDialog(payload){
    resetPayload=payload||{};
    const summary=document.getElementById("resetSummary"),warning=document.getElementById("resetWarning");
    summary.innerHTML=`<b>${resetPayload.participantId||"Participante"}</b> · ${resetPayload.routeId||"Recorrido"}<br>Progreso: ${Number(resetPayload.completedControls||0)}/${Number(resetPayload.totalControls||0)} controles.`;
    const warnings=[];
    if(resetPayload.inProgress)warnings.push("La carrera todavía está en curso.");
    if(Number(resetPayload.pendingSync||0)>0)warnings.push(`Hay ${resetPayload.pendingSync} cambio${resetPayload.pendingSync===1?"":"s"} pendiente${resetPayload.pendingSync===1?"":"s"} de sincronizar.`);
    if(resetPayload.pendingResultSync)warnings.push("El resultado final todavía está pendiente de envío o confirmación.");
    warning.textContent=warnings.join(" ");
    document.getElementById("retrySyncBtn").hidden=Number(resetPayload.pendingSync||0)===0;
    document.getElementById("showResultBtn").hidden=!resetPayload.resultCode;
    openDialog("resetDialog");
  }

  function setupInstallGuide(){
    const params=new URLSearchParams(location.search||""),platform=String(params.get("install")||"").toLowerCase();if(!platform)return;
    const guide=document.getElementById("installGuide"),title=document.getElementById("installTitle"),text=document.getElementById("installText"),steps=document.getElementById("iosSteps"),button=document.getElementById("installNowBtn");
    const standalone=matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
    if(platform==="ios"||platform==="iphone"){
      document.getElementById("installIcon").textContent="🍎";title.textContent="Instalar en iPhone";text.textContent="Añade MILITOPO Participante a la pantalla de inicio desde Safari.";
      steps.innerHTML=["Abre esta página en Safari.","Pulsa Compartir.","Selecciona Añadir a pantalla de inicio.","Activa Abrir como app y pulsa Añadir."].map((value,index)=>`<div class="install-step"><b>${index+1}</b><span>${value}</span></div>`).join("");button.hidden=true;
    }else{
      document.getElementById("installIcon").textContent="🤖";title.textContent="Instalar en Android";text.textContent=standalone?"MILITOPO Participante ya está abierta como aplicación.":"Pulsa instalar y confirma el aviso de Chrome.";steps.innerHTML="";button.hidden=standalone;button.textContent="INSTALAR MILITOPO PARTICIPANTE";
    }
    guide.classList.add("is-open");
  }
  function closeInstallGuide(){
    document.getElementById("installGuide")?.classList.remove("is-open");
    const url=new URL(location.href);url.searchParams.delete("install");history.replaceState({},document.title,url.pathname+url.search);
  }

  window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();deferredInstallPrompt=event;});
  window.addEventListener("appinstalled",()=>{deferredInstallPrompt=null;toast("MILITOPO Participante instalada");closeInstallGuide();});
  window.addEventListener("message",event=>{
    const msg=event.data;if(!msg||msg.source!=="MILITOPO_PARTICIPANT_APP")return;
    if(msg.action==="EVENT_LOADED"&&msg.payload?.eventData){saveEventData(msg.payload.eventData);toast("Recorrido guardado en MILITOPO Participante");}
    if(msg.action==="RESET_REQUEST")showResetDialog(msg.payload||{});
    if(msg.action==="CAMERA_OPEN")document.body.classList.add("camera-active");
    if(msg.action==="CAMERA_CLOSE")document.body.classList.remove("camera-active");
  });
  document.addEventListener("click",async event=>{
    if(event.target.closest("[data-close-dialog]")){closeDialog(event.target.closest(".shell-dialog"));return;}
    if(event.target===document.getElementById("resetDialog")||event.target===document.getElementById("shellMenu")||event.target===document.getElementById("resultBackupDialog")){closeDialog(event.target);return;}
  });
  document.getElementById("shellMenuBtn")?.addEventListener("click",()=>openDialog("shellMenu"));
  document.getElementById("closeInstallGuide")?.addEventListener("click",closeInstallGuide);
  document.getElementById("continueBtn")?.addEventListener("click",closeInstallGuide);
  document.getElementById("installNowBtn")?.addEventListener("click",async()=>{
    if(deferredInstallPrompt){deferredInstallPrompt.prompt();try{await deferredInstallPrompt.userChoice}finally{deferredInstallPrompt=null}return;}
    toast("En Chrome abre el menú ⋮ y pulsa Instalar aplicación.");
  });
  document.getElementById("retrySyncBtn")?.addEventListener("click",async()=>{
    try{await window.MILITOPO_LIVE_PHASE2?.flushParticipantQueue?.();toast("Sincronización solicitada");}catch(_){toast("No se pudo sincronizar todavía")}
  });
  document.getElementById("showResultBtn")?.addEventListener("click",()=>{
    document.getElementById("backupResultText").value=String(resetPayload?.resultCode||"");closeDialog(document.getElementById("resetDialog"));openDialog("resultBackupDialog");
  });
  document.getElementById("copyBackupResultBtn")?.addEventListener("click",async()=>{const value=document.getElementById("backupResultText").value;try{await navigator.clipboard.writeText(value);toast("Código copiado")}catch(_){document.getElementById("backupResultText").select();document.execCommand("copy");toast("Código copiado")}});
  document.getElementById("confirmResetBtn")?.addEventListener("click",()=>clearParticipantDataAndCache(resetPayload));
  document.getElementById("hardResetBtn")?.addEventListener("click",()=>{closeDialog(document.getElementById("shellMenu"));showResetDialog({eventId:currentEventData?.eventId||"",participantId:currentEventData?.webParticipantId||"",routeId:currentEventData?.routes?.[0]?.routeId||"",completedControls:0,totalControls:currentEventData?.routes?.[0]?.points?.length||0});});

  try{sessionStorage.setItem("militopo_participant_app_scope_v1","1")}catch(_){ }
  setupInstallGuide();
  loadRunner();

  if("serviceWorker" in navigator&&/^https?:$/.test(location.protocol)){
    window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js",{scope:"./",updateViaCache:"none"}).catch(()=>{}));
  }
})();
