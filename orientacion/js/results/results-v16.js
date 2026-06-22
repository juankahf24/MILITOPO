/* =========================================================
   MILITOPO · RESULTADOS / CLASIFICACIÓN · V16
   Corrección directa: tabla paso 6 sin solapes, detalle por líneas
   y XLSX vertical preparado para imprimir.
   ========================================================= */
function applyResultsV16Styles(){
    if(document.getElementById("militopoResultsV16Styles"))return;
    const st=document.createElement("style");
    st.id="militopoResultsV16Styles";
    st.textContent=`
#classificationTable{width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:6px}
#classificationTable .results-table-v16{width:1120px;min-width:1120px;max-width:none!important;table-layout:fixed;border-collapse:separate;border-spacing:0;font-size:13px;line-height:1.2}
#classificationTable .results-table-v16 th,#classificationTable .results-table-v16 td{white-space:normal!important;word-break:normal!important;overflow-wrap:anywhere!important;vertical-align:top!important;text-align:left;padding:10px 8px;line-height:1.18}
#classificationTable .results-table-v16 th{font-size:12px;letter-spacing:.06em;text-transform:uppercase;vertical-align:top!important;text-align:center!important}
#classificationTable .results-table-v16 td.center{text-align:center!important}
#classificationTable .estado-v16{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:3px;min-height:42px;padding-top:0;text-align:center;font-weight:900;line-height:1.05}
#classificationTable .estado-v16 .ico{font-size:1.35rem;line-height:1}
#classificationTable .estado-v16 .txt{font-size:.82rem;letter-spacing:.04em}
#selectedResultDetail .result-detail-v16{display:grid;gap:8px;line-height:1.35;white-space:normal;word-break:normal;overflow-wrap:anywhere}
#selectedResultDetail .result-detail-row-v16{display:block;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.12)}
#selectedResultDetail .result-detail-row-v16 b{display:block;color:#f0c16a;margin-bottom:2px;letter-spacing:.04em}
#selectedResultDetail .split-v16{padding:7px 0;border-top:1px solid rgba(255,255,255,.12)}
#selectedResultDetail .split-v16 b{display:block;color:#f0c16a;margin-bottom:2px}
@media(max-width:720px){#classificationTable .results-table-v16{width:1080px;min-width:1080px;font-size:12px}#classificationTable .results-table-v16 th,#classificationTable .results-table-v16 td{padding:9px 7px}.results-table-v16-wrap:before{content:'Desliza lateralmente para ver toda la clasificación';display:block;margin:0 0 8px;color:#f0c16a;font-weight:900;font-size:12px;letter-spacing:.05em}}
`;
    document.head.appendChild(st);
}

function formatDateTimeSpainV16(value){
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
    }catch(e){
        return d.toLocaleString("es-ES");
    }
}

renderClassificationTable=function(){
    applyResultsV16Styles();
    const box=document.getElementById("classificationTable");if(!box)return;
    const rows=sortedImportedResults();if(!rows.length){box.innerHTML=`<div class="status warn">Todavía no hay resultados importados.</div>`;return;}
    let rank=0;
    box.innerHTML=`<div class="results-table-v16-wrap" style="width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;"><table class="results-table results-table-v16"><colgroup><col style="width:70px"><col style="width:220px"><col style="width:120px"><col style="width:105px"><col style="width:120px"><col style="width:125px"><col style="width:125px"><col style="width:145px"><col style="width:145px"></colgroup><thead><tr><th>Puesto</th><th>Nombre</th><th>Tiempo</th><th>Recorrido</th><th>Dificultad</th><th>Distancia</th><th>Desnivel +</th><th>Controles<br>completados</th><th>Controles<br>pendientes</th></tr></thead><tbody>${rows.map(r=>{rank++;const ms=resultMs(r),time=ms!==null?formatDuration(ms):"--",metric=typeof routeMetricForResult==="function"?routeMetricForResult(r):{};const controls=typeof resultCompletedControlsCount==="function"?resultCompletedControlsCount(r):(r.scans||[]).filter(s=>s.st==="correct"||s.status==="correct").length;const missingCount=Array.isArray(r.missingControls)?r.missingControls.length:0;const cls=classificationRankClass(rank,r.completed);return `<tr class="${cls}"><td class="center">${rank}</td><td>${escapeHtml(resultParticipantName(r)||r.participantId||"--")}</td><td class="center">${escapeHtml(time)}</td><td class="center">${escapeHtml(r.routeId||"--")}</td><td class="center">${escapeHtml(String(metric?.difficulty||"--"))}</td><td class="center">${escapeHtml(metric?.distanceKm!=null?`${metric.distanceKm} km`:"--")}</td><td class="center">${escapeHtml(metric?.positiveM!=null?`${metric.positiveM} m`:"--")}</td><td class="center">${controls}</td><td class="center">${missingCount}</td></tr>`;}).join("")}</tbody></table></div>`;
};

renderSelectedResultDetail=function(){
    applyResultsV16Styles();
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

    const ms=resultMs(r);
    const time=ms!==null?formatDuration(ms):"--";
    const name=resultParticipantName(r);
    const scans=(r.scans||[]).map((s,i)=>{
        const id=s.id||s.controlId||"--";
        const when=s.t||s.timestamp||"";
        const st=s.st||s.status||"--";
        return `<div class="split-v16"><b>${i+1}. ${escapeHtml(id)}</b><span>Fecha/hora: ${escapeHtml(formatDateTimeSpainV16(when))}</span><br><span>Estado: ${escapeHtml(st)}</span></div>`;
    }).join("");

    box.className=r.completed?"status ok":"status warn";
    box.innerHTML=`<div class="result-detail-v16">
        <div class="result-detail-row-v16"><b>Participante</b>${escapeHtml(r.participantId||"--")}</div>
        <div class="result-detail-row-v16"><b>Nombre</b>${escapeHtml(name||"--")}</div>
        <div class="result-detail-row-v16"><b>Recorrido</b>${escapeHtml(r.routeId||"--")}</div>
        <div class="result-detail-row-v16"><b>Estado</b>${r.completed?"✅ Completo":"⚠️ Con avisos"}</div>
        <div class="result-detail-row-v16"><b>Salida</b>${escapeHtml(formatDateTimeSpainV16(r.startTime))}</div>
        <div class="result-detail-row-v16"><b>Llegada</b>${escapeHtml(formatDateTimeSpainV16(r.finishTime))}</div>
        <div class="result-detail-row-v16"><b>Tiempo</b>${escapeHtml(time)}</div>
        <div class="result-detail-row-v16"><b>Controles pendientes</b>${escapeHtml((r.missingControls||[]).join(", ")||"--")}</div>
        <div class="result-detail-row-v16"><b>Pasos registrados</b>${scans||"--"}</div>
    </div>`;
};

classificationRowsForExport=function(){
    const rows=[["Puesto","Nombre","Tiempo","Recorrido","Dificultad","Distancia","Desnivel +","Controles completados","Controles pendientes"]];let rank=0;
    sortedImportedResults().forEach(r=>{rank++;const ms=resultMs(r),metric=typeof routeMetricForResult==="function"?routeMetricForResult(r):{};const controls=typeof resultCompletedControlsCount==="function"?resultCompletedControlsCount(r):(r.scans||[]).filter(s=>s.st==="correct"||s.status==="correct").length;rows.push([rank,resultParticipantName(r)||r.participantId||"",ms!==null?formatDuration(ms):"--",r.routeId||"--",String(metric?.difficulty||"--"),metric?.distanceKm!=null?`${metric.distanceKm} km`:"--",metric?.positiveM!=null?`${metric.positiveM} m`:"--",controls,Array.isArray(r.missingControls)?r.missingControls.length:0]);});
    return rows;
};

downloadClassificationExcel=async function(){
    const rows=classificationRowsForExport();
    if(rows.length<=1)return toast("No hay clasificación para exportar");
    if(typeof JSZip==="undefined")return toast("No se pudo crear XLSX: JSZip no está cargado");

    const escXml=v=>String(v??"")
        .replace(/&/g,"&amp;")
        .replace(/</g,"&lt;")
        .replace(/>/g,"&gt;")
        .replace(/"/g,"&quot;")
        .replace(/'/g,"&apos;");
    const colName=n=>{let s="";while(n>0){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=Math.floor((n-1)/26)}return s};
    const rowHeight=(row,ri)=>{
        if(ri===0)return 42;
        const maxLen=Math.max(...row.map(c=>String(c??"").length));
        return Math.min(120,Math.max(34,28+Math.ceil(maxLen/24)*9));
    };
    const rankedResults=sortedImportedResults();
    const sheetRows=rows.map((row,ri)=>{
        const r=ri+1;
        const completed=ri===0?true:!!rankedResults[ri-1]?.completed;
        const styleId=ri===0?1:classificationXlsxStyle(row[0],completed);
        const cells=row.map((cell,ci)=>{
            const ref=colName(ci+1)+r;
            return `<c r="${ref}" t="inlineStr" s="${styleId}"><is><t>${escXml(cell)}</t></is></c>`;
        }).join("");
        return `<row r="${r}" ht="${rowHeight(row,ri)}" customHeight="1">${cells}</row>`;
    }).join("");

    const widths=[8,24,14,12,14,14,14,22,22].map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join("");
    const sheetXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
 <sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
 <dimension ref="A1:I${rows.length}"/>
 <sheetViews><sheetView workbookViewId="0" showGridLines="1"/></sheetViews>
 <cols>${widths}</cols>
 <sheetData>${sheetRows}</sheetData>
 <printOptions horizontalCentered="1"/>
 <pageMargins left="0.20" right="0.20" top="0.35" bottom="0.35" header="0.15" footer="0.15"/>
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
    const stylesXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="10"/><name val="Calibri"/></font></fonts><fills count="13"><fill><patternFill patternType="none"/></fill>${fills}</fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="13">${xfs}</cellXfs></styleSheet>`;
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
    const a=document.createElement("a");
    a.href=url;
    a.download=filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{URL.revokeObjectURL(url);a.remove()},1500);
};

(function(){
    const oldRenderResultsControl=renderResultsControl;
    renderResultsControl=function(){
        applyResultsV16Styles();
        return oldRenderResultsControl.apply(this,arguments);
    };
})();


