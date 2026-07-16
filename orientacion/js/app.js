/* MILITOPO Orientación · cargador modular seguro fase 2
   No contiene lógica de la app: carga los bloques en orden clásico para mantener compatibilidad. */
(function(){
  var VERSION = "distancias-track-analisis-ajustado-v20";
  var files = [
    "js/core/app-main.js",
    "js/pdf/pdf-professional.js",
    "js/results/results-v16.js",
    "js/results/results-classification-fix.js"
  ];
  var base = "";
  var current = document.currentScript && document.currentScript.src ? document.currentScript.src : "";
  if (current) {
    base = current.split("/").slice(0, -1).join("/") + "/";
  }
  for (var i = 0; i < files.length; i++) {
    document.write('<script src="' + base + files[i].replace(/^js\//, "") + '?v=' + VERSION + '"><\/script>');
  }
})();
