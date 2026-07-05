(() => {
  "use strict";
  const EVENT_KEY = "militopo_participant_app_event_v1";
  const EVENT_BACKUP_KEY = "militopo_participant_app_event_backup_v1";
  const RUN_STATE_KEY = "militopo_participant_app_run_state_v1";
  const SNAPSHOT_KEY = "militopo_participant_app_snapshot_v1";
  const PERMANENT_EVENT_KEY = "militopo_participant_permanent_event_v2";
  const PERMANENT_SNAPSHOT_KEY = "militopo_participant_permanent_snapshot_v2";
  let cameraFrameRestore = null;
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


  function validEventData(value){
    return !!(value&&typeof value==="object"&&Array.isArray(value.routes)&&value.routes.length&&value.points&&typeof value.points==="object");
  }
  function validRunLog(value){
    return !!(value&&typeof value==="object"&&value.participantId&&value.routeId);
  }
  function snapshotScore(value){
    try{
      const log=value&&value.log?value.log:value;
      const scans=Array.isArray(log?.scans)?log.scans.length:0;
      return scans+(log?.startTime?3:0)+(log?.finishTime?8:0)+(log?.resultPayload?5:0);
    }catch(_){return 0}
  }
  function writeStorageEverywhere(key,raw){
    try{localStorage.setItem(key,raw)}catch(_){ }
    try{sessionStorage.setItem(key,raw)}catch(_){ }
  }
  function readStorageEverywhere(key){
    const out=[];
    try{out.push(localStorage.getItem(key))}catch(_){ }
    try{out.push(sessionStorage.getItem(key))}catch(_){ }
    return out;
  }
  function collectAllParticipantSnapshots(){
    const found=[];
    const urlSnapshot=readUrlSnapshot();
    if(urlSnapshot)found.push(urlSnapshot);
    const pushValue=value=>{
      try{
        if(!value||typeof value!=="object")return;
        if(validEventData(value?.eventData)||validRunLog(value?.log)||validRunLog(value))found.push(value);
      }catch(_){ }
    };
    const scanStorage=storage=>{
      try{
        for(let i=0;i<storage.length;i++){
          const key=storage.key(i)||"";
          if(!/militopo/i.test(key))continue;
          const raw=storage.getItem(key); if(!raw)continue;
          try{pushValue(JSON.parse(raw));}catch(_){ }
        }
      }catch(_){ }
    };
    scanStorage(localStorage); scanStorage(sessionStorage);
    try{
      const raw=String(window.name||"");
      if(raw.startsWith("MILITOPO_PARTICIPANT_SNAPSHOT:"))pushValue(JSON.parse(raw.slice("MILITOPO_PARTICIPANT_SNAPSHOT:".length)));
      if(raw.startsWith("MILITOPO_RUN_BACKUP:"))pushValue(JSON.parse(raw.slice("MILITOPO_RUN_BACKUP:".length)));
    }catch(_){ }
    return found;
  }

  function decodeB64UrlJson(value){
    try{
      const b64=String(value||"").replace(/-/g,"+").replace(/_/g,"/");const pad=b64.length%4?"=".repeat(4-(b64.length%4)):"";
      const bin=atob(b64+pad),bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
      return JSON.parse(new TextDecoder("utf-8").decode(bytes));
    }catch(error){return null;}
  }
  function encodeB64UrlJson(value){
    try{
      const json=JSON.stringify(value||{});
      const bytes=new TextEncoder().encode(json);
      let bin=""; for(let i=0;i<bytes.length;i++)bin+=String.fromCharCode(bytes[i]);
      return btoa(bin).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
    }catch(_){return "";}
  }
  function readUrlSnapshot(){
    try{
      const hash=String(location.hash||"");
      const m=hash.match(/(?:^#|[&#])mpstate=([^&]+)/);
      if(!m)return null;
      const value=decodeB64UrlJson(decodeURIComponent(m[1]));
      if(value&&typeof value==="object"&&(validEventData(value.eventData)||validRunLog(value.log)))return value;
    }catch(_){ }
    return null;
  }
  function readUrlLog(){
    try{
      const hash=String(location.hash||"");
      const m=hash.match(/(?:^#|[&#])mplog=([^&]+)/);
      if(!m)return null;
      const value=decodeB64UrlJson(decodeURIComponent(m[1]));
      if(validRunLog(value))return value;
    }catch(_){ }
    return null;
  }
  function writeUrlSnapshot(snapshot){
    try{
      const log=snapshot&&snapshot.log;
      if(!validRunLog(log))return false;
      const enc=encodeB64UrlJson(log);
      if(!enc)return false;
      const url=new URL(location.href);
      url.searchParams.set("modo","participante");
      url.hash="mplog="+encodeURIComponent(enc);
      const next=url.pathname+url.search+url.hash;
      if(location.pathname+location.search+location.hash!==next)history.replaceState(history.state||{},document.title,next);
      return true;
    }catch(_){return false;}
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
  function saveSnapshot(eventData,log){
    try{
      if(!validEventData(eventData))return false;
      const snapshot={savedAt:new Date().toISOString(),eventData};
      if(log&&typeof log==="object")snapshot.log=log;
      const raw=JSON.stringify(snapshot);
      writeStorageEverywhere(SNAPSHOT_KEY,raw);
      writeStorageEverywhere(EVENT_KEY,raw);
      writeStorageEverywhere(EVENT_BACKUP_KEY,raw);
      writeStorageEverywhere(PERMANENT_EVENT_KEY,JSON.stringify({savedAt:snapshot.savedAt,eventData}));
      writeStorageEverywhere(PERMANENT_SNAPSHOT_KEY,raw);
      writeStorageEverywhere("militopo_participante_recorrido_activo_v1",raw);
      writeStorageEverywhere("militopo_participante_recorrido_rescate_v1",raw);
      try{window.name="MILITOPO_PARTICIPANT_SNAPSHOT:"+raw}catch(_){ }
      writeUrlSnapshot(snapshot);
      return true;
    }catch(_){return false}
  }
  function saveEventData(data){
    if(!data?.routes||!data?.points)return false;
    currentEventData=data;
    return saveSnapshot(data,readSavedRunState());
  }
  function readSavedEventData(){
    const candidates=[];
    [SNAPSHOT_KEY,EVENT_KEY,EVENT_BACKUP_KEY,PERMANENT_EVENT_KEY,PERMANENT_SNAPSHOT_KEY,"militopo_participante_recorrido_activo_v1","militopo_participante_recorrido_rescate_v1"].forEach(key=>candidates.push(...readStorageEverywhere(key)));
    try{
      const raw=String(window.name||"");
      if(raw.startsWith("MILITOPO_PARTICIPANT_SNAPSHOT:"))candidates.push(raw.slice("MILITOPO_PARTICIPANT_SNAPSHOT:".length));
    }catch(_){ }
    candidates.push(...collectAllParticipantSnapshots().map(value=>{try{return JSON.stringify(value)}catch(_){return null}}));
    const valid=[];
    for(const raw of candidates){
      try{const value=JSON.parse(raw||"null");const eventData=value?.eventData||value;if(validEventData(eventData))valid.push({eventData,value})}catch(_){ }
    }
    if(!valid.length)return null;
    valid.sort((a,b)=>snapshotScore(b.value)-snapshotScore(a.value)||String(b.value?.savedAt||"").localeCompare(String(a.value?.savedAt||"")));
    return valid[0].eventData;
  }
  function readSavedRunState(){
    const candidates=[];
    const urlLog=readUrlLog();
    if(urlLog)candidates.push(JSON.stringify(urlLog));
    [RUN_STATE_KEY,SNAPSHOT_KEY,EVENT_KEY,EVENT_BACKUP_KEY,PERMANENT_SNAPSHOT_KEY,"militopo_participante_recorrido_activo_v1","militopo_participante_recorrido_rescate_v1"].forEach(key=>candidates.push(...readStorageEverywhere(key)));
    try{
      const raw=String(window.name||"");
      if(raw.startsWith("MILITOPO_PARTICIPANT_SNAPSHOT:"))candidates.push(raw.slice("MILITOPO_PARTICIPANT_SNAPSHOT:".length));
    }catch(_){ }
    candidates.push(...collectAllParticipantSnapshots().map(value=>{try{return JSON.stringify(value)}catch(_){return null}}));
    const valid=[];
    for(const raw of candidates){
      try{
        const value=JSON.parse(raw||"null");
        const log=value?.log||value;
        if(validRunLog(log))valid.push(log);
      }catch(_){ }
    }
    if(!valid.length)return null;
    valid.sort((a,b)=>snapshotScore(b)-snapshotScore(a)||String(b.lastSavedAt||"").localeCompare(String(a.lastSavedAt||"")));
    return valid[0];
  }
  function eventFromUrl(){
    const params=new URLSearchParams(location.search||"");const packed=params.get("c")||params.get("pdata")||params.get("data")||"";
    const data=expandCompact(decodeB64UrlJson(packed));
    if(data){
      try{
        const keep=new URL(location.href);
        keep.searchParams.set("modo","participante");
        if(packed&&!keep.searchParams.get("c"))keep.searchParams.set("c",packed);
        history.replaceState(history.state||{},document.title,keep.pathname+keep.search+keep.hash);
      }catch(_){ }
      saveEventData(data);
    }
    return data;
  }
  function safeJsonForScript(data){return JSON.stringify(data||emptyEventData()).replace(/<\/script/gi,"<\\/script").replace(/<!--/g,"<\\!--");}
  const BOOT_KEY = "militopo_participant_boot_payload_v3";
  function saveBootPayload(eventData, log){
    try{
      const payload={savedAt:new Date().toISOString(),eventData:eventData||emptyEventData(),log:log||null};
      const raw=JSON.stringify(payload);
      writeStorageEverywhere(BOOT_KEY,raw);
      writeStorageEverywhere("militopo_participant_boot_payload_latest",raw);
      return true;
    }catch(_){return false;}
  }
  async function loadRunner(){
    try{
      currentEventData=eventFromUrl()||readSavedEventData()||emptyEventData();
      const savedRun=readSavedRunState();
      saveBootPayload(currentEventData,savedRun);
      frame.removeAttribute("scrolling");
      frame.style.overflow="hidden";
      frame.style.touchAction="auto";
      frame.style.height=Math.max(window.innerHeight||0,720)+"px";
      frame.style.minHeight=Math.max(window.innerHeight||0,720)+"px";
      frame.removeAttribute("srcdoc");
      const url="runner.html?app=1&v=progreso-real-20260705#boot";
      frame.addEventListener("load",()=>loading?.classList.add("is-hidden"),{once:true});
      frame.src=url;
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
    const prefixes=["militopo_runner_","militopo_participant_app_run_state_v1","militopo_participant_gps_enabled_v1:","militopo_participant_gps_lock_v1:","militopo_live_v2_last_sync_","militopo_participant_app_","militopo_participant_boot_payload_","militopo_participant_web_event_v1","militopo_jsqr_cache_v1"];
    const exact=new Set([EVENT_KEY,EVENT_BACKUP_KEY,RUN_STATE_KEY,SNAPSHOT_KEY,"militopo_live_v2_participant_context","militopo_participant_web_event_v1","militopo_jsqr_cache_v1"]);
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


  function openCameraFrame(){
    if(!frame)return;
    try{
      if(!cameraFrameRestore){
        cameraFrameRestore={
          cssText:frame.style.cssText||"",
          htmlOverflow:document.documentElement.style.overflow||"",
          bodyOverflow:document.body.style.overflow||"",
          scrollY:window.scrollY||document.documentElement.scrollTop||0
        };
      }
      document.body.classList.add("camera-active");
      document.documentElement.style.overflow="hidden";
      document.body.style.overflow="hidden";
      frame.style.position="fixed";
      frame.style.inset="0";
      frame.style.left="0";
      frame.style.top="0";
      frame.style.width="100vw";
      frame.style.height="100dvh";
      frame.style.minHeight="100dvh";
      frame.style.maxHeight="100dvh";
      frame.style.zIndex="999999";
      frame.style.background="#10190b";
      frame.style.border="0";
      frame.style.overflow="hidden";
      frame.style.touchAction="none";
    }catch(_){document.body.classList.add("camera-active");}
  }
  function closeCameraFrame(){
    try{
      document.body.classList.remove("camera-active");
      document.documentElement.style.overflow=cameraFrameRestore?.htmlOverflow||"";
      document.body.style.overflow=cameraFrameRestore?.bodyOverflow||"";
      if(frame){
        frame.style.cssText=cameraFrameRestore?.cssText||frame.style.cssText;
        frame.style.overflow="hidden";
        frame.style.touchAction="auto";
      }
      const y=Number(cameraFrameRestore?.scrollY||0);
      cameraFrameRestore=null;
      setTimeout(()=>{try{window.scrollTo({top:y,behavior:"auto"})}catch(_){ }},0);
    }catch(_){document.body.classList.remove("camera-active");cameraFrameRestore=null;}
  }

  window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();deferredInstallPrompt=event;});
  window.addEventListener("appinstalled",()=>{deferredInstallPrompt=null;toast("MILITOPO Participante instalada");closeInstallGuide();});
  window.addEventListener("message",event=>{
    const msg=event.data;if(!msg||msg.source!=="MILITOPO_PARTICIPANT_APP")return;
    if(msg.action==="EVENT_LOADED"&&msg.payload?.eventData){saveEventData(msg.payload.eventData);toast("Recorrido guardado en MILITOPO Participante");}
    if(msg.action==="RUN_STATE"&&msg.payload?.log){
      try{writeStorageEverywhere(RUN_STATE_KEY,JSON.stringify(msg.payload.log))}catch(_){ }
      if(msg.payload?.eventData){saveSnapshot(msg.payload.eventData,msg.payload.log);saveBootPayload(msg.payload.eventData,msg.payload.log);}
      else{const saved=readSavedEventData(); if(saved){saveSnapshot(saved,msg.payload.log);saveBootPayload(saved,msg.payload.log);}}
    }
    if(msg.action==="PERSIST_SNAPSHOT"&&msg.payload?.eventData){
      const log=msg.payload.log||readSavedRunState();
      saveSnapshot(msg.payload.eventData,log);
      saveBootPayload(msg.payload.eventData,log);
    }
    if(msg.action==="SET_URL_STATE"){
      try{
        const url=new URL(location.href);
        url.searchParams.set("modo","participante");
        if(msg.payload?.packed)url.searchParams.set("c",String(msg.payload.packed));
        if(msg.payload?.log&&validRunLog(msg.payload.log)){
          const enc=encodeB64UrlJson(msg.payload.log);
          if(enc)url.hash="mplog="+encodeURIComponent(enc);
        }
        history.replaceState(history.state||{},document.title,url.pathname+url.search+url.hash);
      }catch(_){ }
    }
    if(msg.action==="RESET_REQUEST")showResetDialog(msg.payload||{});
    if(msg.action==="CAMERA_OPEN")openCameraFrame();
    if(msg.action==="CAMERA_CLOSE")closeCameraFrame();
    if(msg.action==="DIALOG_OPEN")document.body.classList.add("participant-dialog-active");
    if(msg.action==="DIALOG_CLOSE")document.body.classList.remove("participant-dialog-active");
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
