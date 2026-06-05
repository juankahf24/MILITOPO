/* =========================================================
   MILITOPO · MEJORA PDF PROFESIONAL · V1
   Mejora encabezado, tabla IOF y resumen técnico sin cambiar
   el cálculo de rutas, coordenadas, QR ni generación ZIP.
   ========================================================= */
(function(){
    if(window.__MILITOPO_PDF_PRO_V1__)return;
    window.__MILITOPO_PDF_PRO_V1__=true;

    const planCss=`
/* MILITOPO PDF PROFESIONAL V1 */
.sheet{background:#f8efd8!important;color:#111!important;box-shadow:none!important}
.header{background:linear-gradient(180deg,#27351c,#18230f)!important;border-bottom:2.2mm solid #d8a94f!important;color:#fff2d2!important}
.title h1{color:#fff6dc!important;text-shadow:none!important;font-size:27px!important;letter-spacing:5.4px!important;line-height:1!important}
.title h2{color:#ffd782!important;text-shadow:none!important;font-size:16px!important;letter-spacing:3.6px!important;margin-top:3px!important}
.scale{color:#fff6dc!important;font-size:19px!important;line-height:1.08!important}.scale small{color:#ffd782!important;font-size:12px!important;margin-top:2px!important}
.crestBox{background:#fff8e7!important;border:1px solid rgba(30,30,30,.45)!important;box-shadow:0 .5mm 1.5mm rgba(0,0,0,.22)!important}.crestFallback{color:#18230f!important}
.headerBrandText{color:#fff6dc!important}.headerMascot{background:rgba(255,255,255,.10)!important;border:1px solid rgba(255,255,255,.20)!important}
.content{background:#f8efd8!important}.map-wrap{border:1.2px solid #2f2a1e!important;background:#ece6cb!important;box-shadow:inset 0 0 0 1px rgba(255,255,255,.5)!important}
.mapNorthCompass,.realScaleCheck{background:rgba(255,248,231,.96)!important;border-color:#1d170d!important;color:#1d170d!important}.realScaleBar{border-color:#1d170d!important}
.iof{background:#fff!important;border:2.2px solid #000!important;box-shadow:0 .7mm 2mm rgba(0,0,0,.18)!important;position:relative!important;padding-top:6mm!important}.iof:before{content:"DESCRIPCIÓN IOF";position:absolute;top:0;left:0;right:0;height:6mm;display:flex;align-items:center;justify-content:center;background:#f2f2f2;border-bottom:1.5px solid #000;font-size:8px;font-weight:900;letter-spacing:.45px;color:#000}.iof-head{border-bottom:1.6px solid #000!important}.iof-title{font-size:7.5px!important;font-weight:900!important;background:#fff!important}.iof-difficulty{font-size:7.5px!important;background:#fff!important}.iof-metrics{border-bottom-color:#000!important}.iof-letters{border-bottom-color:#000!important}.iof-metrics div,.iof-letters div{font-weight:900!important;color:#000!important;border-right-color:#000!important}.iof-table td{height:17px!important;border-color:#000!important;color:#000!important;background:#fff!important}.iof-table .code{font-weight:900!important;color:#000!important}.iof-table svg{width:18.8px!important;height:18.8px!important;color:#000!important;filter:none!important}.iof-table svg *{color:#000!important;stroke:#000!important;stroke-width:8.2!important}.iof-table svg [fill]:not([fill="none"]):not([fill="transparent"]),.iof-table svg .fill,.iof-table svg text,.iof-table svg tspan{fill:#000!important}.iof-table svg text,.iof-table svg tspan{stroke:none!important}
.footer{background:#f8efd8!important;border-top:2px solid #8b6a2f!important;color:#21170b!important}.footer .tech{background:rgba(255,255,255,.52)!important;border:1px solid rgba(95,72,31,.55)!important;border-radius:1.7mm!important;padding:1.3mm 2mm!important;color:#18230f!important;font-size:6.4px!important;line-height:1.18!important}.footer .tech b{font-size:7.2px;color:#18230f!important}.footer .note{color:#2a1d0d!important;font-size:9.2px!important}.footer .note small{display:block;font-size:6.5px;line-height:1.25;margin-top:1mm;color:#5c4218!important}.warn{background:rgba(255,238,196,.86)!important;padding:.7mm 1.2mm!important;border-radius:1mm!important;color:#8a0000!important}
@media print{.sheet{background:#f8efd8!important}.map-wrap{box-shadow:none!important}.iof{box-shadow:none!important}}
`;

    const iofSheetCss=`
/* MILITOPO IOF GENERAL PROFESIONAL V1 */
@page{size:A4 portrait;margin:7mm}body{background:#ddd!important;color:#111!important}.page{background:#fff!important;max-width:none!important;min-height:calc(297mm - 14mm);box-shadow:0 8px 30px rgba(0,0,0,.18);border:1px solid #cfcfcf;padding:12mm!important}.title{font-size:25px!important;color:#18230f!important;letter-spacing:1.2px!important;border-bottom:4px solid #d8a94f!important;padding-bottom:5px!important}.meta{background:#f8efd8!important;border:1px solid #c7a25b!important;border-radius:8px!important;padding:8px 10px!important;font-size:12px!important;color:#21170b!important}table{font-size:10.5px!important;border:2px solid #000!important}th{background:#18230f!important;color:#fff2d2!important;border:1px solid #000!important;font-size:9px!important}td{border:1px solid #222!important;color:#000!important;background:#fff!important;padding:4px!important}.symbol{font-size:15px!important}.toolbar button{background:#18230f!important;color:#fff2d2!important}tbody tr:nth-child(even) td{background:#f7f7f7!important}@media print{body{background:white!important}.page{box-shadow:none!important;border:0!important;padding:0!important}.title{font-size:22px!important}.meta{font-size:10.5px!important}table{font-size:9px!important}th{font-size:8px!important}.toolbar{display:none!important}}
`;

    function injectBeforeStyleClose(html,css){
        if(typeof html!=="string")return html;
        const marker=css.includes("IOF GENERAL")?"MILITOPO IOF GENERAL PROFESIONAL V1":"MILITOPO PDF PROFESIONAL V1";
        if(html.includes(marker))return html;
        if(html.includes("</style></head>"))return html.replace("</style></head>",css+"</style></head>");
        if(html.includes("</style>"))return html.replace("</style>",css+"</style>");
        return html;
    }

    if(typeof participantPlanHtml==="function"){
        const __participantPlanHtmlBase=participantPlanHtml;
        participantPlanHtml=function(route){
            let html=__participantPlanHtmlBase(route);
            html=injectBeforeStyleClose(html,planCss);
            html=html.replace('<div class="footer"><div class="tech">FICHA TÉCNICA:<br>','<div class="footer"><div class="tech"><b>RESUMEN TÉCNICO DEL RECORRIDO</b><br>');
            html=html.replace('El deporte de orientación es respetuoso con el medio natural, cuida la naturaleza.','El deporte de orientación es respetuoso con el medio natural.<br><small>Cuida la naturaleza · respeta zonas privadas · comprueba escala física antes de imprimir en serie.</small>');
            return html;
        };
    }

    if(typeof iofDescriptionsSheetHtml==="function"){
        const __iofDescriptionsSheetHtmlBase=iofDescriptionsSheetHtml;
        iofDescriptionsSheetHtml=function(){
            let html=__iofDescriptionsSheetHtmlBase();
            html=injectBeforeStyleClose(html,iofSheetCss);
            html=html.replace('Descripciones de control ·','DESCRIPCIONES IOF ·');
            return html;
        };
    }
})();


