/* =========================================================
   MILITOPO · RESULTADOS CLASIFICACION V18 REAL
   Forzado final: dificultad en tabla/Excel y estados ES.
   ========================================================= */
(function(){

    const discardedIdsOf=r=>[...new Set((r?.scans||[]).filter(s=>String(s?.st||s?.status||"").toLowerCase()==="skipped").map(s=>String(s?.id||s?.controlId||s?.expectedControlId||"").trim()).filter(Boolean))];
    const pendingIdsOf=r=>{const d=new Set(discardedIdsOf(r));return [...new Set((Array.isArray(r?.missingControls)?r.missingControls:[]).map(x=>String(x||"").trim()).filter(Boolean).filter(x=>!d.has(x)))];};
    if(window.__MILITOPO_RESULTADOS_V18_REAL__)return;
    window.__MILITOPO_RESULTADOS_V18_REAL__=true;

    function esc(v){
        try{return typeof escapeHtml==="function"?escapeHtml(v):String(v??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[ch]));}
        catch(e){return String(v??"");}
    }

    window.formatDateTimeSpain=function(value){
        if(!value)return "--";
        const d=new Date(value);
        if(!Number.isFinite(d.getTime()))return "--";
        try{
            return new Intl.DateTimeFormat("es-ES",{
                timeZone:"Europe/Madrid",
                day:"2-digit",
                month:"2-digit",
                year:"numeric",
                hour:"2-digit",
                minute:"2-digit",
                second:"2-digit",
                hour12:false
            }).format(d).replace(",","");
        }catch(e){return d.toLocaleString("es-ES");}
    };

    window.resultStatusEs=function(status){
        const s=String(status||"").trim().toLowerCase();
        const map={
            correct:"Correcto",
            correcta:"Correcto",
            ok:"Correcto",
            done:"Correcto",
            completed:"Completado",
            pending:"Pendiente",
            pendiente:"Pendiente",
            duplicate:"Duplicado",
            duplicated:"Duplicado",
            skipped:"Descartado",
            skip:"Descartado",
            discarded:"Descartado",
            out_of_order:"Fuera de orden",
            wrong_order:"Fuera de orden",
            wrong:"Incorrecto",
            incorrect:"Incorrecto",
            error:"Error",
            missed:"Pendiente",
            missing:"Pendiente",
            manual:"Manual",
            partial:"Parcial"
        };
        return map[s]||String(status||"--");
    };

    window.routeMetricForResult=function(resultOrRouteId){
        const routeId=typeof resultOrRouteId==="string"?resultOrRouteId:String(resultOrRouteId?.routeId||"");
        const participantId=typeof resultOrRouteId==="object"?String(resultOrRouteId?.participantId||""):"";
        const routes=state.routes||[];
        let idx=routes.findIndex(r=>String(r.routeId||"")===routeId);
        if(idx<0&&participantId)idx=routes.findIndex(r=>String(r.participantId||"")===participantId);
        return idx>=0?((state.metrics||[])[idx]||{}):{};
    };
    window.routeDifficultyForResult=function(resultOrRouteId){const metric=routeMetricForResult(resultOrRouteId);const diff=String(metric?.difficulty||"").trim();return diff||"--";};

    window.renderClassificationTable=function(){
        const box=document.getElementById("classificationTable");if(!box)return;
        const rows=typeof sortedImportedResults==="function"?sortedImportedResults():[...(state.importedResults||[])];
        if(!rows.length){box.innerHTML=`<div class="status warn">Todavía no hay resultados importados.</div>`;return;}
        let rank=0;
        box.innerHTML=`<div class="classification-scroll-v18" style="width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:6px;"><table class="results-table classification-table-v18" style="width:100%;min-width:1260px;table-layout:fixed;border-collapse:separate;border-spacing:0;"><colgroup><col style="width:7%"><col style="width:18%"><col style="width:11%"><col style="width:10%"><col style="width:11%"><col style="width:11%"><col style="width:11%"><col style="width:11%"><col style="width:9%"><col style="width:9%"></colgroup><thead><tr><th>Puesto</th><th>Nombre</th><th>Tiempo</th><th>Recorrido</th><th>Dificultad</th><th>Distancia</th><th>Desnivel +</th><th>Controles<br>completados</th><th>Controles<br>pendientes</th><th>Controles<br>descartados</th></tr></thead><tbody>${rows.map(r=>{rank++;const ms=typeof resultMs==="function"?resultMs(r):null,time=ms!==null&&typeof formatDuration==="function"?formatDuration(ms):"--",metric=routeMetricForResult(r);const controls=typeof resultCompletedControlsCount==="function"?resultCompletedControlsCount(r):(r.scans||[]).filter(s=>(s.st||s.status)==="correct").length;const missingCount=pendingIdsOf(r).length;const cls=typeof classificationRankClass==="function"?classificationRankClass(rank,r.completed):"";const name=(typeof resultParticipantName==="function"?resultParticipantName(r):"")||r.participantId||"--";return `<tr class="${cls}"><td style="text-align:center">${rank}</td><td>${esc(name)}</td><td style="text-align:center">${esc(time)}</td><td style="text-align:center">${esc(r.routeId||"--")}</td><td style="text-align:center;font-weight:900">${esc(String(metric?.difficulty||"--"))}</td><td style="text-align:center">${esc(metric?.distanceKm!=null&&Number.isFinite(Number(metric.distanceKm))?`${Number(metric.distanceKm).toFixed(2)} km`:"--")}</td><td style="text-align:center">${esc(metric?.positiveM!=null?`${metric.positiveM} m`:"--")}</td><td style="text-align:center">${controls}</td><td style="text-align:center">${missingCount}</td><td style="text-align:center">${discardedIdsOf(r).length}</td></tr>`;}).join("")}</tbody></table></div>`;
    };

    window.renderSelectedResultDetail=function(){
        const sel=document.getElementById("resultDetailSelect");
        const box=document.getElementById("selectedResultDetail");
        if(!sel||!box)return;
        const pid=sel.value;
        const r=activeImportedResults().find(x=>x.participantId===pid);
        if(!r){
            box.className="status warn";
            box.innerHTML="Selecciona un resultado importado.";
            return;
        }
        const ms=typeof resultMs==="function"?resultMs(r):null;
        const time=ms!==null&&typeof formatDuration==="function"?formatDuration(ms):"--";
        const name=typeof resultParticipantName==="function"?resultParticipantName(r):"";
        const scans=(r.scans||[]).map((s,i)=>{
            const id=s.id||s.controlId||"--";
            const when=s.t||s.timestamp||"";
            const st=s.st||s.status||"--";
            return `<div style="padding:7px 0;border-top:1px solid rgba(255,255,255,.14);line-height:1.35;"><b>${i+1}. ${esc(id)}</b><br><span>Hora: ${esc(formatDateTimeSpain(when))}</span><br><span>Estado: ${esc(resultStatusEs(st))}</span></div>`;
        }).join("");
        box.className=r.completed?"status ok":"status warn";
        box.innerHTML=`<div style="display:grid;gap:8px;line-height:1.35;white-space:normal;overflow-wrap:anywhere;">
            <div><b>Participante:</b> ${esc(r.participantId||"--")}</div>
            <div><b>Nombre:</b> ${esc(name||"--")}</div>
            <div><b>Recorrido:</b> ${esc(r.routeId||"--")}</div>
            <div><b>Dificultad:</b> ${esc(routeDifficultyForResult(r))}</div>
            <div><b>Estado:</b> ${r.completed?"✅ Completo":"⚠️ Con avisos"}</div>
            <div><b>Salida:</b> ${esc(formatDateTimeSpain(r.startTime))}</div>
            <div><b>Llegada:</b> ${esc(formatDateTimeSpain(r.finishTime))}</div>
            <div><b>Tiempo:</b> ${esc(time)}</div>
            <div><b>✅ Controles completados:</b> ${typeof resultCompletedControlsCount==="function"?resultCompletedControlsCount(r):(r.scans||[]).filter(s=>(s.st||s.status)==="correct").length}</div>
            <div><b>⏭️ Controles descartados:</b> ${esc(discardedIdsOf(r).join(", ")||"Ninguno")}</div>
            <div><b>⏳ Controles pendientes:</b> ${esc(pendingIdsOf(r).join(", ")||"Ninguno")}</div>
            <div style="margin-top:8px;"><b>Pasos registrados</b></div>
            <div>${scans||"--"}</div>
        </div>`;
    };

    window.classificationRowsForExport=function(){
        const rows=[["Puesto","Nombre","Tiempo","Recorrido","Dificultad","Distancia","Desnivel +","Controles\ncompletados","Controles\npendientes","Controles\ndescartados"]];let rank=0;const data=typeof sortedImportedResults==="function"?sortedImportedResults():[...(state.importedResults||[])];
        data.forEach(r=>{rank++;const ms=typeof resultMs==="function"?resultMs(r):null,metric=routeMetricForResult(r);const controls=typeof resultCompletedControlsCount==="function"?resultCompletedControlsCount(r):(r.scans||[]).filter(s=>(s.st||s.status)==="correct").length;rows.push([rank,(typeof resultParticipantName==="function"?resultParticipantName(r):"")||r.participantId||"",ms!==null&&typeof formatDuration==="function"?formatDuration(ms):"--",r.routeId||"--",String(metric?.difficulty||"--"),metric?.distanceKm!=null&&Number.isFinite(Number(metric.distanceKm))?`${Number(metric.distanceKm).toFixed(2)} km`:"--",metric?.positiveM!=null?`${metric.positiveM} m`:"--",controls,pendingIdsOf(r).length,discardedIdsOf(r).length]);});return rows;
    };

    window.downloadClassificationExcel=async function(){
        const rows=classificationRowsForExport();
        if(rows.length<=1)return toast("No hay clasificación para exportar");
        if(typeof JSZip==="undefined")return toast("No se pudo crear XLSX: JSZip no está cargado");
        const escXml=v=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
        const colName=n=>{let s="";while(n>0){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=Math.floor((n-1)/26);}return s;};
        const rankedResults=typeof sortedImportedResults==="function"?sortedImportedResults():[...(state.importedResults||[])];
        const sheetRows=rows.map((row,ri)=>{
            const r=ri+1;
            const completed=ri===0?true:!!rankedResults[ri-1]?.completed;
            const styleId=ri===0?1:(typeof classificationXlsxStyle==="function"?classificationXlsxStyle(row[0],completed):0);
            const maxLen=Math.max(...row.map(cell=>String(cell??"").length));
            const rowHeight=ri===0?52:Math.min(125,Math.max(40,30+Math.ceil(maxLen/24)*12));
            const cells=row.map((cell,ci)=>`<c r="${colName(ci+1)+r}" t="inlineStr" s="${styleId}"><is><t>${escXml(cell)}</t></is></c>`).join("");
            return `<row r="${r}" ht="${rowHeight}" customHeight="1">${cells}</row>`;
        }).join("");
        const widths=[8,24,14,12,14,14,14,22,22,22].map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join("");
        const sheetXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
 <sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
 <dimension ref="A1:J${rows.length}"/>
 <cols>${widths}</cols>
 <sheetData>${sheetRows}</sheetData>
 <pageMargins left="0.25" right="0.25" top="0.45" bottom="0.45" header="0.15" footer="0.15"/>
 <pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
        const workbookXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Clasificacion" sheetId="1" r:id="rId1"/></sheets></workbook>`;
        const relsXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
        const workbookRelsXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
        const fills=["FFFFFF","D9EAD3","FFF2CC","E7E6E6","FCE5CD","D9EAD3","D0E0E3","D9D2E9","EAD1DC","FFF2CC","CFE2F3","F4CCCC","EEEEEE"].map(c=>`<fill><patternFill patternType="solid"><fgColor rgb="FF${c}"/><bgColor indexed="64"/></patternFill></fill>`).join("");
        const xfs=[
            '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="top" wrapText="1"/></xf>',
            '<xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="top" wrapText="1"/></xf>',
            '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="top" wrapText="1"/></xf>',
            '<xf numFmtId="0" fontId="1" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="top" wrapText="1"/></xf>',
            '<xf numFmtId="0" fontId="1" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="top" wrapText="1"/></xf>',
            '<xf numFmtId="0" fontId="0" fillId="5" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="top" wrapText="1"/></xf>',
            '<xf numFmtId="0" fontId="0" fillId="6" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="top" wrapText="1"/></xf>',
            '<xf numFmtId="0" fontId="0" fillId="7" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="top" wrapText="1"/></xf>',
            '<xf numFmtId="0" fontId="0" fillId="8" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="top" wrapText="1"/></xf>',
            '<xf numFmtId="0" fontId="0" fillId="9" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="top" wrapText="1"/></xf>',
            '<xf numFmtId="0" fontId="0" fillId="10" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="top" wrapText="1"/></xf>',
            '<xf numFmtId="0" fontId="0" fillId="11" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="top" wrapText="1"/></xf>',
            '<xf numFmtId="0" fontId="0" fillId="12" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="top" wrapText="1"/></xf>'
        ].join("");
        const stylesXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="13"><fill><patternFill patternType="none"/></fill>${fills}</fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="13">${xfs}</cellXfs></styleSheet>`;
        const contentTypesXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
        const zip=new JSZip();
        zip.file("[Content_Types].xml",contentTypesXml);
        zip.folder("_rels").file(".rels",relsXml);
        zip.folder("xl").file("workbook.xml",workbookXml);
        zip.folder("xl").folder("_rels").file("workbook.xml.rels",workbookRelsXml);
        zip.folder("xl").folder("worksheets").file("sheet1.xml",sheetXml);
        zip.folder("xl").file("styles.xml",stylesXml);
        const blob=await zip.generateAsync({type:"blob",mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
        const filename=`clasificacion_${state.eventId||"militopo"}.xlsx`;
        const url=URL.createObjectURL(blob);
        const a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(url);a.remove()},1500);
    };

    window.addEventListener("load",()=>{
        setTimeout(()=>{
            if(typeof currentAppStep!=="undefined"&&currentAppStep===6&&typeof renderResultsControl==="function")renderResultsControl();
        },500);
    });
})();



// MILITOPO ORIENTACIÓN · CONTROL DE ACCESO ORGANIZADOR/PARTICIPANTE START
(function(){
    const ORGANIZER_PASSWORD = "Militopo2026";
    const ACCESS_MODE_KEY = "militopo_orientacion_access_mode_v1";
    const ORGANIZER_UNLOCK_KEY = "militopo_orientacion_organizer_unlocked_session_v1";

    function appRoot(){
        return document.querySelector(".app");
    }

    function setAppVisible(visible){
        const root = appRoot();
        if(root) root.style.display = visible ? "" : "none";
    }

    function gateEl(){
        return document.getElementById("militopoAccessGate");
    }

    function participantShell(){
        return document.getElementById("militopoParticipantOnlyShell");
    }

    function showGate(){
        setAppVisible(false);
        const shell = participantShell();
        if(shell) shell.style.display = "none";
        const gate = gateEl();
        if(gate) gate.style.display = "flex";
        const panel = document.getElementById("militopoPasswordPanel");
        const choices = document.getElementById("militopoAccessChoices");
        const error = document.getElementById("militopoPasswordError");
        if(panel) panel.style.display = "none";
        if(choices) choices.style.display = "";
        if(error) error.textContent = "";
    }

    function maybeShowOrientationGuideAfterUnlock(){
        try{
            const hideGuide = localStorage.getItem("militopo_orientacion_guide_hidden") === "1";
            if(!hideGuide && typeof window.showOrientationGuide === "function"){
                setTimeout(()=>window.showOrientationGuide(), 350);
            }
        }catch(e){}
    }

    function showOrganizer(){
        const gate = gateEl();
        const shell = participantShell();
        if(gate) gate.style.display = "none";
        if(shell) shell.style.display = "none";
        setAppVisible(true);
        try{
            localStorage.setItem(ACCESS_MODE_KEY, "organizador");
            sessionStorage.setItem(ORGANIZER_UNLOCK_KEY, "1");
        }catch(e){}
        if(typeof goStep === "function"){
            try{ goStep(currentAppStep || 1, {silent:true, noScroll:true}); }catch(e){}
        }
        maybeShowOrientationGuideAfterUnlock();
    }

    function showPasswordPanel(){
        const panel = document.getElementById("militopoPasswordPanel");
        const choices = document.getElementById("militopoAccessChoices");
        const input = document.getElementById("militopoOrganizerPassword");
        const error = document.getElementById("militopoPasswordError");
        if(choices) choices.style.display = "none";
        if(panel) panel.style.display = "";
        if(error) error.textContent = "";
        if(input){
            input.value = "";
            setTimeout(()=>input.focus(), 80);
        }
    }

    function checkOrganizerPassword(){
        const input = document.getElementById("militopoOrganizerPassword");
        const error = document.getElementById("militopoPasswordError");
        const value = input ? input.value : "";
        if(value === ORGANIZER_PASSWORD){
            showOrganizer();
        }else{
            if(error) error.textContent = "Contraseña incorrecta.";
            if(input){
                input.value = "";
                input.focus();
            }
        }
    }

    function showParticipant(){
        const gate = gateEl();
        const shell = participantShell();
        const content = document.getElementById("militopoParticipantOnlyContent");
        if(gate) gate.style.display = "none";
        setAppVisible(false);
        if(shell) shell.style.display = "flex";
        try{ localStorage.setItem(ACCESS_MODE_KEY, "participante"); }catch(e){}

        if(!content) return;
        content.innerHTML = "";

        try{
            let participantPack = typeof readSavedParticipantWebData === "function" ? readSavedParticipantWebData() : null;
            let eventData = participantPack && participantPack.eventData ? participantPack.eventData : null;

            if(!eventData){
                const hasRoutes = Array.isArray(state.routes) && state.routes.length > 0;
                const hasPoints = state.points && Object.keys(state.points).length > 0;
                if(hasRoutes && hasPoints && typeof buildEventData === "function"){
                    eventData = buildEventData();
                }
            }

            if(!eventData || typeof participantOfflineAppHtml !== "function"){
                content.innerHTML = `<div class="participant-empty-card">
                    <h2>Vista participante</h2>
                    <p>Aún no hay un ejercicio cargado en este móvil.</p>
                    <p>Escanea el QR de participante que genera el organizador. Ese QR carga automáticamente tu recorrido en esta misma app.</p>
                </div>`;
                return;
            }

            const iframe = document.createElement("iframe");
            iframe.className = "participant-integrated-frame";
            iframe.setAttribute("title", "MILITOPO Participante");

            // Carga directa del recorrido en el iframe participante.
            // El QR abre la web y la app principal ya tiene eventData, pero algunos móviles
            // no ejecutan a tiempo la autocarga interna del iframe srcdoc.
            // Por eso, además de pasar EVENT_DATA, forzamos loadParticipant() desde fuera
            // cuando el iframe termina de cargar.
            const autoPid = String((participantPack && participantPack.pid) || eventData.webParticipantId || (eventData.routes && eventData.routes[0] && eventData.routes[0].participantId) || "");
            const autoRouteId = String((eventData.routes && eventData.routes[0] && eventData.routes[0].routeId) || "");
            iframe.setAttribute("scrolling","no");
            iframe.style.overflow = "hidden";

            function resizeParticipantFrame(){
                try{
                    const doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
                    if(!doc) return;
                    const body = doc.body;
                    const root = doc.documentElement;
                    const h = Math.max(
                        body ? body.scrollHeight : 0,
                        root ? root.scrollHeight : 0,
                        body ? body.offsetHeight : 0,
                        root ? root.offsetHeight : 0,
                        900
                    );
                    iframe.style.height = (h + 24) + "px";
                    iframe.style.minHeight = (h + 24) + "px";
                }catch(e){}
            }

            iframe.onload = ()=>{
                const forceLoad = ()=>{
                    try{
                        const w = iframe.contentWindow;
                        if(!w || typeof w.loadParticipant !== "function") return false;
                        w.loadParticipant({id:autoPid,routeId:autoRouteId,eventData:eventData});
                        resizeParticipantFrame();
                        return true;
                    }catch(e){
                        console.warn("No se pudo forzar carga directa del participante", e);
                        return false;
                    }
                };
                forceLoad();
                setTimeout(()=>{forceLoad();resizeParticipantFrame();}, 250);
                setTimeout(()=>{forceLoad();resizeParticipantFrame();}, 800);
                setTimeout(()=>{forceLoad();resizeParticipantFrame();}, 1500);
                setTimeout(resizeParticipantFrame, 2500);
            };

            iframe.srcdoc = participantOfflineAppHtml(eventData);
            content.appendChild(iframe);
            setTimeout(resizeParticipantFrame, 1000);
            setTimeout(resizeParticipantFrame, 2500);
        }catch(err){
            console.error(err);
            content.innerHTML = `<div class="participant-empty-card">
                <h2>No se pudo cargar la vista participante</h2>
                <p>${String(err && err.message ? err.message : err)}</p>
            </div>`;
        }
    }

    function initAccessGate(){
        const gate = gateEl();
        if(!gate) return;

        document.getElementById("militopoOrganizerAccessBtn")?.addEventListener("click", showOrganizer);
        document.getElementById("militopoParticipantAccessBtn")?.addEventListener("click", showParticipant);
        document.getElementById("militopoPasswordEnterBtn")?.addEventListener("click", checkOrganizerPassword);
        document.getElementById("militopoPasswordCancelBtn")?.addEventListener("click", showGate);
        document.getElementById("militopoOrganizerPassword")?.addEventListener("keydown", (e)=>{
            if(e.key === "Enter"){
                e.preventDefault();
                checkOrganizerPassword();
            }
            if(e.key === "Escape"){
                e.preventDefault();
                showGate();
            }
        });
        document.getElementById("militopoBackToAccessBtn")?.addEventListener("click", ()=>{
            try{ localStorage.removeItem(ACCESS_MODE_KEY); }catch(e){}
            showGate();
        });

        let mode = "";
        let unlocked = false;
        const urlParticipantData = (typeof readParticipantWebDataFromUrl === "function") ? readParticipantWebDataFromUrl() : null;
        try{
            mode = urlParticipantData ? "participante" : (localStorage.getItem(ACCESS_MODE_KEY) || "");
            unlocked = sessionStorage.getItem(ORGANIZER_UNLOCK_KEY) === "1";
        }catch(e){}

        if(mode === "participante"){
            showParticipant();
        }else if(mode === "organizador"){
            showOrganizer();
        }else{
            showGate();
        }
    }

    window.addEventListener("load", function(){
        setTimeout(initAccessGate, 420);
    });
})();
// MILITOPO ORIENTACIÓN · CONTROL DE ACCESO ORGANIZADOR/PARTICIPANTE END


// ORIENTATION GUIDE MODAL START
(function(){
    function showOrientationGuide(){
        const modal=document.getElementById("orientationGuideModal");
        if(modal) modal.style.display="flex";
    }
    function hideOrientationGuide(){
        const modal=document.getElementById("orientationGuideModal");
        if(modal) modal.style.display="none";
    }
    document.addEventListener("DOMContentLoaded", function(){
        const modal=document.getElementById("orientationGuideModal");
        const close=document.getElementById("closeOrientationGuideBtn");
        let hideGuide=false;
        try { hideGuide = localStorage.getItem("militopo_orientacion_guide_hidden") === "1"; } catch(e) {}
        const accessMode = (()=>{ try { return localStorage.getItem("militopo_orientacion_access_mode_v1") || ""; } catch(e){ return ""; } })();
        const organizerUnlocked = (()=>{ try { return sessionStorage.getItem("militopo_orientacion_organizer_unlocked_session_v1") === "1"; } catch(e){ return false; } })();
        if(!hideGuide && accessMode === "organizador" && organizerUnlocked) setTimeout(showOrientationGuide, 450);
        close?.addEventListener("click", hideOrientationGuide);
        document.getElementById("dontShowOrientationGuideBtn")?.addEventListener("click", function(){
            try { localStorage.setItem("militopo_orientacion_guide_hidden", "1"); } catch(e) {}
            hideOrientationGuide();
        });
        modal?.addEventListener("click", function(e){
            if(e.target===modal) hideOrientationGuide();
        });
    });
    window.showOrientationGuide=showOrientationGuide;
})();
// ORIENTATION GUIDE MODAL END
