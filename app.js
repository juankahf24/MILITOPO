let MODULOS = 8;
    let PUNTOS_POR_MODULO = 5;
    let puntosData = {};
    let currentCoordType = "UTM";
    let currentStep = 1;
    let appMode = "topografica";
    const ORIENTACION_ACTIVA = true;
    let hasUnsavedChanges = false;

    let map = null;
    let permanentMarkers = [];
    let permanentMarkersByPoint = {};
    let currentBaseLayer = null;
    let topoLayer = null;
    let aerialLayer = null;
    let mapantLayer = null;
    let currentSearchMarker = null;
    let userLocationMarker = null;
    let userLocationCircle = null;

    function esUTMValido(coord) {
        if (!coord || typeof coord !== 'string') return false;
        const partes = coord.trim().split(/\s+/);
        if (partes.length !== 3) return false;
        const zona = partes[0];
        const este = partes[1];
        const norte = partes[2];
        const zonaRegex = /^[0-9]{1,2}[A-Z]$/i;
        if (!zonaRegex.test(zona)) return false;
        if (!/^[0-9]{6}$/.test(este)) return false;
        if (!/^[0-9]{7}$/.test(norte)) return false;
        return true;
    }

    function esMGRSValido(coord) {
        if (!coord || typeof coord !== 'string') return false;
        const partes = coord.trim().split(/\s+/);
        if (partes.length !== 4) return false;
        const zona = partes[0];
        const cuadrante = partes[1];
        const este = partes[2];
        const norte = partes[3];
        const zonaRegex = /^[0-9]{1,2}[A-Z]$/i;
        if (!zonaRegex.test(zona)) return false;
        const cuadranteRegex = /^[A-Z]{2}$/i;
        if (!cuadranteRegex.test(cuadrante)) return false;
        if (!/^[0-9]{5}$/.test(este)) return false;
        if (!/^[0-9]{5}$/.test(norte)) return false;
        return true;
    }

    function esCoordenadaValida(coord, tipo) {
        if (!coord || coord.trim() === "") return false;
        if (tipo === "UTM") return esUTMValido(coord);
        return esMGRSValido(coord);
    }

    function latLonToUTM(lat, lon) {
        const utmZone = Math.floor((lon + 180) / 6) + 1;
        const projUTM = `+proj=utm +zone=${utmZone} +ellps=WGS84 +datum=WGS84 +units=m +no_defs`;
        const wgs84 = "+proj=longlat +datum=WGS84 +no_defs";
        const coord = proj4(wgs84, projUTM, [lon, lat]);
        let este = Math.round(coord[0]);
        let norte = Math.round(coord[1]);

        const bandas = ["C","D","E","F","G","H","J","K","L","M","N","P","Q","R","S","T","U","V","W","X"];
        let indice = Math.floor((lat + 80) / 8);
        if (indice < 0) indice = 0;
        if (indice >= bandas.length) indice = bandas.length - 1;
        let letraBanda = bandas[indice];

        return `${utmZone}${letraBanda} ${este} ${norte}`;
    }

    function latLonToMGRS(lat, lon) {
        const utmZone = Math.floor((lon + 180) / 6) + 1;
        const projUTM = `+proj=utm +zone=${utmZone} +ellps=WGS84 +datum=WGS84 +units=m +no_defs`;
        const wgs84 = "+proj=longlat +datum=WGS84 +no_defs";
        let coord = proj4(wgs84, projUTM, [lon, lat]);
        let este = coord[0];
        let norte = coord[1];

        const bandas = ["C","D","E","F","G","H","J","K","L","M","N","P","Q","R","S","T","U","V","W","X"];
        let indice = Math.floor((lat + 80) / 8);
        if (indice < 0) indice = 0;
        if (indice >= bandas.length) indice = bandas.length - 1;
        let letraBanda = bandas[indice];
        const isNorth = (lat >= 0);

        const letras = ["A","B","C","D","E","F","G","H","J","K","L","M","N","P","Q","R","S","T","U","V"];
        let columna = Math.floor(este / 100000);
        let fila = Math.floor(norte / 100000);

        if (!isNorth) fila = 19 - (fila % 20);
        else fila = fila % 20;

        columna = columna % 20;
        let letraColumna = letras[columna];
        let letraFila = letras[fila];
        let cuadrante = letraColumna + letraFila;

        let esteResto = Math.floor(este % 100000);
        let norteResto = Math.floor(norte % 100000);
        let esteStr = String(esteResto).padStart(5, '0');
        let norteStr = String(norteResto).padStart(5, '0');

        return `${utmZone}${letraBanda} ${cuadrante} ${esteStr} ${norteStr}`;
    }

    function utmToMgrs(utmStr) {
        let latlon = utmToLatLon(utmStr);
        if (!latlon) return "";
        return latLonToMGRS(latlon.lat, latlon.lon);
    }

    function latLonToCoordText(lat, lng) {
        return currentCoordType === "UTM" ? latLonToUTM(lat, lng) : latLonToMGRS(lat, lng);
    }

    function formatUTM(value) {
        let clean = value.replace(/\s/g, '');
        if (clean.length === 0) return '';
        let zoneMatch = clean.match(/^([0-9]{1,2}[A-Z])/i);
        if (!zoneMatch) return value;
        let zone = zoneMatch[1].toUpperCase();
        let rest = clean.substring(zone.length);
        let eastingMatch = rest.match(/^([0-9]{1,6})/);
        let easting = eastingMatch ? eastingMatch[1] : '';
        let remaining = eastingMatch ? rest.substring(easting.length) : rest;
        let northingMatch = remaining.match(/^([0-9]{1,7})/);
        let northing = northingMatch ? northingMatch[1] : '';
        let parts = [zone];
        if (easting) parts.push(easting);
        if (northing) parts.push(northing);
        return parts.join(' ');
    }

    function formatMGRS(value) {
        let clean = value.replace(/\s/g, '').toUpperCase();
        if (clean.length === 0) return '';
        let match = clean.match(/^([0-9]{1,2}[A-Z])([A-Z]{2})([0-9]{1,5})([0-9]{0,5})/);
        if (!match) return value;
        let zone = match[1];
        let grid = match[2];
        let east = match[3].padEnd(5, '0').substring(0,5);
        let north = match[4].padEnd(5, '0').substring(0,5);
        let result = `${zone} ${grid} ${east}`;
        if (north) result += ` ${north}`;
        return result;
    }

    function normalizeCoordinateField(inputElement, coordType) {
        if (!inputElement) return;
        let raw = inputElement.value;
        let formatted = coordType === 'UTM' ? formatUTM(raw) : formatMGRS(raw);
        if (formatted !== raw && formatted !== '') inputElement.value = formatted;
        let pid = inputElement.getAttribute('data-id');
        if (pid && puntosData[pid]) {
            puntosData[pid].coordsUTM = inputElement.value;
            if (puntosData[pid].latlng) delete puntosData[pid].latlng;
            guardarStorage();
            actualizarDashboard();
        }
    }

    function generarOpcionesRecorridos() {
        const select = document.getElementById("numRecorridos");
        if (!select) return;
        select.innerHTML = "";
        for (let i = 1; i <= 100; i++) {
            const option = document.createElement("option");
            option.value = i;
            option.textContent = `${i} recorrido${i !== 1 ? 's' : ''}`;
            if (i === 5) option.selected = true;
            select.appendChild(option);
        }
    }

    function getPuntoId(m, p) { return `P${m}${p}`; }
    function codigo3() { return String.fromCharCode(65+Math.floor(Math.random()*26)) + String.fromCharCode(65+Math.floor(Math.random()*26)) + String.fromCharCode(65+Math.floor(Math.random()*26)); }

    function utmToLatLon(utmStr) {
        try {
            let partes = utmStr.trim().split(/\s+/);
            if (partes.length < 3) return null;
            let zonaLetra = partes[0];
            let este = parseFloat(partes[1]);
            let norte = parseFloat(partes[2]);
            let zonaNum = parseInt(zonaLetra.match(/\d+/)[0]);
            let letra = zonaLetra.match(/[A-Z]/)[0];
            const letrasNorte = ["N","P","R","S","T","U","V","W","X"];
            const isNorth = letrasNorte.includes(letra);
            const projUTM = `+proj=utm +zone=${zonaNum} +${isNorth ? 'north' : 'south'} +ellps=WGS84 +datum=WGS84 +units=m +no_defs`;
            const wgs84 = "+proj=longlat +datum=WGS84 +no_defs";
            let [lon, lat] = proj4(projUTM, wgs84, [este, norte]);
            return { lat, lon };
        } catch(e) { return null; }
    }

    function coordEjemplo(m, p, tipo) {
        let este = 450000 + m * 820 + p * 140, norte = 4780000 + m * 550 - p * 90;
        let utm = `30T ${este} ${norte}`;
        if (tipo === "MGRS") {
            let latlon = utmToLatLon(utm);
            if (latlon) return latLonToMGRS(latlon.lat, latlon.lon);
            return "30T XG 12345 67890";
        }
        return utm;
    }

    function descEjemplo(m, p) { return `${["COTA","COLLADO","ÁRBOL","FUENTE","LOMA"][(p-1)%5]} ${getPuntoId(m,p)}`; }

    function generarEstructuraCompleta(tipo) {
        let nuevos = {};
        for (let m = 1; m <= MODULOS; m++) {
            for (let p = 1; p <= PUNTOS_POR_MODULO; p++) {
                nuevos[getPuntoId(m,p)] = { coordsUTM: coordEjemplo(m,p,tipo), descripcion: descEjemplo(m,p) };
            }
        }
        return nuevos;
    }

    function restablecerEjemplos() {
        puntosData = generarEstructuraCompleta(currentCoordType);
        renderizarPuntos();
        if (typeof renderMapManualEditor === "function") renderMapManualEditor();
        guardarStorage();
        actualizarDashboard();
        if (typeof updateAllMapMarkers === "function") updateAllMapMarkers();
        if (typeof updatePreviewFromSelectedPoint === "function") updatePreviewFromSelectedPoint();
        toast("✅ Puntos y descripciones autorellenados", "success");
    }

    function aplicarConfiguracion() {
        const oldModulos = MODULOS;
        const oldPuntosPorModulo = PUNTOS_POR_MODULO;
        const oldCoordType = currentCoordType;
        const oldData = JSON.parse(JSON.stringify(puntosData || {}));

        MODULOS = parseInt(document.getElementById("numModulosSelect").value);
        PUNTOS_POR_MODULO = parseInt(document.getElementById("puntosPorModuloSelect").value);
        currentCoordType = document.getElementById("coordTypeConfig").value;

        const mismaEstructura = oldModulos === MODULOS && oldPuntosPorModulo === PUNTOS_POR_MODULO && oldCoordType === currentCoordType;

        if (mismaEstructura) {
            puntosData = oldData;
        } else {
            const nuevaBase = generarEstructuraCompleta(currentCoordType);
            Object.keys(nuevaBase).forEach(id => {
                if (oldData[id]) {
                    nuevaBase[id] = Object.assign({}, nuevaBase[id], oldData[id]);
                }
            });
            puntosData = nuevaBase;
        }

        guardarStorage();
        renderizarPuntos();
        actualizarDashboard();
        document.getElementById("infoEstructura").innerHTML = `${MODULOS} módulos × ${PUNTOS_POR_MODULO} puntos = ${MODULOS * PUNTOS_POR_MODULO} puntos totales`;
        toast(mismaEstructura
            ? "✅ Configuración mantenida y datos conservados"
            : `✅ Estructura configurada: ${MODULOS} módulos, ${PUNTOS_POR_MODULO} puntos`,
            "success");
        actualizarVisibilidadImportGPX();
    }

    function formatearCoord(raw, tipo) {
        if (!raw) return "---";
        if (tipo === "MGRS") {
            if (raw.match(/^\d+[A-Z]\s+[A-Z]{2}\s+\d{5}\s+\d{5}$/i)) return raw;
            let latlon = utmToLatLon(raw);
            if (latlon) return latLonToMGRS(latlon.lat, latlon.lon);
            return "---";
        }
        return raw;
    }

    function guardarStorage() {
        localStorage.setItem("milimoto_puntos", JSON.stringify(puntosData));
        localStorage.setItem("milimoto_tipo", currentCoordType);
        localStorage.setItem("milimoto_modulos", MODULOS);
        localStorage.setItem("milimoto_puntos_por_modulo", PUNTOS_POR_MODULO);
    }

    function cargarStorage() {
        let saved = localStorage.getItem("milimoto_puntos"),
            savedTipo = localStorage.getItem("milimoto_tipo"),
            savedModulos = localStorage.getItem("milimoto_modulos"),
            savedPuntosPorModulo = localStorage.getItem("milimoto_puntos_por_modulo"),
            savedAppMode = localStorage.getItem("milimoto_app_mode");

        MODULOS = savedModulos ? parseInt(savedModulos) : 8;
        PUNTOS_POR_MODULO = savedPuntosPorModulo ? parseInt(savedPuntosPorModulo) : 5;
        currentCoordType = savedTipo || "UTM";
        document.getElementById("numModulosSelect").value = MODULOS;
        document.getElementById("puntosPorModuloSelect").value = PUNTOS_POR_MODULO;
        if (savedAppMode === "topografica") appMode = savedAppMode;
        if (savedAppMode === "orientacion") appMode = "topografica";
        document.getElementById("coordTypeConfig").value = currentCoordType;
        document.getElementById("infoEstructura").innerHTML = `${MODULOS} módulos × ${PUNTOS_POR_MODULO} puntos = ${MODULOS * PUNTOS_POR_MODULO} puntos totales`;

        if (saved) puntosData = JSON.parse(saved);
        else puntosData = generarEstructuraCompleta(currentCoordType);

        renderizarPuntos();
        actualizarDashboard();
        actualizarVisibilidadImportGPX();
    }


    function normalizarCoordParaComparar(coord) {
        return String(coord || "").trim().replace(/\s+/g, " ").toUpperCase();
    }

    function obtenerAnalisisPuntos() {
        const total = MODULOS * PUNTOS_POR_MODULO;
        let completados = 0;
        const invalidos = [];
        const sinDescripcion = [];
        const duplicados = [];
        const coordMap = new Map();

        for (let m = 1; m <= MODULOS; m++) {
            for (let p = 1; p <= PUNTOS_POR_MODULO; p++) {
                const id = getPuntoId(m, p);
                const data = puntosData[id] || { coordsUTM: "", descripcion: "" };
                const coordNorm = normalizarCoordParaComparar(data.coordsUTM);
                const coordValida = coordNorm !== "" && esCoordenadaValida(coordNorm, currentCoordType);
                const descValida = !!(data.descripcion && data.descripcion.trim() !== "");

                if (coordValida && descValida) completados++;
                if (coordNorm && !coordValida) invalidos.push(id);
                if (!descValida) sinDescripcion.push(id);

                if (coordValida) {
                    if (!coordMap.has(coordNorm)) coordMap.set(coordNorm, []);
                    coordMap.get(coordNorm).push(id);
                }
            }
        }

        for (const [coord, ids] of coordMap.entries()) {
            if (ids.length > 1) duplicados.push({ coord, ids });
        }

        return {
            total,
            completados,
            porcentaje: total > 0 ? Math.round((completados / total) * 100) : 0,
            invalidos,
            sinDescripcion,
            duplicados
        };
    }

    function pintarEstadoCamposPuntos() {
        document.querySelectorAll(".coord-inp").forEach(inp => {
            const pid = inp.getAttribute("data-id");
            const data = puntosData[pid] || {};
            const coordNorm = normalizarCoordParaComparar(data.coordsUTM || inp.value || "");
            const coordValida = coordNorm === "" ? false : esCoordenadaValida(coordNorm, currentCoordType);
            inp.style.borderColor = coordNorm && !coordValida ? "var(--error)" : "var(--border-light)";
            inp.style.boxShadow = coordNorm && !coordValida ? "0 0 0 2px rgba(184,92,58,0.18)" : "none";
            inp.title = coordNorm && !coordValida ? `Formato ${currentCoordType} no válido` : "";
        });

        document.querySelectorAll(".punto-card").forEach(card => {
            const pid = card.getAttribute("data-punto-id");
            const data = puntosData[pid] || {};
            const coordNorm = normalizarCoordParaComparar(data.coordsUTM || "");
            const coordValida = coordNorm !== "" && esCoordenadaValida(coordNorm, currentCoordType);
            const descValida = !!(data.descripcion && data.descripcion.trim() !== "");
            let status = card.querySelector(".punto-status");
            if (!status) {
                status = document.createElement("div");
                status.className = "punto-status";
                status.style.marginTop = "8px";
                status.style.fontSize = "0.68rem";
                status.style.fontFamily = "monospace";
                card.appendChild(status);
            }
            status.className = "punto-status";
            if (!coordNorm) {
                status.innerHTML = "Falta coordenada";
                status.classList.add("status-missing-coord");
                status.style.color = "";
            } else if (coordNorm && !coordValida) {
                status.innerHTML = "Coordenada no válida";
                status.classList.add("status-invalid");
                status.style.color = "";
            } else if (!descValida) {
                status.innerHTML = "Falta descripción";
                status.classList.add("status-missing-desc");
                status.style.color = "";
            } else {
                status.innerHTML = "Punto completo";
                status.classList.add("status-ok");
                status.style.color = "";
            }
        });
    }

    function renderizarAvisosDashboard() {
        const box = document.getElementById("dashboardWarnings");
        if (!box) return;
        const analisis = obtenerAnalisisPuntos();
        const avisos = [];

        if (analisis.invalidos.length) {
            avisos.push(`<div class="alert alert-error"><strong>Coordenadas que no cuadran:</strong> ${analisis.invalidos.join(", ")}</div>`);
        }
        if (analisis.duplicados.length) {
            const texto = analisis.duplicados.slice(0, 5).map(d => `${d.ids.join(" / ")}`).join(" · ");
            avisos.push(`<div class="alert alert-error"><strong>Duplicados detectados:</strong> ${texto}${analisis.duplicados.length > 5 ? " ..." : ""}</div>`);
        }
        if (analisis.sinDescripcion.length) {
            avisos.push(`<div class="alert alert-error"><strong>Falta descripción en:</strong> ${analisis.sinDescripcion.join(", ")}</div>`);
        }

        const faltanCoord = [];
        for (let m = 1; m <= MODULOS; m++) {
            for (let p = 1; p <= PUNTOS_POR_MODULO; p++) {
                const id = getPuntoId(m, p);
                const data = puntosData[id] || {};
                const coordNorm = normalizarCoordParaComparar(data.coordsUTM || "");
                if (!coordNorm) faltanCoord.push(id);
            }
        }
        if (faltanCoord.length) {
            avisos.push(`<div class="alert alert-error"><strong>Falta coordenada en:</strong> ${faltanCoord.join(", ")}</div>`);
        }

        if (!analisis.invalidos.length && !analisis.duplicados.length && !analisis.sinDescripcion.length && !faltanCoord.length) {
            avisos.push(`<div class="alert alert-success"><strong>Sin incidencias:</strong> no hay coordenadas inválidas, duplicados ni puntos pendientes.</div>`);
        }
        box.innerHTML = avisos.join("");
    }

    function detectarRecorridosRaros(metricas) {
        if (!Array.isArray(metricas) || metricas.length < 3) return [];
        const numsDist = metricas.map((m, i) => ({ i, v: Number(m.distanciaKm || 0) })).filter(x => Number.isFinite(x.v) && x.v > 0);
        const numsDes = metricas.map((m, i) => ({ i, v: Number(m.desnivelGlobal || 0) })).filter(x => Number.isFinite(x.v));
        const avisos = [];

        if (numsDist.length >= 3) {
            const avg = numsDist.reduce((a, b) => a + b.v, 0) / numsDist.length;
            numsDist.forEach(x => {
                if (x.v > avg * 1.35 || x.v < avg * 0.65) {
                    avisos.push(`R${String(x.i + 1).padStart(2, "0")} por distancia (${x.v.toFixed(3)} km)`);
                }
            });
        }

        if (numsDes.length >= 3) {
            const avg = numsDes.reduce((a, b) => a + b.v, 0) / numsDes.length;
            numsDes.forEach(x => {
                const absAvg = Math.abs(avg);
                const threshold = Math.max(absAvg * 0.75, 120);
                if (Math.abs(x.v - avg) > threshold) {
                    avisos.push(`R${String(x.i + 1).padStart(2, "0")} por desnivel (${x.v} m)`);
                }
            });
        }
        return [...new Set(avisos)];
    }


    function limpiarTodosLosPuntos() {
        if (!confirm("¿Seguro que quieres borrar todos los puntos, coordenadas y descripciones?")) return;
        for (let m = 1; m <= MODULOS; m++) {
            for (let p = 1; p <= PUNTOS_POR_MODULO; p++) {
                const id = getPuntoId(m, p);
                puntosData[id] = { coordsUTM: "", descripcion: "" };
                if (typeof removeMarkerByPointId === "function") removeMarkerByPointId(id);
            }
        }
        guardarStorage();
        renderizarPuntos();
        if (typeof renderMapManualEditor === "function") renderMapManualEditor();
        actualizarDashboard();
        if (typeof updateAllMapMarkers === "function") updateAllMapMarkers();
        if (typeof updatePreviewFromSelectedPoint === "function") updatePreviewFromSelectedPoint();
        toast("🗑️ Se han limpiado todos los puntos y descripciones", "success");
    }

    function actualizarDashboard() {
        const analisis = obtenerAnalisisPuntos();
        document.getElementById("totalPuntos").innerText = analisis.total;
        document.getElementById("completadosPuntos").innerText = analisis.completados;
        document.getElementById("porcentajePuntos").innerText = `${analisis.porcentaje}%`;
        document.getElementById("maxRecorridos").innerText = "100";
        document.getElementById("progressFillBig").style.width = `${analisis.porcentaje}%`;
        renderizarAvisosDashboard();
        pintarEstadoCamposPuntos();
        if (typeof refreshMapPointSelectorState === "function") refreshMapPointSelectorState();
    }

    let currentSearchTerm = "";

    function renderizarPuntos() {
        const container = document.getElementById("puntosGrid");
        if (!container) return;
        container.innerHTML = "";
        const searchTerm = currentSearchTerm.toLowerCase();

        for (let m = 1; m <= MODULOS; m++) {
            let moduloHasMatch = false;
            const moduloDiv = document.createElement("div");
            moduloDiv.className = "modulo-item";
            moduloDiv.setAttribute("data-modulo", m);

            const summary = document.createElement("div");
            summary.className = "modulo-summary";
            summary.innerHTML = `<span>📦 Módulo ${m}</span><span class="indicador">▼</span>`;

            const contentDiv = document.createElement("div");
            contentDiv.className = "modulo-content";
            contentDiv.style.display = "none";

            const gridModulo = document.createElement("div");
            gridModulo.className = "puntos-grid-modulo";

            for (let p = 1; p <= PUNTOS_POR_MODULO; p++) {
                const id = getPuntoId(m, p);
                const data = puntosData[id] || { coordsUTM: "", descripcion: "" };
                const card = document.createElement("div");
                card.className = "punto-card";
                card.setAttribute("data-punto-id", id);
                card.setAttribute("data-desc", (data.descripcion || "").toLowerCase());
                card.innerHTML = `
                    <div class="punto-title"><span class="punto-title-icon" aria-hidden="true"></span><span>${id}</span></div>
                    <input type="text" class="coord-inp" data-id="${id}" value="${escapeHtml(data.coordsUTM)}" placeholder="${currentCoordType === 'UTM' ? '30T 450000 4780000' : '30S XJ 12345 12345'}">
                    <textarea rows="2" class="desc-inp" data-id="${id}" placeholder="Descripción del punto">${escapeHtml(data.descripcion)}</textarea>
                `;
                gridModulo.appendChild(card);

                if (searchTerm !== "") {
                    const nombreMatch = id.toLowerCase().includes(searchTerm);
                    const descMatch = (data.descripcion || "").toLowerCase().includes(searchTerm);
                    if (nombreMatch || descMatch) moduloHasMatch = true;
                    else card.style.display = "none";
                } else {
                    moduloHasMatch = true;
                }
            }

            contentDiv.appendChild(gridModulo);
            moduloDiv.appendChild(summary);
            moduloDiv.appendChild(contentDiv);

            if (!moduloHasMatch && searchTerm !== "") moduloDiv.style.display = "none";
            container.appendChild(moduloDiv);

            summary.addEventListener("click", (e) => {
                e.stopPropagation();
                const isOpen = contentDiv.style.display === "block";
                contentDiv.style.display = isOpen ? "none" : "block";
                summary.querySelector(".indicador").textContent = isOpen ? "▼" : "▲";
            });
        }

        document.querySelectorAll(".coord-inp").forEach(inp => {
            inp.addEventListener("input", () => {
                const pid = inp.getAttribute("data-id");
                if (!puntosData[pid]) puntosData[pid] = { coordsUTM: "", descripcion: "" };
                puntosData[pid].coordsUTM = inp.value;
                if (puntosData[pid].latlng) delete puntosData[pid].latlng;
                markUnsavedChanges();
                actualizarDashboard();
            });
            inp.addEventListener("blur", () => normalizeCoordinateField(inp, currentCoordType));
            inp.addEventListener("change", () => {
                const pid = inp.getAttribute("data-id");
                if (!puntosData[pid]) puntosData[pid] = { coordsUTM: "", descripcion: "" };
                puntosData[pid].coordsUTM = inp.value;
                if (puntosData[pid].latlng) delete puntosData[pid].latlng;
                markUnsavedChanges();
                normalizeCoordinateField(inp, currentCoordType);
            });
        });

        document.querySelectorAll(".desc-inp").forEach(ta => {
            ta.addEventListener("input", () => {
                let pid = ta.getAttribute("data-id");
                if (!puntosData[pid]) puntosData[pid] = { coordsUTM: "", descripcion: "" };
                puntosData[pid].descripcion = ta.value;
                markUnsavedChanges();
                actualizarDashboard();
                pintarEstadoCamposPuntos();
            });
            ta.addEventListener("change", () => {
                let pid = ta.getAttribute("data-id");
                if (!puntosData[pid]) puntosData[pid] = { coordsUTM: "", descripcion: "" };
                puntosData[pid].descripcion = ta.value;
                markUnsavedChanges();
                guardarStorage();
                actualizarDashboard();
                pintarEstadoCamposPuntos();
            });
        });
    }

    function escapeHtml(s) {
        if (!s) return "";
        return s.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
    }

    function verificarCompletos() {
        let faltantes = [];
        let invalidos = [];
        let sinDescripcion = [];
        for (let m = 1; m <= MODULOS; m++) {
            for (let p = 1; p <= PUNTOS_POR_MODULO; p++) {
                let id = getPuntoId(m,p);
                let d = puntosData[id];
                let coordValida = d && d.coordsUTM && esCoordenadaValida(d.coordsUTM, currentCoordType);
                let descValida = d && d.descripcion && d.descripcion.trim() !== "";
                if (!coordValida || !descValida) faltantes.push(id);
                if (d && d.coordsUTM && !coordValida) invalidos.push(id);
                if (!descValida) sinDescripcion.push(id);
            }
        }
        return { ok: faltantes.length === 0, faltantes, invalidos, sinDescripcion };
    }

    function toast(msg, tipo) {
        let t = document.createElement("div");
        t.className = "toast";
        t.style.background = tipo === "success" ? "var(--success)" : "var(--error)";
        t.innerHTML = msg;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 2500);
    }

    function openTopoInfoModal({ icon = "ℹ️", title = "Información", body = "" }) {
        const modal = document.getElementById("topoInfoModal");
        const modalIcon = document.getElementById("topoInfoModalIcon");
        const modalTitle = document.getElementById("topoInfoModalTitle");
        const modalBody = document.getElementById("topoInfoModalBody");
        if (!modal || !modalIcon || !modalTitle || !modalBody) return;
        modalIcon.textContent = icon;
        modalTitle.textContent = title;
        modalBody.innerHTML = body;
        modal.classList.add("show");
        modal.setAttribute("aria-hidden", "false");
    }

    function closeTopoInfoModal() {
        const modal = document.getElementById("topoInfoModal");
        if (!modal) return;
        modal.classList.remove("show");
        modal.setAttribute("aria-hidden", "true");
    }

    function mostrarInfoCSV() {
        openTopoInfoModal({
            icon: "📄",
            title: "Importar CSV / Excel",
            body: `<p><strong>Importar CSV/Excel:</strong> El archivo debe contener al menos dos columnas: <strong>ID</strong> (nombre del punto, ej. P11) y <strong>COORDENADAS</strong> (en formato UTM o MGRS).</p><p>Opcionalmente puede incluir una columna <strong>DESCRIPCIÓN</strong>. Se actualizarán los puntos existentes.</p>`
        });
    }

    function mostrarInfoGPX() {
        openTopoInfoModal({
            icon: "📥",
            title: "Importar GPX / KML (ATAK)",
            body: `<p><strong>Importar GPX/KML (ATAK):</strong> archivos exportados desde ATAK.</p><p><strong>Formato de nombre de puntos para ATAK:</strong><br>Los puntos deben nombrarse con esta estructura en ATAK:<br><strong>ID del punto + descripción del punto = P11 Cota</strong></p><p>Esto hará que al importarlos el punto <strong>P11</strong> se nombre <strong>Cota</strong> en la descripción.</p><p>Se asignarán automáticamente la coordenada y la descripción al punto correspondiente.</p><p><strong>Nota:</strong> Esta función solo está disponible cuando el formato de coordenadas es UTM.</p>`
        });
    }

    function mostrarInfoModulos() {
        openTopoInfoModal({
            icon: "📦",
            title: "Módulos",
            body: `<p><strong>MÓDULOS:</strong> Cada módulo representa una estación o control. El recorrido pasará por un punto de cada módulo.</p><p>Ejemplo: <strong>8 módulos = 8 balizas por recorrido</strong>.</p>`
        });
    }

    function mostrarInfoPuntos() {
        openTopoInfoModal({
            icon: "📍",
            title: "Puntos por módulo",
            body: `<p><strong>PUNTOS POR MÓDULO:</strong> número de balizas diferentes dentro de cada módulo.</p><p>Ejemplo: <strong>5 puntos por módulo</strong> significa que cada módulo tiene 5 posibles balizas: <strong>P11, P12, P13, P14, P15</strong>.</p>`
        });
    }

    function mostrarInfoCoord() {
        openTopoInfoModal({
            icon: "🗺️",
            title: "Coordenadas",
            body: `<p><strong>COORDENADAS:</strong> formato de coordenadas para los puntos.</p><p>Puedes trabajar en <strong>UTM</strong> (ej. 30T 450000 4780000) o <strong>MGRS</strong> (ej. 30S XJ 12345 12345).</p>`
        });
    }

    function actualizarVisibilidadImportGPX() {
        const gpxContainer = document.getElementById("gpxImportContainer");
        if (!gpxContainer) return;
        gpxContainer.style.display = currentCoordType === "UTM" ? "flex" : "none";
    }

    function importFromCSVExcel(file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            let data = new Uint8Array(e.target.result);
            let workbook = XLSX.read(data, { type: 'array' });
            let sheet = workbook.Sheets[workbook.SheetNames[0]];
            let rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
            if (!rows || rows.length < 2) { toast("Archivo sin datos", "error"); return; }

            let headers = rows[0].map(h => String(h).trim().toUpperCase());
            let idCol = -1, coordCol = -1, descCol = -1;
            for (let i = 0; i < headers.length; i++) {
                const h = headers[i];
                if (idCol === -1 && (h.includes("ID") || h.includes("PUNTO") || h.includes("BALIZA"))) idCol = i;
                if (coordCol === -1 && (h.includes("COORD") || h.includes("COORDENADA") || h.includes("UTM") || h.includes("MGRS"))) coordCol = i;
                if (descCol === -1 && (h.includes("DESC") || h.includes("DESCRIPCIÓN") || h.includes("DESCRIPCION") || h.includes("NOMBRE"))) descCol = i;
            }
            if (idCol === -1 || coordCol === -1) { toast("Columnas requeridas: ID y COORDENADAS", "error"); return; }

            let importados = 0, ignorados = 0, actualizados = 0;
            const noReconocidos = [];
            for (let i = 1; i < rows.length; i++) {
                let id = normalizarIdPuntoImportacion(rows[i][idCol]);
                let coord = String(rows[i][coordCol] || "").trim();
                let desc = descCol !== -1 ? String(rows[i][descCol] || "").trim() : "";
                if (!id) continue;
                if (!puntosData[id]) {
                    ignorados++;
                    noReconocidos.push(id);
                    continue;
                }
                const antesCoord = puntosData[id].coordsUTM || "";
                const antesDesc = puntosData[id].descripcion || "";
                if (coord) puntosData[id].coordsUTM = coord;
                if (desc) puntosData[id].descripcion = desc;
                if (antesCoord !== puntosData[id].coordsUTM || antesDesc !== puntosData[id].descripcion) actualizados++;
                importados++;
            }
            markUnsavedChanges();
            guardarStorage();
            renderizarPuntos();
            actualizarDashboard();
            pintarEstadoCamposPuntos();
            let msg = `✅ Importados ${importados} puntos`;
            if (ignorados) msg += ` · ignorados ${ignorados}`;
            toast(msg, importados ? "success" : "error");
            if (noReconocidos.length) {
                const box = document.getElementById("infoMessagesStep2");
                if (box) box.innerHTML = `<div class="info-popup"><span>⚠️ <strong>Importación inteligente:</strong> se han ignorado IDs no reconocidos: ${noReconocidos.slice(0,8).join(", ")}${noReconocidos.length > 8 ? " ..." : ""}</span><button class="close-info">✖️</button></div>`;
                box?.querySelector(".close-info")?.addEventListener("click", () => box.innerHTML = "");
            }
        };
        reader.readAsArrayBuffer(file);
    }

    function importFromGPXKML(file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const content = e.target.result;
            const parser = new DOMParser();
            let xmlDoc;
            try {
                xmlDoc = parser.parseFromString(content, "text/xml");
            } catch(err) {
                toast("Error al parsear el archivo", "error");
                return;
            }
            let waypoints = xmlDoc.getElementsByTagName("wpt");
            if (waypoints.length === 0) {
                let placemarks = xmlDoc.getElementsByTagName("Placemark");
                if (placemarks.length > 0) procesarKML(placemarks);
                else toast("No se encontraron waypoints en el archivo", "error");
            } else procesarGPX(waypoints);
        };
        reader.readAsText(file);
    }

    function procesarGPX(waypoints) {
        let asignados = 0;
        for (let wp of waypoints) {
            let lat = parseFloat(wp.getAttribute("lat"));
            let lon = parseFloat(wp.getAttribute("lon"));
            if (isNaN(lat) || isNaN(lon)) continue;
            let nameElem = wp.getElementsByTagName("name")[0];
            let nombreCompleto = nameElem ? nameElem.textContent.trim() : "";
            if (!nombreCompleto) continue;
            let partes = nombreCompleto.split(/\s+/);
            let idCandidato = partes[0].toUpperCase();
            let descripcion = partes.slice(1).join(" ");
            if (puntosData[idCandidato]) {
                let coordFinal = latLonToCoordText(lat, lon);
                puntosData[idCandidato].coordsUTM = coordFinal;
                if (descripcion) puntosData[idCandidato].descripcion = descripcion;
                asignados++;
            }
        }
        markUnsavedChanges();
        guardarStorage();
        renderizarPuntos();
        actualizarDashboard();
        pintarEstadoCamposPuntos();
        toast(`✅ Importados ${asignados} puntos desde GPX`, "success");
    }

    function procesarKML(placemarks) {
        let asignados = 0;
        for (let pm of placemarks) {
            let nameElem = pm.getElementsByTagName("name")[0];
            let nombreCompleto = nameElem ? nameElem.textContent.trim() : "";
            if (!nombreCompleto) continue;
            let pointElem = pm.getElementsByTagName("Point")[0];
            if (!pointElem) continue;
            let coordsElem = pointElem.getElementsByTagName("coordinates")[0];
            if (!coordsElem) continue;
            let coordsText = coordsElem.textContent.trim();
            let parts = coordsText.split(/[ ,]+/);
            let lon = parseFloat(parts[0]);
            let lat = parseFloat(parts[1]);
            if (isNaN(lat) || isNaN(lon)) continue;
            let partesNombre = nombreCompleto.split(/\s+/);
            let idCandidato = partesNombre[0].toUpperCase();
            let descripcion = partesNombre.slice(1).join(" ");
            if (puntosData[idCandidato]) {
                let coordFinal = latLonToCoordText(lat, lon);
                puntosData[idCandidato].coordsUTM = coordFinal;
                if (descripcion) puntosData[idCandidato].descripcion = descripcion;
                asignados++;
            }
        }
        markUnsavedChanges();
        guardarStorage();
        renderizarPuntos();
        actualizarDashboard();
        pintarEstadoCamposPuntos();
        toast(`✅ Importados ${asignados} puntos desde KML`, "success");
    }

    function generarRecorridosBalanceados(numRecorridos) {
        const M = MODULOS;
        const P = PUNTOS_POR_MODULO;
        const R = numRecorridos;

        let puntosPorModulo = [];
        const base = Math.floor(R / P);
        const resto = R % P;
        for (let mod = 0; mod < M; mod++) {
            let lista = [];
            for (let punto = 1; punto <= P; punto++) for (let i = 0; i < base; i++) lista.push(punto);
            for (let punto = 1; punto <= resto; punto++) lista.push(punto);
            for (let i = lista.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [lista[i], lista[j]] = [lista[j], lista[i]];
            }
            puntosPorModulo.push(lista);
        }

        for (let mod = 1; mod < M; mod++) {
            const listaActual = puntosPorModulo[mod];
            const listaAnterior = puntosPorModulo[mod-1];
            let disponibles = [...listaActual];
            let nuevaLista = [];
            for (let i = 0; i < R; i++) {
                const anterior = listaAnterior[i];
                let contador = new Map();
                for (let j = 0; j < nuevaLista.length; j++) {
                    let key = `${listaAnterior[j]}-${nuevaLista[j]}`;
                    contador.set(key, (contador.get(key) || 0) + 1);
                }
                let mejorPunto = null;
                let mejorFrec = Infinity;
                for (let p of disponibles) {
                    let key = `${anterior}-${p}`;
                    let freq = contador.get(key) || 0;
                    if (freq < mejorFrec) {
                        mejorFrec = freq;
                        mejorPunto = p;
                    }
                }
                nuevaLista.push(mejorPunto);
                let idx = disponibles.indexOf(mejorPunto);
                if (idx !== -1) disponibles.splice(idx, 1);
            }
            puntosPorModulo[mod] = nuevaLista;
        }

        let recorridos = [];
        for (let i = 0; i < R; i++) {
            let comb = [];
            for (let mod = 0; mod < M; mod++) {
                let puntoNum = puntosPorModulo[mod][i];
                comb.push({ modulo: mod + 1, puntoNum, puntoId: getPuntoId(mod + 1, puntoNum) });
            }
            recorridos.push(comb);
        }

        for (let i = recorridos.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [recorridos[i], recorridos[j]] = [recorridos[j], recorridos[i]];
        }

        return recorridos;
    }

    async function generarQRDataURL(texto) {
        try { return await QRCode.toDataURL(texto, { width: 200, margin: 2 }); } catch(e) { return null; }
    }


    function eliminarTagWorksheet(xml, tagName) {
        const re = new RegExp(`<${tagName}\\b[^>]*(?:\\/>|>[\\s\\S]*?<\\/${tagName}>)`, 'g');
        return xml.replace(re, '');
    }

    function insertarBloqueImpresionWorksheet(xml, bloque) {
        const anclas = [
            'headerFooter', 'rowBreaks', 'colBreaks', 'customProperties',
            'cellWatches', 'ignoredErrors', 'smartTags', 'drawing', 'drawingHF',
            'picture', 'oleObjects', 'controls', 'webPublishItems', 'tableParts', 'extLst'
        ];

        for (const nombre of anclas) {
            const idx = xml.search(new RegExp(`<${nombre}(\\s|>|\\/)`));
            if (idx !== -1) return xml.slice(0, idx) + bloque + xml.slice(idx);
        }

        const fin = xml.indexOf('</worksheet>');
        if (fin !== -1) return xml.slice(0, fin) + bloque + xml.slice(fin);
        return xml;
    }

    function aplicarAjustePaginaSeguroEnWorksheet(xml, orientation = 'portrait') {
        // Se eliminan posibles etiquetas generadas previamente para evitar duplicados,
        // que son los que pueden provocar el aviso de recuperación de Excel.
        const orientacion = orientation === 'landscape' ? 'landscape' : 'portrait';
        xml = eliminarTagWorksheet(xml, 'printOptions');
        xml = eliminarTagWorksheet(xml, 'pageMargins');
        xml = eliminarTagWorksheet(xml, 'pageSetup');
        xml = eliminarTagWorksheet(xml, 'sheetPr');

        xml = xml.replace(
            /(<worksheet\b[^>]*>)/,
            '$1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>'
        );

        const bloqueImpresion = [
            '<printOptions horizontalCentered="1"/>',
            '<pageMargins left="0.20" right="0.20" top="0.30" bottom="0.30" header="0.10" footer="0.10"/>',
            `<pageSetup paperSize="9" orientation="${orientacion}" fitToWidth="1" fitToHeight="0"/>`
        ].join('');

        return insertarBloqueImpresionWorksheet(xml, bloqueImpresion);
    }

    async function prepararXlsxParaImpresionA4(excelData, orientation = 'portrait') {
        try {
            const orientacion = orientation === 'landscape' ? 'landscape' : 'portrait';
            const zipExcel = await JSZip.loadAsync(excelData);
            const hojas = zipExcel.folder('xl/worksheets');
            if (!hojas) return excelData;

            const promesas = [];
            hojas.forEach((relativePath, file) => {
                if (!/^sheet\d+\.xml$/i.test(relativePath)) return;
                promesas.push((async () => {
                    let xml = await file.async('string');
                    xml = aplicarAjustePaginaSeguroEnWorksheet(xml, orientacion);
                    zipExcel.file(`xl/worksheets/${relativePath}`, xml);
                })());
            });

            await Promise.all(promesas);
            return await zipExcel.generateAsync({ type: 'arraybuffer' });
        } catch (e) {
            console.warn('No se pudieron reforzar los ajustes de impresión A4:', e);
            return excelData;
        }
    }

    async function prepararXlsxParaImpresionA4Vertical(excelData) {
        return prepararXlsxParaImpresionA4(excelData, 'portrait');
    }

    async function prepararXlsxParaImpresionA4Horizontal(excelData) {
        return prepararXlsxParaImpresionA4(excelData, 'landscape');
    }

    function aplicarImpresionA4(ws, orientation = 'portrait') {
        if (!ws) return ws;
        const orientacion = orientation === 'landscape' ? 'landscape' : 'portrait';
        ws['!margins'] = { left: 0.20, right: 0.20, top: 0.30, bottom: 0.30, header: 0.10, footer: 0.10 };
        ws['!pageSetup'] = { paperSize: 9, orientation: orientacion, fitToWidth: 1, fitToHeight: 0 };
        return ws;
    }

    function aplicarImpresionA4Vertical(ws) {
        return aplicarImpresionA4(ws, 'portrait');
    }

    function aplicarImpresionA4Horizontal(ws) {
        return aplicarImpresionA4(ws, 'landscape');
    }

    function limpiarCeldasInternasDeMerges(ws, XLSXRef) {
        if (!ws || !Array.isArray(ws['!merges']) || !XLSXRef?.utils) return;
        ws['!merges'].forEach(m => {
            for (let r = m.s.r; r <= m.e.r; r++) {
                for (let c = m.s.c; c <= m.e.c; c++) {
                    if (r === m.s.r && c === m.s.c) continue;
                    delete ws[XLSXRef.utils.encode_cell({ r, c })];
                }
            }
        });
    }

    async function generarGPX() {
        let puntosConCoord = [];
        for (let [id, data] of Object.entries(puntosData)) {
            if (data.coordsUTM && esCoordenadaValida(data.coordsUTM, currentCoordType)) {
                let latlon = utmToLatLon(data.coordsUTM);
                if (latlon) puntosConCoord.push({ id, lat: latlon.lat, lon: latlon.lon, desc: data.descripcion });
            }
        }
        if (puntosConCoord.length === 0) return null;
        let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="MILITOPO" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Puntos MILITOPO</name></metadata>
  <trk><name>Recorrido MILITOPO</name><trkseg>`;
        puntosConCoord.forEach(p => {
            gpx += `<trkpt lat="${p.lat}" lon="${p.lon}"><name>${p.id}</name><desc>${escapeXml(p.desc)}</desc></trkpt>`;
        });
        gpx += `</trkseg></trk></gpx>`;
        return gpx;
    }

    function escapeXml(str) { return str.replace(/[<>&]/g, m => ({'<':'&lt;','>':'&gt;','&':'&amp;'})[m]); }

    async function generarPDFdePuntos() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        let y = 20;
        doc.setFontSize(18);
        doc.text("MILITOPO - Informe de puntos", 20, y);
        y += 10;
        doc.setFontSize(10);
        doc.text(`Generado: ${new Date().toLocaleString()}`, 20, y);
        y += 8;
        doc.text(`Estructura: ${MODULOS} módulos x ${PUNTOS_POR_MODULO} puntos = ${MODULOS * PUNTOS_POR_MODULO} puntos`, 20, y);
        y += 10;
        let puntosList = [];
        for (let m = 1; m <= MODULOS; m++) {
            for (let p = 1; p <= PUNTOS_POR_MODULO; p++) {
                let id = getPuntoId(m, p);
                let data = puntosData[id];
                puntosList.push({ id, coords: data.coordsUTM, desc: data.descripcion });
            }
        }
        doc.setFontSize(12);
        doc.text("Listado de puntos:", 20, y);
        y += 8;
        doc.setFontSize(9);
        for (let pt of puntosList) {
            let line = `${pt.id}: ${pt.coords} - ${pt.desc}`;
            let lines = doc.splitTextToSize(line, 170);
            if (y + lines.length * 5 > 280) { doc.addPage(); y = 20; }
            doc.text(lines, 20, y);
            y += lines.length * 5;
        }
        return doc.output('arraybuffer');
    }


    /* PDF PRINT-READY DOCUMENTS START */
    function normalizarTextoPdf(valor) {
        if (valor === null || valor === undefined) return "";
        return String(valor).replace(/\s+/g, " ").trim();
    }

    function crearDocumentoPdfA4(orientation = 'portrait') {
        const { jsPDF } = window.jspdf;
        const orientacion = orientation === 'landscape' ? 'l' : 'p';
        return new jsPDF(orientacion, 'mm', 'a4', true);
    }

    function altoLineaPdf(fontSize, factor = 1.18) {
        return fontSize * 0.352778 * factor;
    }

    function aplicarColorRellenoPdf(doc, color) {
        const c = Array.isArray(color) ? color : [255, 255, 255];
        doc.setFillColor(c[0], c[1], c[2]);
    }

    function aplicarColorTextoPdf(doc, color) {
        const c = Array.isArray(color) ? color : [0, 0, 0];
        doc.setTextColor(c[0], c[1], c[2]);
    }

    function prepararAnchosPdf(doc, colWidths, margin) {
        const pageW = doc.internal.pageSize.getWidth();
        const disponible = pageW - (margin * 2);
        const total = colWidths.reduce((a, b) => a + b, 0) || disponible;
        return colWidths.map(w => (w * disponible) / total);
    }

    function dibujarTituloPdf(doc, titulo, y, opciones = {}) {
        const pageW = doc.internal.pageSize.getWidth();
        const margin = opciones.margin ?? 8;
        const disponible = pageW - margin * 2;
        const fontSize = opciones.fontSize ?? 12;
        const padding = opciones.padding ?? 3;
        const subtitulo = opciones.subtitulo ? normalizarTextoPdf(opciones.subtitulo) : "";
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(fontSize);
        const lineas = doc.splitTextToSize(normalizarTextoPdf(titulo), disponible - padding * 2);
        const lineHeight = altoLineaPdf(fontSize, 1.16);
        let h = Math.max(13, lineas.length * lineHeight + padding * 2);
        if (subtitulo) h += 5;
        doc.setDrawColor(70, 84, 50);
        doc.setLineWidth(0.2);
        doc.setFillColor(62, 78, 45);
        doc.rect(margin, y, disponible, h, 'FD');
        doc.setTextColor(255, 246, 232);
        doc.text(lineas, pageW / 2, y + padding + lineHeight * 0.75, { align: 'center' });
        if (subtitulo) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(230, 188, 122);
            doc.text(subtitulo, pageW / 2, y + h - 3.2, { align: 'center' });
        }
        doc.setTextColor(0, 0, 0);
        return y + h + 3;
    }

    function dibujarBloqueNombrePdf(doc, y, nombre, opciones = {}) {
        const margin = opciones.margin ?? 8;
        const pageW = doc.internal.pageSize.getWidth();
        const disponible = pageW - margin * 2;
        const h = opciones.height ?? 12;
        doc.setDrawColor(185, 185, 185);
        doc.setFillColor(247, 247, 247);
        doc.rect(margin, y, disponible, h, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text(nombre, margin + 3, y + 7.8);
        return y + h + 3;
    }

    function renderTablaPdf(doc, opciones) {
        const margin = opciones.margin ?? 8;
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        const rows = (opciones.rows || []).map(row => row.map(normalizarTextoPdf));
        if (!rows.length) return;

        const headerRows = opciones.headerRows ?? 1;
        const colWidths = prepararAnchosPdf(doc, opciones.colWidths || Array(rows[0].length).fill(10), margin);
        const paddingX = opciones.paddingX ?? 1.4;
        const paddingY = opciones.paddingY ?? 1.5;
        const bodyFontSize = opciones.bodyFontSize ?? 8;
        const headerFontSize = opciones.headerFontSize ?? bodyFontSize;
        const minRowHeight = opciones.minRowHeight ?? 8;
        const alignments = opciones.alignments || [];
        const title = opciones.title || "";
        const subtitle = opciones.subtitle || "";
        let y = opciones.startY ?? margin;

        function medirFila(row, isHeader) {
            const fs = isHeader ? headerFontSize : bodyFontSize;
            doc.setFont('helvetica', isHeader ? 'bold' : 'normal');
            doc.setFontSize(fs);
            const lineHeight = altoLineaPdf(fs, isHeader ? 1.12 : 1.16);
            const lineas = row.map((cell, idx) => doc.splitTextToSize(cell, Math.max(2, colWidths[idx] - paddingX * 2)));
            const maxLineas = Math.max(1, ...lineas.map(l => l.length || 1));
            const h = Math.max(minRowHeight, (maxLineas * lineHeight) + paddingY * 2);
            return { h, lineas, lineHeight, fs };
        }

        function dibujarFila(row, rowIndex, isHeader) {
            const medicion = medirFila(row, isHeader);
            const h = Math.min(medicion.h, pageH - margin * 2);
            let x = margin;
            const rowFill = isHeader
                ? (opciones.headerFill || [217, 217, 217])
                : (opciones.rowFillCallback ? opciones.rowFillCallback(row, rowIndex - headerRows, rowIndex) : null);

            for (let c = 0; c < colWidths.length; c++) {
                const w = colWidths[c];
                const cellFill = opciones.cellFillCallback ? opciones.cellFillCallback(row, c, rowIndex - headerRows, rowIndex) : null;
                aplicarColorRellenoPdf(doc, cellFill || rowFill || [255, 255, 255]);
                doc.setDrawColor(172, 172, 172);
                doc.setLineWidth(0.18);
                doc.rect(x, y, w, h, 'FD');
                doc.setFont('helvetica', isHeader ? 'bold' : (c === 0 && opciones.boldFirstCol ? 'bold' : 'normal'));
                doc.setFontSize(isHeader ? headerFontSize : bodyFontSize);
                aplicarColorTextoPdf(doc, opciones.textColorCallback ? (opciones.textColorCallback(row, c, rowIndex - headerRows, rowIndex) || [0,0,0]) : [0,0,0]);
                const al = alignments[c] || 'center';
                const lineasCell = medicion.lineas[c] || [''];
                let textX = x + w / 2;
                const textY = y + paddingY + medicion.lineHeight * 0.78;
                const opts = { maxWidth: Math.max(2, w - paddingX * 2), align: al };
                if (al === 'left') textX = x + paddingX;
                if (al === 'right') textX = x + w - paddingX;
                doc.text(lineasCell, textX, textY, opts);
                x += w;
            }
            doc.setTextColor(0, 0, 0);
            y += h;
        }

        function nuevoEncabezadoPagina(cont) {
            if (cont) doc.addPage();
            y = cont ? margin : (opciones.startY ?? margin);
            if (title) y = dibujarTituloPdf(doc, cont ? `${title} · continuación` : title, y, {
                margin,
                fontSize: opciones.titleFontSize ?? 12,
                subtitulo: cont ? "" : subtitle
            });
            for (let i = 0; i < headerRows; i++) dibujarFila(rows[i], i, true);
        }

        nuevoEncabezadoPagina(false);
        for (let r = headerRows; r < rows.length; r++) {
            const h = medirFila(rows[r], false).h;
            if (y + h > pageH - margin) nuevoEncabezadoPagina(true);
            dibujarFila(rows[r], r, false);
        }
    }

    function calcularMarcadoresResultados(metricasRecorridos) {
        function getHighlightCounts(total) {
            if (total <= 10) return { montana: Math.min(1, total), faciles: Math.min(2, total), dificiles: Math.min(2, total) };
            if (total <= 25) return { montana: Math.min(2, total), faciles: Math.min(4, total), dificiles: Math.min(4, total) };
            if (total <= 50) return { montana: Math.min(5, total), faciles: Math.min(7, total), dificiles: Math.min(7, total) };
            return { montana: Math.min(8, total), faciles: Math.min(15, total), dificiles: Math.min(15, total) };
        }
        function normalizarResultado(value, values) {
            const validos = values.filter(v => Number.isFinite(v));
            if (!validos.length) return 0;
            const min = Math.min(...validos);
            const max = Math.max(...validos);
            if (max === min) return 0;
            return (value - min) / (max - min);
        }
        const ranking = (metricasRecorridos || []).map((m, idx) => ({
            idx,
            distancia: Number(m.distanciaKm || 0),
            positivo: Number(m.desnivelPositivo || 0),
            global: Number(m.desnivelGlobal || 0),
            negativo: Number(m.desnivelNegativo || 0)
        }));
        const valoresDistancia = ranking.map(x => x.distancia);
        const valoresPositivo = ranking.map(x => x.positivo);
        const valoresGlobal = ranking.map(x => x.global);
        const valoresNegativo = ranking.map(x => x.negativo);
        ranking.forEach(x => {
            x.score =
                (normalizarResultado(x.distancia, valoresDistancia) * 0.40) +
                (normalizarResultado(x.positivo, valoresPositivo) * 0.40) +
                (normalizarResultado(x.global, valoresGlobal) * 0.15) +
                (normalizarResultado(x.negativo, valoresNegativo) * 0.05);
        });
        const counts = getHighlightCounts(ranking.length);
        const usados = new Set();
        const montanaSet = new Set(ranking.slice().sort((a, b) => b.positivo - a.positivo || b.score - a.score).slice(0, counts.montana).map(x => x.idx));
        montanaSet.forEach(idx => usados.add(idx));
        const facilesSet = new Set();
        ranking.slice().sort((a, b) => a.score - b.score || a.positivo - b.positivo).forEach(x => {
            if (facilesSet.size >= counts.faciles || usados.has(x.idx)) return;
            facilesSet.add(x.idx); usados.add(x.idx);
        });
        const dificilesSet = new Set();
        ranking.slice().sort((a, b) => b.score - a.score || b.positivo - a.positivo).forEach(x => {
            if (dificilesSet.size >= counts.dificiles || usados.has(x.idx)) return;
            dificilesSet.add(x.idx); usados.add(x.idx);
        });
        return { montanaSet, facilesSet, dificilesSet };
    }

    function generarPdfBaliza(pid, titulo, filasFmt) {
        const doc = crearDocumentoPdfA4('portrait');
        renderTablaPdf(doc, {
            title: titulo,
            rows: filasFmt.slice(1),
            colWidths: [20, 26, 56, 72, 20],
            margin: 8,
            headerRows: 1,
            bodyFontSize: 7.6,
            headerFontSize: 7.6,
            minRowHeight: 9,
            boldFirstCol: true,
            alignments: ['center', 'center', 'center', 'center', 'center'],
            headerFill: [227, 227, 227]
        });
        return doc.output('arraybuffer');
    }

    function generarPdfHojaRecorrido(nombre, filasHojaFmt) {
        const doc = crearDocumentoPdfA4('portrait');
        let y = 8;
        y = dibujarTituloPdf(doc, `HOJA DE RECORRIDO: ${nombre}`, y, {
            margin: 8,
            fontSize: 13
        });
        y = dibujarBloqueNombrePdf(doc, y, "NOMBRE:", { margin: 8, height: 13 });
        renderTablaPdf(doc, {
            rows: filasHojaFmt.slice(1),
            colWidths: [16, 22, 56, 78, 22],
            margin: 8,
            startY: y,
            headerRows: 1,
            bodyFontSize: 8.6,
            headerFontSize: 8.6,
            minRowHeight: 12,
            boldFirstCol: true,
            alignments: ['center', 'center', 'center', 'center', 'center'],
            headerFill: [227, 227, 227]
        });
        return doc.output('arraybuffer');
    }

    function generarPdfRecorridosCompletos(tablaCodigosFmt) {
        const doc = crearDocumentoPdfA4('portrait');
        const modulos = Math.max(1, (tablaCodigosFmt[0] || []).length - 1);
        const fontSize = modulos <= 8 ? 7.8 : (modulos <= 12 ? 6.8 : (modulos <= 16 ? 5.9 : 5.2));
        renderTablaPdf(doc, {
            title: "RECORRIDOS COMPLETOS CON CÓDIGO",
            rows: tablaCodigosFmt,
            colWidths: [22, ...Array(modulos).fill((194 - 22) / modulos)],
            margin: 8,
            headerRows: 1,
            bodyFontSize: fontSize,
            headerFontSize: fontSize,
            minRowHeight: modulos > 14 ? 7 : 8,
            boldFirstCol: true,
            alignments: ['center', ...Array(modulos).fill('center')],
            headerFill: [227, 227, 227]
        });
        return doc.output('arraybuffer');
    }

    function generarPdfResultadosRecorridos(filasResultadosFmt, metricasRecorridos) {
        const doc = crearDocumentoPdfA4('landscape');
        const rows = filasResultadosFmt;
        renderTablaPdf(doc, {
            title: "RESULTADOS DE RECORRIDOS",
            rows,
            colWidths: [17, 28, 25, 25, 21, 23, 32, 31, 31, 31, 21],
            margin: 6,
            headerRows: 1,
            bodyFontSize: 7.1,
            headerFontSize: 6.8,
            minRowHeight: 8.5,
            boldFirstCol: true,
            alignments: ['center', 'center', 'center', 'center', 'center', 'center', 'center', 'center', 'center', 'center', 'center'],
            headerFill: [235, 235, 235],
            rowFillCallback: () => [255, 255, 255],
            cellFillCallback: () => null,
            textColorCallback: () => [0, 0, 0]
        });
        return doc.output('arraybuffer');
    }
    /* PDF PRINT-READY DOCUMENTS END */


    function haversineMeters(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const toRad = d => d * Math.PI / 180;
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    function parseUTMForDistance(coordStr) {
        if (!coordStr || typeof coordStr !== "string") return null;
        const txt = coordStr.trim().toUpperCase().replace(/\s+/g, " ");
        if (!/^(\d{1,2}[C-HJ-NP-X])\s+\d{6}\s+\d{7}$/.test(txt)) return null;
        const ll = utmToLatLon(txt);
        if (ll && Number.isFinite(ll.lat) && Number.isFinite(ll.lon)) return { lat: ll.lat, lon: ll.lon };
        return null;
    }

    async function parseMGRSForDistance(coordStr) {
        if (!coordStr || typeof coordStr !== "string") return null;
        const txt = coordStr.trim().toUpperCase().replace(/\s+/g, " ");
        if (!/^(\d{1,2}[C-HJ-NP-X])\s+[A-HJ-NP-Z]{2}\s+\d{1,5}\s+\d{1,5}$/.test(txt)) return null;
        try {
            const mgrsModule = await import('https://esm.sh/mgrs@2.1.0');
            const mgrsLib = mgrsModule.default || mgrsModule;
            const pt = mgrsLib.toPoint(txt);
            if (Array.isArray(pt) && pt.length >= 2) {
                const lon = pt[0], lat = pt[1];
                if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
            }
        } catch (e) {
            console.error("Error convirtiendo MGRS:", e);
        }
        return null;
    }

    async function coordToLatLonForDistance(coordStr) {
        const utm = parseUTMForDistance(coordStr);
        if (utm) return utm;
        return await parseMGRSForDistance(coordStr);
    }

    async function calcularDistanciaTotalRecorridoKm(recorrido) {
        let totalMeters = 0;
        for (let i = 0; i < recorrido.length - 1; i++) {
            const a = puntosData[recorrido[i].puntoId];
            const b = puntosData[recorrido[i + 1].puntoId];
            if (!a || !b || !a.coordsUTM || !b.coordsUTM) return "";
            const llA = await coordToLatLonForDistance(a.coordsUTM);
            const llB = await coordToLatLonForDistance(b.coordsUTM);
            if (!llA || !llB) return "";
            totalMeters += haversineMeters(llA.lat, llA.lon, llB.lat, llB.lon);
        }
        return (totalMeters / 1000).toFixed(3);
    }

    async function fetchElevationsForResults(coords) {
        if (!Array.isArray(coords) || coords.length === 0) return [];
        const batchSize = 100;
        const all = [];
        for (let i = 0; i < coords.length; i += batchSize) {
            const batch = coords.slice(i, i + batchSize);
            const latitudes = batch.map(c => c.lat.toFixed(6)).join(",");
            const longitudes = batch.map(c => c.lon.toFixed(6)).join(",");
            const url = `https://api.open-meteo.com/v1/elevation?latitude=${encodeURIComponent(latitudes)}&longitude=${encodeURIComponent(longitudes)}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error("No se pudo consultar la elevación.");
            const json = await res.json();
            if (!json || !Array.isArray(json.elevation)) throw new Error("Respuesta de elevación no válida.");
            if (json.elevation.length !== batch.length) throw new Error("La API de elevación devolvió un número inesperado de resultados.");
            all.push(...json.elevation);
        }
        return all;
    }

    async function calcularMetricasRecorridos(recorridos) {
        const pointKeyById = new Map();
        const uniqueCoords = [];
        const keyToIndex = new Map();

        for (const rec of recorridos) {
            for (const step of rec) {
                const pid = step.puntoId;
                if (pointKeyById.has(pid)) continue;
                const pdata = puntosData[pid];
                const ll = await coordToLatLonForDistance(pdata?.coordsUTM || "");
                if (!ll) {
                    pointKeyById.set(pid, null);
                    continue;
                }
                const key = `${ll.lat.toFixed(6)},${ll.lon.toFixed(6)}`;
                pointKeyById.set(pid, key);
                if (!keyToIndex.has(key)) {
                    keyToIndex.set(key, uniqueCoords.length);
                    uniqueCoords.push(ll);
                }
            }
        }

        const elevations = await fetchElevationsForResults(uniqueCoords);
        const results = [];

        for (const rec of recorridos) {
            let totalMeters = 0;
            let pos = 0;
            let neg = 0;

            for (let i = 0; i < rec.length - 1; i++) {
                const aId = rec[i].puntoId;
                const bId = rec[i + 1].puntoId;
                const aKey = pointKeyById.get(aId);
                const bKey = pointKeyById.get(bId);

                const aData = puntosData[aId];
                const bData = puntosData[bId];
                const llA = await coordToLatLonForDistance(aData?.coordsUTM || "");
                const llB = await coordToLatLonForDistance(bData?.coordsUTM || "");

                if (llA && llB) totalMeters += haversineMeters(llA.lat, llA.lon, llB.lat, llB.lon);

                if (!aKey || !bKey) continue;
                const aElev = elevations[keyToIndex.get(aKey)];
                const bElev = elevations[keyToIndex.get(bKey)];

                if (Number.isFinite(aElev) && Number.isFinite(bElev)) {
                    const diff = bElev - aElev;
                    if (diff > 0) pos += diff;
                    else if (diff < 0) neg += Math.abs(diff);
                }
            }

            results.push({
                distanciaKm: (totalMeters / 1000).toFixed(3),
                desnivelPositivo: Math.round(pos),
                desnivelNegativo: Math.round(neg),
                desnivelGlobal: Math.round(pos - neg)
            });
        }

        return results;
    }



    let previewRouteMap = null;
    let previewRouteLayerGroup = null;
    let previewTopoLayer = null;
    let previewRecorridosCache = null;
    let previewMetricasCache = null;

    function normalizarIdPuntoImportacion(raw) {
        let txt = String(raw || "").trim().toUpperCase();
        txt = txt.replace(/^ID\s*=\s*/i, "");
        txt = txt.replace(/\s+/g, "");
        return txt;
    }

    function clasificarDificultades(metricas) {
        /* DIFFICULTY SCORE PERCENT FORMULA START
           Fórmula normalizada entre recorridos:
           40% distancia total
           40% desnivel positivo acumulado
           15% desnivel global real, sin valor absoluto
           5% desnivel negativo acumulado
        */
        const baseItems = (metricas || []).map((m, i) => ({
            i,
            dist: Number(m.distanciaKm || 0),
            positivo: Number(m.desnivelPositivo || 0),
            global: Number(m.desnivelGlobal || 0),
            negativo: Number(m.desnivelNegativo || 0)
        }));

        if (!baseItems.length) return [];

        const normalizar = (value, values) => {
            const validos = values.filter(v => Number.isFinite(v));
            if (!validos.length) return 0;
            const min = Math.min(...validos);
            const max = Math.max(...validos);
            if (max === min) return 0;
            return (value - min) / (max - min);
        };

        const distancias = baseItems.map(x => x.dist);
        const positivos = baseItems.map(x => x.positivo);
        const globales = baseItems.map(x => x.global);
        const negativos = baseItems.map(x => x.negativo);

        const items = baseItems.map(x => ({
            ...x,
            score:
                (normalizar(x.dist, distancias) * 0.40) +
                (normalizar(x.positivo, positivos) * 0.40) +
                (normalizar(x.global, globales) * 0.15) +
                (normalizar(x.negativo, negativos) * 0.05)
        }));
        /* DIFFICULTY SCORE PERCENT FORMULA END */

        const sortedScores = items.map(x => x.score).slice().sort((a,b) => a-b);
        const q1 = sortedScores[Math.floor((sortedScores.length - 1) * 0.33)] || sortedScores[0];
        const q2 = sortedScores[Math.floor((sortedScores.length - 1) * 0.66)] || sortedScores[sortedScores.length - 1];
        return items.map(x => x.score <= q1 ? "BAJA" : (x.score <= q2 ? "MEDIA" : "ALTA"));
    }

    async function calcularResumenTecnicoPrevio() {
        const num = parseInt(document.getElementById("numRecorridos")?.value || "0", 10);
        if (!num || num < 1) return null;
        const recorridos = generarRecorridosBalanceados(num);
        const metricas = await calcularMetricasRecorridos(recorridos);
        const dificultades = clasificarDificultades(metricas);
        metricas.forEach((m, i) => m.dificultad = dificultades[i] || "MEDIA");
        previewRecorridosCache = recorridos;
        previewMetricasCache = metricas;

        const dists = metricas.map(m => Number(m.distanciaKm || 0)).filter(v => Number.isFinite(v) && v > 0);
        const desniveles = metricas.map(m => Number(m.desnivelGlobal || 0)).filter(v => Number.isFinite(v));
        const avgDist = dists.length ? (dists.reduce((a,b) => a+b,0) / dists.length).toFixed(3) : "--";
        const avgDes = desniveles.length ? Math.round(desniveles.reduce((a,b) => a+b,0) / desniveles.length) : "--";
        const maxDist = dists.length ? Math.max(...dists).toFixed(3) : "--";
        const minDist = dists.length ? Math.min(...dists).toFixed(3) : "--";
        const raros = detectarRecorridosRaros(metricas);
        return { recorridos, metricas, avgDist, avgDes, maxDist, minDist, raros };
    }

    async function renderResumenTecnicoPrevio() {
        const box = document.getElementById("resumenTecnicoContent");
        const avisosBox = document.getElementById("resumenTecnicoAvisos");
        if (!box || !avisosBox) return;
        box.innerHTML = `<div class="tech-item"><div class="k">Calculando</div><div class="v">...</div></div>`;
        avisosBox.innerHTML = "";
        try {
            const resumen = await calcularResumenTecnicoPrevio();
            if (!resumen) return;
            routeDetailsLastResumen = resumen;
            renderRouteDetailsPanel(resumen);
            const difs = (resumen.metricas || []).map(m => m.dificultad);
            const count = label => difs.filter(d => d === label).length;
            box.innerHTML = `
                <div class="tech-item"><div class="k">Recorridos</div><div class="v">${resumen.recorridos.length}</div></div>
                <div class="tech-item"><div class="k">Distancia media</div><div class="v">${resumen.avgDist} km</div></div>
                <div class="tech-item"><div class="k">Desnivel medio</div><div class="v">${resumen.avgDes} m</div></div>
                <div class="tech-item"><div class="k">Más corto / largo</div><div class="v">${resumen.minDist} / ${resumen.maxDist}</div></div>
                <div class="tech-item"><div class="k">Dificultad</div><div class="v">${count("BAJA")} / ${count("MEDIA")} / ${count("ALTA")}</div><div class="k">Baja / Media / Alta</div></div>
            `;
            if (resumen.raros.length) {
                avisosBox.innerHTML = `<div class="alert alert-error"><strong>⚠️ Aviso:</strong> recorridos raros en distancia o desnivel: ${resumen.raros.slice(0,6).join(" · ")}${resumen.raros.length > 6 ? " ..." : ""}</div>`;
            } else {
                avisosBox.innerHTML = `<div class="alert alert-success"><strong>Sin avisos:</strong> los recorridos salen equilibrados dentro de los márgenes previstos.</div>`;
            }
        } catch (err) {
            box.innerHTML = `<div class="tech-item"><div class="k">Error</div><div class="v">--</div></div>`;
            avisosBox.innerHTML = `<div class="alert alert-error">❌ No se pudo calcular el resumen técnico: ${err.message}</div>`;
        }
    }


    async function obtenerPuntosPreviewRecorrido(rec) {
        const points = [];
        const missing = [];
        for (let idxStep = 0; idxStep < rec.length; idxStep++) {
            const step = rec[idxStep];
            const pdata = puntosData[step.puntoId];
            const ll = await coordToLatLonForDistance(pdata?.coordsUTM || "");
            if (ll) {
                points.push({
                    orden: idxStep + 1,
                    puntoId: step.puntoId,
                    coord: pdata?.coordsUTM || "",
                    desc: pdata?.descripcion || "",
                    latlng: [ll.lat, ll.lon]
                });
            } else {
                missing.push(step.puntoId);
            }
        }
        return { points, missing };
    }

    async function abrirVistaPreviaRecorrido() {
        const modal = document.getElementById("previewRouteModal");
        const select = document.getElementById("previewRouteSelect");
        const info = document.getElementById("previewRouteInfo");
        const warn = document.getElementById("previewRouteWarnings");
        const compareSelect = document.getElementById("previewCompareRouteSelect");
        if (!modal || !select || !info || !warn || !compareSelect) {
            toast("❌ No se pudo abrir la vista previa del mapa", "error");
            return;
        }
        if (!previewRecorridosCache || !previewMetricasCache) await renderResumenTecnicoPrevio();
        const recorridos = previewRecorridosCache || [];
        const metricas = previewMetricasCache || [];
        select.innerHTML = "";
        compareSelect.innerHTML = '<option value="">Ninguno</option>';
        recorridos.forEach((r, i) => {
            const rid = `R${String(i + 1).padStart(2, "0")}`;
            const opt = document.createElement("option");
            opt.value = i;
            opt.textContent = rid;
            select.appendChild(opt);

            const optCmp = document.createElement("option");
            optCmp.value = i;
            optCmp.textContent = rid;
            compareSelect.appendChild(optCmp);
        });
        modal.style.display = "flex";

        if (previewRouteMap) {
            previewRouteMap.remove();
            previewRouteMap = null;
        }
        previewRouteMap = L.map("previewRouteMap").setView([40.4168, -3.7038], 6);

        const previewLayers = {
            topo: L.tileLayer('https://www.ign.es/wmts/mapa-raster?request=GetTile&service=WMTS&version=1.0.0&layer=MTN&style=default&format=image/jpeg&tilematrixset=GoogleMapsCompatible&tilematrix={z}&tilerow={y}&tilecol={x}', {
                attribution: '&copy; IGN',
                maxZoom: 20,
                minZoom: 4
            }),
            aerea: L.tileLayer('https://www.ign.es/wmts/pnoa-ma?request=GetTile&service=WMTS&version=1.0.0&layer=OI.OrthoimageCoverage&style=default&format=image/jpeg&tilematrixset=GoogleMapsCompatible&tilematrix={z}&tilerow={y}&tilecol={x}', {
                attribution: '&copy; IGN',
                maxZoom: 20,
                minZoom: 4
            }),
            mapant: L.tileLayer.wms('https://mapant.es/wms', {
                layers: 'mapant',
                format: 'image/png',
                transparent: false,
                version: '1.3.0',
                attribution: '&copy; <a href="https://mapant.es/">Mapant.es</a>'
            })
        };

        previewTopoLayer = previewLayers.topo;
        previewTopoLayer.addTo(previewRouteMap);
        previewRouteLayerGroup = L.layerGroup().addTo(previewRouteMap);

        document.querySelectorAll(".preview-layer-btn").forEach(btn => {
            btn.onclick = () => {
                const layerName = btn.getAttribute("data-preview-layer");
                Object.values(previewLayers).forEach(layer => {
                    if (previewRouteMap.hasLayer(layer)) previewRouteMap.removeLayer(layer);
                });
                previewLayers[layerName].addTo(previewRouteMap);
                document.querySelectorAll(".preview-layer-btn").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
            };
        });
        document.querySelector('.preview-layer-btn[data-preview-layer="topo"]')?.classList.add("active");

        setTimeout(() => previewRouteMap.invalidateSize(), 150);

        async function pintarRecorrido(idx) {
            previewRouteLayerGroup.clearLayers();
            const rec = recorridos[idx];
            const met = metricas[idx] || {};
            if (!rec) return;

            const principal = await obtenerPuntosPreviewRecorrido(rec);
            const latlngs = principal.points.map(p => p.latlng);
            const faltantes = [...principal.missing];

            for (const p of principal.points) {
                const icon = L.divIcon({
                    className: '',
                    html: `<div class="preview-order-icon">${p.orden}</div>`,
                    iconSize: [32, 32],
                    iconAnchor: [16, 16]
                });
                const marker = L.marker(p.latlng, { icon }).addTo(previewRouteLayerGroup);
                marker.bindPopup(`<strong>${p.orden}. ${p.puntoId}</strong><br>${p.coord}<br>${p.desc}`);
                marker.bindTooltip(`${p.orden}. ${p.puntoId}`, {
                    permanent: true,
                    direction: 'top',
                    offset: [0, -18],
                    className: 'preview-point-label'
                });
            }

            let boundsLatLngs = [...latlngs];
            if (latlngs.length) {
                L.polyline(latlngs, { weight: 4, opacity: 0.95 }).addTo(previewRouteLayerGroup);
            }

            const cmpVal = compareSelect.value;
            if (cmpVal !== "" && parseInt(cmpVal, 10) !== idx) {
                const cmpIdx = parseInt(cmpVal, 10);
                const cmpRec = recorridos[cmpIdx];
                const comparado = await obtenerPuntosPreviewRecorrido(cmpRec);
                const cmpLatLngs = comparado.points.map(p => p.latlng);
                boundsLatLngs.push(...cmpLatLngs);
                faltantes.push(...comparado.missing);

                for (const p of comparado.points) {
                    const icon = L.divIcon({
                        className: '',
                        html: `<div class="preview-order-icon" style="background:#d94f45">${p.orden}</div>`,
                        iconSize: [30, 30],
                        iconAnchor: [15, 15]
                    });
                    const marker = L.marker(p.latlng, { icon }).addTo(previewRouteLayerGroup);
                    marker.bindPopup(`<strong>Comp · ${p.orden}. ${p.puntoId}</strong><br>${p.coord}<br>${p.desc}`);
                    marker.bindTooltip(`${p.orden}. ${p.puntoId}`, {
                        permanent: true,
                        direction: 'top',
                        offset: [0, -18],
                        className: 'preview-point-label'
                    });
                }

                if (cmpLatLngs.length) {
                    L.polyline(cmpLatLngs, { weight: 3, opacity: 0.6, color: '#d94f45' }).addTo(previewRouteLayerGroup);
                }

                const met2 = metricas[cmpIdx] || {};
                info.innerHTML = `
                    <div class="preview-info-card principal">
                        <div class="t">Principal · R${String(idx + 1).padStart(2, "0")}</div>
                        <div class="l">Distancia: <span class="v">${met.distanciaKm || "--"} km</span></div>
                        <div class="l">Desnivel global: <span class="v">${met.desnivelGlobal || "--"} m</span></div>
                        <div class="l">Dificultad: <span class="v">${met.dificultad || "--"}</span></div>
                    </div>
                    <div class="preview-info-card comparado">
                        <div class="t">Comparado · R${String(cmpIdx + 1).padStart(2, "0")}</div>
                        <div class="l">Distancia: <span class="v">${met2.distanciaKm || "--"} km</span></div>
                        <div class="l">Desnivel global: <span class="v">${met2.desnivelGlobal || "--"} m</span></div>
                        <div class="l">Dificultad: <span class="v">${met2.dificultad || "--"}</span></div>
                    </div>
                `;
            } else {
                info.innerHTML = `
                    <div class="preview-info-card principal" style="grid-column:1 / -1;">
                        <div class="t">Principal · R${String(idx + 1).padStart(2, "0")}</div>
                        <div class="l">Distancia: <span class="v">${met.distanciaKm || "--"} km</span></div>
                        <div class="l">Desnivel global: <span class="v">${met.desnivelGlobal || "--"} m</span></div>
                        <div class="l">Dificultad: <span class="v">${met.dificultad || "--"}</span></div>
                    </div>
                `;
            }

            if (boundsLatLngs.length) {
                previewRouteMap.fitBounds(boundsLatLngs, { padding: [20,20] });
            }
            const faltantesUniq = [...new Set(faltantes)];
            warn.innerHTML = faltantesUniq.length ? `<div class="alert alert-error">⚠️ Sin conversión para: ${faltantesUniq.join(", ")}</div>` : "";
        }

        select.onchange = () => pintarRecorrido(parseInt(select.value, 10));
        compareSelect.onchange = () => pintarRecorrido(parseInt(select.value || "0", 10));
        pintarRecorrido(0);
    }


    /* ZIP SUCCESS CELEBRATION JS START */
    function launchZipSuccessCelebration() {
        document.querySelectorAll('.zip-celebration-overlay, .zip-confetti-piece').forEach(el => el.remove());

        const overlay = document.createElement('div');
        overlay.className = 'zip-celebration-overlay';
        overlay.innerHTML = `
            <div class="zip-celebration-card" role="status" aria-live="polite">
                <div class="zip-celebration-icon">📦</div>
                <div class="zip-celebration-title">ZIP descargado</div>
                <div class="zip-celebration-text">Archivos generados correctamente. MILITOPO ha completado la misión.</div>
                <div class="zip-celebration-progress"><span></span></div>
            </div>
        `;
        document.body.appendChild(overlay);

        const pieces = ['📁', '🗺️', '📄', '✅', '✨', '📦', '🎯'];
        for (let i = 0; i < 30; i++) {
            const piece = document.createElement('div');
            piece.className = 'zip-confetti-piece';
            piece.textContent = pieces[i % pieces.length];
            piece.style.setProperty('--x', `${Math.random() * 100}vw`);
            piece.style.setProperty('--dx', `${(Math.random() * 140) - 70}px`);
            piece.style.setProperty('--s', `${16 + Math.random() * 18}px`);
            piece.style.setProperty('--r', `${Math.random() * 180}deg`);
            piece.style.setProperty('--d', `${2.4 + Math.random() * 1.6}s`);
            piece.style.animationDelay = `${Math.random() * .55}s`;
            document.body.appendChild(piece);
        }

        setTimeout(() => {
            overlay.remove();
            document.querySelectorAll('.zip-confetti-piece').forEach(el => el.remove());
        }, 4300);
    }
    /* ZIP SUCCESS CELEBRATION JS END */


    async function generarTodo() {
        let num = parseInt(document.getElementById("numRecorridos").value);
        if (isNaN(num) || num < 1 || num > 100) throw new Error("Número entre 1 y 100");
        let v = verificarCompletos();
        if (!v.ok) throw new Error(`Faltan ${v.faltantes.length} puntos por completar o coordenadas inválidas`);
        let tipo = currentCoordType;

        const divRes = document.getElementById("resultadosGen");
        divRes.innerHTML = `<div class="progress-bar"><div class="progress-fill" style="width: 0%"></div></div><div id="progressMsg" style="font-family:monospace; font-size:0.8rem; margin-top:8px;">Iniciando...</div>`;
        const progressFill = divRes.querySelector('.progress-fill');
        const progressMsg = document.getElementById("progressMsg");
        function setProgress(percent, msg) { progressFill.style.width = `${percent}%`; progressMsg.innerText = msg; }

        setProgress(5, "Usando los últimos recorridos calculados en el paso 3...");
        let recorridos = getRoutesForZip(num);
        previewRecorridosCache = recorridos;
        let codigos = [];
        for (let i = 0; i < recorridos.length; i++) {
            let m = {};
            for (let p of recorridos[i]) m[p.puntoId] = codigo3();
            codigos.push(m);
        }

        setProgress(20, "Creando documentos PDF listos para imprimir...");
        let balizas = new Map();
        for (let idx = 0; idx < recorridos.length; idx++) {
            let rec = recorridos[idx], codMap = codigos[idx];
            for (let i = 0; i < rec.length; i++) {
                let act = rec[i], ult = i === rec.length - 1, sig = ult ? null : rec[i + 1];
                if (!balizas.has(act.puntoId)) balizas.set(act.puntoId, []);
                balizas.get(act.puntoId).push({ rid: `R${String(idx + 1).padStart(2, '0')}`, final: ult, sig: sig, cod: codMap[act.puntoId], puntoId: act.puntoId });
            }
        }

        let zip = new JSZip();
        let organizadoresFolder = zip.folder("Organizadores");

        setProgress(15, "Generando informe PDF...");
        const pdfBuffer = await generarPDFdePuntos();
        organizadoresFolder.file("Informe_Puntos.pdf", pdfBuffer, { binary: true });

        setProgress(18, "Generando archivo GPX...");
        const gpxContent = await generarGPX();
        if (gpxContent) organizadoresFolder.file("Puntos_MILITOPO.gpx", gpxContent);

        let tablaCodigos = [["Recorrido"]];
        for (let m = 1; m <= MODULOS; m++) tablaCodigos[0].push(`Módulo ${m}`);
        for (let r = 0; r < recorridos.length; r++) {
            let fila = [`R${String(r + 1).padStart(2, '0')}`];
            for (let m = 1; m <= MODULOS; m++) {
                let p = recorridos[r].find(p => p.modulo === m);
                fila.push(p ? `${p.puntoId} (${codigos[r][p.puntoId]})` : "-");
            }
            tablaCodigos.push(fila);
        }
        const tablaCodigosFmt = tablaCodigos.map(row => row.map(v => (v === null || v === undefined) ? "" : String(v)));
        const codigosPdf = generarPdfRecorridosCompletos(tablaCodigosFmt);
        organizadoresFolder.file("Recorridos completos con código.pdf", codigosPdf, { binary: true });

        const metricasRecorridos = await calcularMetricasRecorridos(recorridos);
        const dificultadesRecorridos = clasificarDificultades(metricasRecorridos);
        metricasRecorridos.forEach((m, i) => m.dificultad = dificultadesRecorridos[i] || "MEDIA");

        const filasResultados = [[
            "Recorrido",
            "Nombre",
            "Hora de salida",
            "Hora de llegada",
            "Puntos obtenidos",
            "Tiempo total",
            "Distancia total (km)",
            "Desnivel positivo (m)",
            "Desnivel negativo (m)",
            "Desnivel global (m)",
            "Dificultad"
        ]];

        for (let i = 0; i < recorridos.length; i++) {
            const m = metricasRecorridos[i] || {};
            filasResultados.push([
                `R${String(i + 1).padStart(2, '0')}`,
                "",
                "",
                "",
                "",
                "",
                m.distanciaKm ?? "",
                m.desnivelPositivo ?? "",
                m.desnivelNegativo ?? "",
                ((Number(m.desnivelPositivo ?? 0)) - (Number(m.desnivelNegativo ?? 0))),
                m.dificultad || "MEDIA"
            ]);
        }

        const filasResultadosFmt = filasResultados.map(row => row.map(v => (v === null || v === undefined) ? "" : String(v)));
        const resultadosPdf = generarPdfResultadosRecorridos(filasResultadosFmt, metricasRecorridos);
        organizadoresFolder.file("Resultados de recorridos.pdf", resultadosPdf, { binary: true });
        setProgress(40, "Generando balizas en PDF...");
        let balizasFolder = zip.folder("Balizas");
        let normalFolder = balizasFolder.folder("topografica_normal (con brujula)");
        let puntosArray = Object.keys(puntosData);
        let balizasGeneradas = 0;
        for (let pid of puntosArray) {
            let lista = balizas.get(pid) || [];
            let pd = puntosData[pid] || { descripcion: "" };
            let titulo = `BALIZA ${pid}: ${pd.coordsUTM || "---"} - ${pd.descripcion.toUpperCase()}`;
            let tabla = [["Recorrido", "Siguiente Punto", "Coordenadas siguiente", "Descripción siguiente", `Código (${pid})`]];
            for (let it of lista) {
                if (it.final) tabla.push([it.rid, "FINAL", "---", `PUNTO FINAL - ${pid}`, it.cod]);
                else if (it.sig) {
                    let sd = puntosData[it.sig.puntoId] || { descripcion: "?", coordsUTM: "" };
                    tabla.push([it.rid, it.sig.puntoId, formatearCoord(sd.coordsUTM, tipo), `${it.sig.puntoId} - ${sd.descripcion}`, it.cod]);
                }
            }
            let filas = [[titulo], tabla[0], ...tabla.slice(1)];
            const filasFmt = filas.map(row => row.map(v => (v === null || v === undefined) ? "" : String(v)));
            const balizaPdf = generarPdfBaliza(pid, titulo, filasFmt);
            normalFolder.file(`Baliza_${pid}.pdf`, balizaPdf, { binary: true });

            balizasGeneradas++;
            setProgress(40 + Math.floor((balizasGeneradas / puntosArray.length) * 30), `Generando balizas normales en PDF... (${balizasGeneradas}/${puntosArray.length})`);
        }

        setProgress(70, "Creando hojas de recorrido en PDF...");
        let hojasFolder = zip.folder("Hojas_Recorrido");
        for (let r = 0; r < recorridos.length; r++) {
            let nombre = `R${String(r + 1).padStart(2, '0')}`;
            let primerPunto = recorridos[r][0];
            let dp = puntosData[primerPunto.puntoId];
            let filasHoja = [
                [`HOJA DE RECORRIDO: ${nombre}`, "", "", "NOMBRE:", ""],
                ["ORDEN", "BALIZA", "COORDENADAS", "DESCRIPCIÓN", "CÓDIGO"],
                ["1º", primerPunto.puntoId, formatearCoord(dp.coordsUTM, tipo), `${primerPunto.puntoId} - ${dp.descripcion}`, ""]
            ];
            for (let i = 2; i <= MODULOS; i++) filasHoja.push([i + "º", "", "", "", ""]);

            const filasHojaFmt = filasHoja.map(row => row.map(v => (v === null || v === undefined) ? "" : String(v)));
            const hojaPdf = generarPdfHojaRecorrido(nombre, filasHojaFmt);
            hojasFolder.file(`Hoja_${nombre}.pdf`, hojaPdf, { binary: true });
        }

        setProgress(95, "Comprimiendo archivos...");
        let content = await zip.generateAsync({ type: "blob" });
        saveAs(content, `MILITOPO_${MODULOS}mod_${PUNTOS_POR_MODULO}puntos_${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.zip`);
        setProgress(100, "¡Completado!");
        document.getElementById("zipNotification").innerHTML = `<div class="alert alert-success">✅ ZIP descargado correctamente. MILITOPO ha completado la misión.</div>`;
        launchZipSuccessCelebration();
        setTimeout(() => { divRes.innerHTML = ""; }, 3000);
        return zip;
    }

    function updateCoordPreview(text) {
        const coordLabel = currentCoordType === "UTM" ? "UTM" : "MGRS";
        const el = document.getElementById("coordPreview");
        if (!el) return;
        el.textContent = text && text !== "--" ? `${coordLabel}: ${text}` : "--";
    }

    function updateMouseCoordDisplay(text) {
        const el = document.getElementById("coordMouseDisplay");
        if (!el) return;
        el.textContent = text && text !== "--" ? text : "--";
    }

    function getMapPointStatus(pointId) {
        const data = puntosData[pointId] || {};
        const coordNorm = normalizarCoordParaComparar(data.coordsUTM || "");
        const coordOk = coordNorm !== "" && esCoordenadaValida(coordNorm, currentCoordType);
        const descOk = !!(data.descripcion && data.descripcion.trim() !== "");
        const faltas = [];
        if (!coordNorm) faltas.push("coordenadas");
        else if (!coordOk) faltas.push("coordenada válida");
        if (!descOk) faltas.push("descripción");
        return { complete: coordOk && descOk, coordOk, descOk, faltas };
    }

    function refreshMapPointSelectorState() {
        const select = document.getElementById("mapPointSelect");
        if (!select) return;
        const selectedPoint = select.value;
        Array.from(select.options).forEach(opt => {
            const st = getMapPointStatus(opt.value);
            opt.textContent = (st.complete ? "✅ " : "❌ ") + opt.value;
        });
        const statusCard = document.getElementById("mapPointStatusCard");
        if (!statusCard || !selectedPoint) return;
        const st = getMapPointStatus(selectedPoint);
        statusCard.classList.toggle("complete", st.complete);
        statusCard.classList.toggle("incomplete", !st.complete);
        const icon = statusCard.querySelector(".map-point-status-icon");
        const title = statusCard.querySelector(".map-point-status-title");
        const detail = statusCard.querySelector(".map-point-status-detail");
        if (icon) icon.textContent = st.complete ? "✓" : "✕";
        if (title) title.textContent = st.complete ? `${selectedPoint} completa` : `${selectedPoint} incompleta`;
        if (detail) detail.textContent = st.complete ? "Coordenadas y descripción listas" : "Falta: " + st.faltas.join(" y ");
    }

    function updatePreviewFromSelectedPoint() {
        const select = document.getElementById("mapPointSelect");
        const selectedPoint = select ? select.value : "";
        const data = puntosData[selectedPoint];
        if (data && data.coordsUTM && data.coordsUTM.trim() !== "") updateCoordPreview(data.coordsUTM);
        else updateCoordPreview("--");
        refreshMapPointSelectorState();
    }

    function focusSelectedMapPoint({ showToast = true } = {}) {
        const select = document.getElementById("mapPointSelect");
        const selectedPoint = select ? select.value : "";
        if (!selectedPoint || !map) return;
        const latlng = getLatLngForPoint(selectedPoint);
        if (!latlng) {
            if (showToast) toast(`❌ ${selectedPoint} aún no tiene coordenadas válidas para hacer zoom`, "error");
            return;
        }
        updateMarkerForPoint(selectedPoint);
        const marker = findMarkerByPointId(selectedPoint);
        map.setView(latlng, Math.max(map.getZoom(), 17), { animate: true });
        if (marker) marker.openPopup();
    }

    function getLatLngForPoint(pointId) {
        const data = puntosData[pointId] || {};
        if (data.latlng && Array.isArray(data.latlng) && data.latlng.length === 2) {
            return L.latLng(data.latlng[0], data.latlng[1]);
        }
        const coord = (data.coordsUTM || "").trim();
        if (!coord || !esCoordenadaValida(coord, currentCoordType)) return null;
        if (currentCoordType === "UTM") {
            const latlon = utmToLatLon(coord);
            if (latlon) return L.latLng(latlon.lat, latlon.lon);
        }
        return null;
    }

    function syncMapPointInputs(pointId) {
        const pointData = puntosData[pointId] || { coordsUTM: "", descripcion: "" };
        document.querySelectorAll(`.map-coord-inp[data-id="${pointId}"]`).forEach(inp => inp.value = pointData.coordsUTM || "");
        document.querySelectorAll(`.map-desc-inp[data-id="${pointId}"]`).forEach(ta => ta.value = pointData.descripcion || "");
        const st = getMapPointStatus(pointId);
        document.querySelectorAll(`.map-punto-card[data-punto-id="${pointId}"] .map-punto-badge`).forEach(badge => {
            badge.textContent = st.complete ? "✓" : "✕";
            badge.classList.toggle("complete", st.complete);
            badge.classList.toggle("incomplete", !st.complete);
        });
    }

    function updateMarkerForPoint(pointId, options = {}) {
        if (!map) return;
        const latlng = getLatLngForPoint(pointId);
        if (!latlng) {
            removeMarkerByPointId(pointId);
            return;
        }
        let marker = findMarkerByPointId(pointId);
        if (marker) {
            marker.setLatLng(latlng);
            refreshMarkerPopup(marker);
        } else {
            marker = createDraggableMarker(latlng, pointId);
        }
        if (options.focus) {
            map.setView(latlng, Math.max(map.getZoom(), 15));
            marker.openPopup();
        }
    }

    function updateAllMapMarkers() {
        if (!map) return;
        const validIds = new Set();
        for (let m = 1; m <= MODULOS; m++) {
            for (let p = 1; p <= PUNTOS_POR_MODULO; p++) {
                const id = getPuntoId(m, p);
                const latlng = getLatLngForPoint(id);
                if (latlng) {
                    validIds.add(id);
                    if (permanentMarkersByPoint[id]) {
                        permanentMarkersByPoint[id].setLatLng(latlng);
                        refreshMarkerPopup(permanentMarkersByPoint[id]);
                    } else {
                        createDraggableMarker(latlng, id);
                    }
                }
            }
        }
        Object.keys(permanentMarkersByPoint).forEach(id => {
            if (!validIds.has(id)) removeMarkerByPointId(id);
        });
    }

    function renderMapManualEditor() {
        const container = document.getElementById("mapPuntosGrid");
        if (!container) return;
        container.innerHTML = "";

        for (let m = 1; m <= MODULOS; m++) {
            const moduloDiv = document.createElement("div");
            moduloDiv.className = "map-modulo-item";

            const summary = document.createElement("div");
            summary.className = "map-modulo-summary";
            summary.innerHTML = `<span>📦 Módulo ${m}</span><span class="indicador">▼</span>`;

            const contentDiv = document.createElement("div");
            contentDiv.className = "map-modulo-content";

            const grid = document.createElement("div");
            grid.className = "map-puntos-grid";

            for (let p = 1; p <= PUNTOS_POR_MODULO; p++) {
                const id = getPuntoId(m, p);
                const data = puntosData[id] || { coordsUTM: "", descripcion: "" };
                const st = getMapPointStatus(id);
                const card = document.createElement("div");
                card.className = "map-punto-card";
                card.setAttribute("data-punto-id", id);
                card.innerHTML = `
                    <div class="map-punto-title">
                        <span>🔵 ${id}</span>
                        <span class="map-punto-badge ${st.complete ? "complete" : "incomplete"}">${st.complete ? "✓" : "✕"}</span>
                    </div>
                    <input type="text" class="map-coord-inp" data-id="${id}" value="${escapeHtml(data.coordsUTM || "")}" placeholder="${currentCoordType === 'UTM' ? '30T 450000 4780000' : '30S XJ 12345 12345'}">
                    <textarea rows="2" class="map-desc-inp" data-id="${id}" placeholder="Descripción del punto">${escapeHtml(data.descripcion || "")}</textarea>
                `;
                grid.appendChild(card);
            }

            contentDiv.appendChild(grid);
            moduloDiv.appendChild(summary);
            moduloDiv.appendChild(contentDiv);
            container.appendChild(moduloDiv);

            summary.addEventListener("click", () => {
                const isOpen = contentDiv.style.display === "block";
                contentDiv.style.display = isOpen ? "none" : "block";
                summary.querySelector(".indicador").textContent = isOpen ? "▼" : "▲";
            });
        }

        document.querySelectorAll(".map-coord-inp").forEach(inp => {
            const commit = () => {
                const pid = inp.getAttribute("data-id");
                if (!pid) return;
                if (!puntosData[pid]) puntosData[pid] = { coordsUTM: "", descripcion: "" };
                let formatted = currentCoordType === 'UTM' ? formatUTM(inp.value) : formatMGRS(inp.value);
                if (formatted !== '') inp.value = formatted;
                puntosData[pid].coordsUTM = inp.value;
                if (puntosData[pid].latlng) delete puntosData[pid].latlng;
                guardarStorage();
                syncPointInputs(pid);
                syncMapPointInputs(pid);
                actualizarDashboard();
                refreshMapPointSelectorState();
                updateMarkerForPoint(pid);
                if (document.getElementById("mapPointSelect")?.value === pid) updatePreviewFromSelectedPoint();
            };
            inp.addEventListener("input", () => {
                const pid = inp.getAttribute("data-id");
                if (!pid) return;
                if (!puntosData[pid]) puntosData[pid] = { coordsUTM: "", descripcion: "" };
                puntosData[pid].coordsUTM = inp.value;
                if (puntosData[pid].latlng) delete puntosData[pid].latlng;
                markUnsavedChanges();
                syncPointInputs(pid);
                syncMapPointInputs(pid);
                refreshMapPointSelectorState();
            });
            inp.addEventListener("blur", commit);
            inp.addEventListener("change", commit);
        });

        document.querySelectorAll(".map-desc-inp").forEach(ta => {
            const commit = () => {
                const pid = ta.getAttribute("data-id");
                if (!pid) return;
                if (!puntosData[pid]) puntosData[pid] = { coordsUTM: "", descripcion: "" };
                puntosData[pid].descripcion = ta.value;
                guardarStorage();
                syncPointInputs(pid);
                syncMapPointInputs(pid);
                actualizarDashboard();
                refreshMapPointSelectorState();
                const marker = findMarkerByPointId(pid);
                if (marker) refreshMarkerPopup(marker);
            };
            ta.addEventListener("input", () => {
                const pid = ta.getAttribute("data-id");
                if (!pid) return;
                if (!puntosData[pid]) puntosData[pid] = { coordsUTM: "", descripcion: "" };
                puntosData[pid].descripcion = ta.value;
                markUnsavedChanges();
                syncPointInputs(pid);
                syncMapPointInputs(pid);
                refreshMapPointSelectorState();
            });
            ta.addEventListener("blur", commit);
            ta.addEventListener("change", commit);
        });
    }

    function syncPointInputs(pointId) {
        const pointData = puntosData[pointId] || { coordsUTM: "", descripcion: "" };
        const coordInput = document.querySelector(`.coord-inp[data-id="${pointId}"]`);
        const descTextarea = document.querySelector(`.desc-inp[data-id="${pointId}"]`);
        if (coordInput) coordInput.value = pointData.coordsUTM || "";
        if (descTextarea) descTextarea.value = pointData.descripcion || "";
        if (typeof syncMapPointInputs === "function") syncMapPointInputs(pointId);
    }

    function findMarkerByPointId(pointId) {
        return permanentMarkersByPoint[pointId] || null;
    }

    function removeMarkerByPointId(pointId) {
        const marker = findMarkerByPointId(pointId);
        if (!marker || !map) return;
        map.removeLayer(marker);
        delete permanentMarkersByPoint[pointId];
        permanentMarkers = permanentMarkers.filter(m => m.pointId !== pointId);
    }

    function buildModernPointPopup(pointId, coordText, descripcionActual) {
        return `
            <div class="point-popup-card">
                <div class="point-popup-head">
                    <div class="point-popup-title">
                        <span class="point-popup-pin"></span>
                        <span>Punto ${pointId}</span>
                    </div>
                    <div class="point-popup-coord">
                        <span class="point-popup-label">Coordenadas</span>
                        <span class="point-popup-value">${coordText}</span>
                    </div>
                </div>
                <div class="point-popup-body">
                    <div class="point-popup-desc-row">
                        <span class="point-popup-desc-title">Editar descripción</span>
                        <span class="point-popup-save-hint">Se guarda al salir</span>
                    </div>
                    <textarea class="popup-desc-input point-popup-textarea" placeholder="Añade referencia del terreno, cota, cruce, fuente...">${escapeHtml(descripcionActual)}</textarea>
                    <div class="point-popup-actions">
                        <button class="point-popup-delete" onclick="window.eliminarPunto('${pointId}')">🗑️ Eliminar punto</button>
                        <span class="point-popup-drag">✅ Arrastrar el icono azul para mover la baliza</span>
                    </div>
                </div>
            </div>
        `;
    }

    function bindModernPointPopup(marker, pointId, coordText, descripcionActual) {
        marker.bindPopup(buildModernPointPopup(pointId, coordText, descripcionActual), {
            className: "modern-point-popup",
            maxWidth: 330,
            minWidth: 260,
            closeButton: true,
            autoPan: true
        });
    }

    function refreshMarkerPopup(marker) {
        if (!marker) return;
        const pointId = marker.pointId;
        const coordText = latLonToCoordText(marker.getLatLng().lat, marker.getLatLng().lng);
        const descripcionActual = puntosData[pointId] ? puntosData[pointId].descripcion : "";
        bindModernPointPopup(marker, pointId, coordText, descripcionActual);
        enlazarGuardadoDescripcionPopup(marker, pointId);
    }

    function persistPointLocation(pointId, latlng, extra = {}) {
        if (!puntosData[pointId]) puntosData[pointId] = { coordsUTM: "", descripcion: "" };
        puntosData[pointId].coordsUTM = latLonToCoordText(latlng.lat, latlng.lng);
        puntosData[pointId].latlng = [latlng.lat, latlng.lng];
        if (typeof extra.descripcion === "string") puntosData[pointId].descripcion = extra.descripcion;
        guardarStorage();
        syncPointInputs(pointId);
        if (typeof syncMapPointInputs === "function") syncMapPointInputs(pointId);
        actualizarDashboard();
        refreshMapPointSelectorState();
        if (document.getElementById("mapPointSelect")?.value === pointId) updateCoordPreview(puntosData[pointId].coordsUTM);
        const marker = findMarkerByPointId(pointId);
        if (marker) refreshMarkerPopup(marker);
    }

    window.eliminarPunto = function(pointId) {
        if (!confirm(`¿Eliminar el punto ${pointId}? Se borrarán sus coordenadas y descripción.`)) return;
        removeMarkerByPointId(pointId);
        if (!puntosData[pointId]) puntosData[pointId] = { coordsUTM: "", descripcion: "" };
        puntosData[pointId].coordsUTM = "";
        puntosData[pointId].descripcion = "";
        puntosData[pointId].latlng = null;
        guardarStorage();
        syncPointInputs(pointId);
        if (typeof syncMapPointInputs === "function") syncMapPointInputs(pointId);
        actualizarDashboard();
        refreshMapPointSelectorState();
        if (document.getElementById("mapPointSelect")?.value === pointId) updateCoordPreview("--");
        toast(`✅ Punto ${pointId} eliminado correctamente`, "success");
    };

    function guardarDescripcionPunto(pointId, nuevaDesc) {
        if (!puntosData[pointId]) puntosData[pointId] = { coordsUTM: "", descripcion: "" };
        puntosData[pointId].descripcion = nuevaDesc;
        guardarStorage();
        const descTextarea = document.querySelector(`.desc-inp[data-id="${pointId}"]`);
        if (descTextarea) descTextarea.value = nuevaDesc;
        if (typeof syncMapPointInputs === "function") syncMapPointInputs(pointId);
        actualizarDashboard();
        refreshMapPointSelectorState();
    }

    function enlazarGuardadoDescripcionPopup(marker, pointId) {
        marker.off('popupopen');
        marker.on('popupopen', () => {
            const popupEl = marker.getPopup() ? marker.getPopup().getElement() : null;
            if (!popupEl) return;
            const input = popupEl.querySelector('.popup-desc-input');
            if (!input || input.dataset.bound === '1') return;
            input.dataset.bound = '1';
            const guardar = () => {
                guardarDescripcionPunto(pointId, input.value);
                updateMarkerPopup(marker, pointId);
            };
            input.addEventListener('blur', guardar);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    input.blur();
                }
            });
        });
    }

    function updateMarkerPopup(marker, pointId) {
        const coordText = latLonToCoordText(marker.getLatLng().lat, marker.getLatLng().lng);
        const descripcionActual = puntosData[pointId] ? puntosData[pointId].descripcion : "";
        bindModernPointPopup(marker, pointId, coordText, descripcionActual);
        enlazarGuardadoDescripcionPopup(marker, pointId);
    }

    function createDraggableMarker(latlng, pointId) {
        const markerHtml = `<div class="map-blue-marker"><span class="map-blue-pin"></span><span class="map-blue-label">${pointId}</span></div>`;
        const icon = L.divIcon({ html: markerHtml, className: 'map-blue-marker-container', iconSize: [54, 22], iconAnchor: [7, 16], popupAnchor: [0, -16] });
        const marker = L.marker(latlng, { icon: icon, draggable: true }).addTo(map);
        marker.pointId = pointId;
        permanentMarkersByPoint[pointId] = marker;
        permanentMarkers.push(marker);

        refreshMarkerPopup(marker);
        let originalLatLng = marker.getLatLng();

        marker.on('click', () => refreshMarkerPopup(marker));
        marker.on('dragstart', () => { originalLatLng = marker.getLatLng(); });

        marker.on('dragend', () => {
            const newLatLng = marker.getLatLng();
            const newCoordText = latLonToCoordText(newLatLng.lat, newLatLng.lng);
            const confirmMove = confirm(`¿Mover punto ${pointId} a la nueva ubicación?\nNueva coordenada: ${newCoordText}`);
            if (confirmMove) {
                persistPointLocation(pointId, newLatLng);
                marker.openPopup();
                toast(`✅ ${pointId} movido a ${newCoordText}`, "success");
            } else {
                marker.setLatLng(originalLatLng);
                refreshMarkerPopup(marker);
            }
        });

        return marker;
    }

    function loadPersistentMarkers() {
        if (!map) return;
        permanentMarkers.forEach(m => map.removeLayer(m));
        permanentMarkers = [];
        permanentMarkersByPoint = {};
        updateAllMapMarkers();
    }

    function showGeoBanner(message, type = "error", showRetry = false) {
        const banner = document.getElementById("geoStatusBanner");
        if (!banner) return;
        banner.className = `geo-status-banner ${type}`;
        banner.innerHTML = `<span>${message}</span>${showRetry ? '<button id="geoRetryBtn" type="button">Reintentar</button>' : '<button id="geoCloseBtn" type="button">Cerrar</button>'}`;
        banner.style.display = 'block';
        const retryBtn = document.getElementById('geoRetryBtn');
        const closeBtn = document.getElementById('geoCloseBtn');
        if (retryBtn) retryBtn.onclick = () => locateUserOnMap();
        if (closeBtn) closeBtn.onclick = () => banner.style.display = 'none';
    }

    function hideGeoBanner() {
        const banner = document.getElementById("geoStatusBanner");
        if (banner) {
            banner.style.display = 'none';
            banner.innerHTML = '';
            banner.className = 'geo-status-banner';
        }
    }

    
    function addLocateControlToMap() {
        if (!map || map._customLocateControl) return;
        const LocateControl = L.Control.extend({
            options: { position: 'topright' },
            onAdd: function() {
                const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-locate-custom');
                const button = L.DomUtil.create('button', '', container);
                button.type = 'button';
                button.title = 'Mi ubicación';
                button.setAttribute('aria-label', 'Mi ubicación');
                button.innerHTML = '📍';
                button.style.width = '36px';
                button.style.height = '36px';
                button.style.border = 'none';
                button.style.background = '#fff';
                button.style.cursor = 'pointer';
                button.style.fontSize = '18px';
                button.style.lineHeight = '36px';
                button.style.padding = '0';
                button.style.borderRadius = '4px';
                L.DomEvent.disableClickPropagation(container);
                L.DomEvent.disableScrollPropagation(container);
                L.DomEvent.on(button, 'click', function(e) {
                    L.DomEvent.stop(e);
                    locateUserOnMap();
                });
                return container;
            }
        });
        map._customLocateControl = new LocateControl();
        map.addControl(map._customLocateControl);
    }

    function setBaseLayer(layerName) {
        if (!map) return;
        if (currentBaseLayer) map.removeLayer(currentBaseLayer);
        if (layerName === 'topo') {
            map.addLayer(topoLayer);
            currentBaseLayer = topoLayer;
        } else if (layerName === 'aerea') {
            map.addLayer(aerialLayer);
            currentBaseLayer = aerialLayer;
        } else if (layerName === 'mapant') {
            map.addLayer(mapantLayer);
            currentBaseLayer = mapantLayer;
        }
        document.querySelectorAll('.layer-btn').forEach(btn => {
            if (btn.getAttribute('data-layer') === layerName) btn.classList.add('active');
            else btn.classList.remove('active');
        });
    }

    function locateUserOnMap() {
        if (!map) return;
        if (!navigator.geolocation) {
            toast("❌ Tu navegador no soporta geolocalización", "error");
            return;
        }

        toast("📍 Obteniendo ubicación...", "success");

        navigator.geolocation.getCurrentPosition(
            function(position) {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                const accuracy = position.coords.accuracy || 0;

                if (userLocationMarker) map.removeLayer(userLocationMarker);
                if (userLocationCircle) map.removeLayer(userLocationCircle);

                userLocationMarker = L.marker([lat, lng]).addTo(map);
                userLocationCircle = L.circle([lat, lng], {
                    radius: Math.max(accuracy, 5),
                    weight: 1,
                    opacity: 0.8,
                    fillOpacity: 0.15
                }).addTo(map);

                userLocationMarker.bindPopup(`
                    <div style="font-family:monospace;">
                        <strong>Tu ubicación actual</strong><br>
                        ${latLonToCoordText(lat, lng)}<br>
                        Precisión aprox.: ${Math.round(accuracy)} m
                    </div>
                `).openPopup();

                map.setView([lat, lng], accuracy <= 30 ? 18 : 17);
                toast("✅ Ubicación encontrada", "success");
            },
            function(error) {
                let msg = "❌ No se pudo obtener tu ubicación";
                if (error.code === 1) msg = "❌ Safari ha denegado la ubicación para esta página";
                else if (error.code === 2) msg = "❌ Ubicación no disponible en este momento";
                else if (error.code === 3) msg = "❌ Tiempo de espera agotado al obtener la ubicación";
                toast(msg, "error");
            },
            {
                enableHighAccuracy: true,
                timeout: 20000,
                maximumAge: 0
            }
        );
    }

    function initMapModal() {

        const container = document.getElementById("mapContainer");
        if (!container) return;
        if (map) { map.remove(); map = null; }
        permanentMarkers = [];
        permanentMarkersByPoint = {};
        currentSearchMarker = null;
        userLocationMarker = null;
        userLocationCircle = null;

        map = L.map(container).setView([40.4168, -3.7038], 6);

        topoLayer = L.tileLayer('https://www.ign.es/wmts/mapa-raster?request=GetTile&service=WMTS&version=1.0.0&layer=MTN&style=default&format=image/jpeg&tilematrixset=GoogleMapsCompatible&tilematrix={z}&tilerow={y}&tilecol={x}', {
            attribution: '&copy; <a href="https://www.ign.es">Instituto Geográfico Nacional de España</a>',
            maxZoom: 20,
            minZoom: 4
        });
        aerialLayer = L.tileLayer('https://www.ign.es/wmts/pnoa-ma?request=GetTile&service=WMTS&version=1.0.0&layer=OI.OrthoimageCoverage&style=default&format=image/jpeg&tilematrixset=GoogleMapsCompatible&tilematrix={z}&tilerow={y}&tilecol={x}', {
            attribution: '&copy; <a href="https://www.ign.es">Instituto Geográfico Nacional de España (PNOA)</a>',
            maxZoom: 20,
            minZoom: 4
        });
        mapantLayer = L.tileLayer.wms('https://mapant.es/wms', {
            layers: 'mapant',
            format: 'image/png',
            transparent: false,
            version: '1.3.0',
            attribution: '&copy; <a href="https://mapant.es/">Mapant.es</a>'
        });

        topoLayer.addTo(map);
        currentBaseLayer = topoLayer;
        addLocateControlToMap();

        setTimeout(() => { if (map) map.invalidateSize(); }, 200);
        loadPersistentMarkers();

        map.on('mousemove', function(e) {
            let coordText = latLonToCoordText(e.latlng.lat, e.latlng.lng);
            updateMouseCoordDisplay(coordText);
        });
        map.on('mouseout', function() {
            updateMouseCoordDisplay("--");
        });

        let tempMarker = null;
        let currentCoord = null;
        let currentLatLng = null;

        map.on('click', (e) => {
            const selectedPoint = document.getElementById("mapPointSelect").value;
            if (!selectedPoint) return;
            const latlng = e.latlng;
            const coordText = latLonToCoordText(latlng.lat, latlng.lng);
            updateCoordPreview(coordText);

            if (tempMarker) map.removeLayer(tempMarker);
            tempMarker = L.marker(latlng, {
                icon: L.divIcon({ className: 'custom-marker', html: '<div class="map-blue-marker"><span class="map-blue-pin"></span><span class="map-blue-label">Nuevo</span></div>', iconSize: [54,22], iconAnchor: [7,16], popupAnchor: [0,-16] })
            }).addTo(map);

            currentCoord = coordText;
            currentLatLng = latlng;
            const descActual = puntosData[selectedPoint] ? puntosData[selectedPoint].descripcion : "";
            const popupContent = `
                <div class="place-point-card">
                    <div class="place-point-head">
                        <div class="place-point-title">
                            <span class="place-point-icon">＋</span>
                            <span>Colocar baliza <span class="place-point-id">${selectedPoint}</span></span>
                        </div>
                        <div class="place-point-coord">
                            <span class="place-point-label">Coordenada ${currentCoordType === "UTM" ? "UTM" : "MGRS"}</span>
                            <span class="place-point-value">${coordText}</span>
                        </div>
                    </div>
                    <div class="place-point-body">
                        <div class="place-point-desc-label">
                            <span>Descripción</span>
                            <span>Se guardará con la baliza</span>
                        </div>
                        <input type="text" id="tempDesc" class="place-point-input" value="${escapeHtml(descActual)}" placeholder="Descripción del punto">
                        <div class="place-point-actions">
                            <button class="place-point-save" onclick="window.confirmarAsignacionConDesc('${selectedPoint}')">✓ Guardar</button>
                            <button class="place-point-cancel" onclick="window.cancelarAsignacion()">✕ Cancelar</button>
                        </div>
                    </div>
                </div>
            `;
            tempMarker.bindPopup(popupContent, { closeButton: false, className: 'place-point-popup' }).openPopup();
            window._tempMarker = tempMarker;
            window._currentCoord = currentCoord;
            window._currentLatLng = currentLatLng;
            window._pendingPoint = selectedPoint;
        });
    }

    window.confirmarAsignacionConDesc = function(pointId) {
        if (!window._tempMarker || !window._currentLatLng) {
            toast("No hay punto seleccionado", "error");
            return;
        }
        const selectedPoint = pointId || window._pendingPoint;
        const latlng = window._currentLatLng;
        const tempDescInput = document.getElementById("tempDesc");
        const nuevaDesc = tempDescInput ? tempDescInput.value : "";

        removeMarkerByPointId(selectedPoint);
        persistPointLocation(selectedPoint, latlng, { descripcion: nuevaDesc });
        createDraggableMarker(latlng, selectedPoint);

        if (map && window._tempMarker) map.removeLayer(window._tempMarker);
        window._tempMarker = null;
        window._currentCoord = null;
        window._currentLatLng = null;

        toast(`✅ Coordenadas y descripción actualizadas para ${selectedPoint}`, "success");
    };

    window.cancelarAsignacion = function() {
        if (window._tempMarker && map) {
            map.removeLayer(window._tempMarker);
            window._tempMarker = null;
            window._currentCoord = null;
            window._currentLatLng = null;
            updateCoordPreview("--");
            toast("Asignación cancelada", "error");
        }
    };

    function searchLocation(query) {
        if (!query.trim()) { toast("Escribe un lugar o coordenadas para buscar", "error"); return; }
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=0`;
        fetch(url)
            .then(res => res.json())
            .then(data => {
                if (data && data.length > 0) {
                    const lat = parseFloat(data[0].lat), lon = parseFloat(data[0].lon);
                    map.setView([lat, lon], 12);
                    if (currentSearchMarker) map.removeLayer(currentSearchMarker);
                    currentSearchMarker = L.marker([lat, lon]).addTo(map);
                    setTimeout(() => {
                        if (currentSearchMarker && map && map.hasLayer(currentSearchMarker)) map.removeLayer(currentSearchMarker);
                    }, 3000);
                    toast(`📍 Ubicación encontrada: ${data[0].display_name}`, "success");
                } else {
                    toast("No se encontró la ubicación. Intenta con otro término.", "error");
                }
            })
            .catch(() => { toast("Error en la búsqueda. Revisa tu conexión.", "error"); });
    }

    function openMapModal() {
        const modal = document.getElementById("mapModal");
        modal.style.display = "flex";
        const select = document.getElementById("mapPointSelect");
        select.innerHTML = "";
        for (let m = 1; m <= MODULOS; m++) {
            for (let p = 1; p <= PUNTOS_POR_MODULO; p++) {
                const pointId = getPuntoId(m, p);
                const st = getMapPointStatus(pointId);
                select.appendChild(new Option((st.complete ? "✅ " : "❌ ") + pointId, pointId));
            }
        }
        updatePreviewFromSelectedPoint();
        renderMapManualEditor();
        initMapModal();

        select.onchange = () => {
            updatePreviewFromSelectedPoint();
            focusSelectedMapPoint();
        };
        const searchInput = document.getElementById("searchInput");
        const searchBtn = document.getElementById("searchBtn");

        const doSearch = () => searchLocation(searchInput.value);
        searchBtn.onclick = doSearch;
        searchInput.onkeypress = (e) => { if (e.key === "Enter") doSearch(); };

        document.querySelectorAll('.layer-btn').forEach(btn => btn.onclick = () => setBaseLayer(btn.getAttribute('data-layer')));
        setBaseLayer('topo');

    }

    function initTheme() {
        let saved = localStorage.getItem("milimoto_tema");
        if (saved) {
            if (saved === "dark") document.body.classList.add("dark");
            else document.body.classList.remove("dark");
            document.querySelectorAll(".theme-opt").forEach(o => {
                o.classList.remove("active");
                if (o.getAttribute("data-theme") === saved) o.classList.add("active");
            });
        } else {
            let hour = new Date().getHours();
            let isNight = hour >= 20 || hour < 7;
            if (isNight) {
                document.body.classList.add("dark");
                document.querySelectorAll(".theme-opt").forEach(o => {
                    o.classList.remove("active");
                    if (o.getAttribute("data-theme") === "dark") o.classList.add("active");
                });
            } else {
                document.body.classList.remove("dark");
                document.querySelectorAll(".theme-opt").forEach(o => {
                    o.classList.remove("active");
                    if (o.getAttribute("data-theme") === "light") o.classList.add("active");
                });
            }
        }
    }




    function updateHeaderModeTabs() {
        const topo = document.getElementById("headerTopoTab");
        const ori = document.getElementById("headerOriTab");
        if (topo) {
            topo.classList.toggle("active", appMode === "topografica");
            topo.setAttribute("aria-pressed", appMode === "topografica" ? "true" : "false");
        }
        if (ori) {
            ori.classList.toggle("active", appMode === "orientacion");
            ori.classList.toggle("pending", !ORIENTACION_ACTIVA);
            ori.setAttribute("aria-disabled", ORIENTACION_ACTIVA ? "false" : "true");
            ori.setAttribute("aria-pressed", appMode === "orientacion" ? "true" : "false");
            const badge = ori.querySelector(".branch-tab-badge");
            if (badge) badge.textContent = "";
        }
    }

    function showOrientationPending() {
        const overlay = document.getElementById("startupModeOverlay");
        const overlayVisible = overlay && overlay.style.display !== "none";
        const notice = document.getElementById("startupPendingNotice");
        const card = document.getElementById("startupOriCard");
        if (notice && overlayVisible) {
            notice.hidden = false;
            notice.scrollIntoView({ behavior: "smooth", block: "nearest" });
        } else if (typeof toast === "function") {
            toast("🧭 Orientación está preparada, pero todavía no está activa.", "success");
        } else {
            alert("Orientación está preparada, pero todavía no está activa.");
        }
        if (card && overlayVisible) {
            card.classList.remove("pending-pulse");
            void card.offsetWidth;
            card.classList.add("pending-pulse");
        }
    }

    function markUnsavedChanges() {
        hasUnsavedChanges = true;
    }

    function clearUnsavedChanges() {
        hasUnsavedChanges = false;
    }

    function saveCurrentWork() {
        try {
            document.querySelectorAll(".coord-inp").forEach(inp => {
                const pid = inp.getAttribute("data-id");
                if (!pid) return;
                if (!puntosData[pid]) puntosData[pid] = { coordsUTM: "", descripcion: "" };
                puntosData[pid].coordsUTM = inp.value;
                if (puntosData[pid].latlng) delete puntosData[pid].latlng;
            });

            document.querySelectorAll(".desc-inp").forEach(ta => {
                const pid = ta.getAttribute("data-id");
                if (!pid) return;
                if (!puntosData[pid]) puntosData[pid] = { coordsUTM: "", descripcion: "" };
                puntosData[pid].descripcion = ta.value;
            });

            if (typeof guardarStorage === "function") guardarStorage();
            if (typeof syncOrientationParticipants === "function") syncOrientationParticipants();
            if (typeof renderizarPuntos === "function") renderizarPuntos();
            if (typeof actualizarDashboard === "function") actualizarDashboard();
            if (typeof pintarEstadoCamposPuntos === "function") pintarEstadoCamposPuntos();

            clearUnsavedChanges();
            return true;
        } catch (e) {
            return false;
        }
    }

    function changeModeWithPrompt(targetMode) {
        if (!hasUnsavedChanges) {
            appMode = targetMode;
            try { localStorage.setItem("milimoto_app_mode", appMode); } catch (e) {}
            if (appMode === "orientacion") showOrientacionMode();
            else showTopograficaMode();
            return;
        }

        const guardar = confirm("Tienes cambios sin guardar. Pulsa Aceptar para guardar antes de cambiar de modo.");
        if (guardar) {
            const ok = saveCurrentWork();
            if (!ok) {
                alert("No se pudieron guardar los cambios correctamente.");
                return;
            }
            appMode = targetMode;
            try { localStorage.setItem("milimoto_app_mode", appMode); } catch (e) {}
            if (appMode === "orientacion") showOrientacionMode();
            else showTopograficaMode();
            return;
        }

        const salir = confirm("¿Quieres salir sin guardar los cambios?");
        if (!salir) return;

        clearUnsavedChanges();
        appMode = targetMode;
        try { localStorage.setItem("milimoto_app_mode", appMode); } catch (e) {}
        if (appMode === "orientacion") showOrientacionMode();
        else showTopograficaMode();
    }

    function showTopograficaMode() {
        const mainSteps = document.querySelector(".steps-container");
        const step1 = document.getElementById("step1");
        const step2 = document.getElementById("step2");
        const step3 = document.getElementById("step3");
        const oriShell = document.getElementById("orientacionShell");
        const topoHud = document.getElementById("topoVisualHud");
        if (mainSteps) mainSteps.style.display = "";
        if (step1) step1.style.display = "";
        if (step2) step2.style.display = "";
        if (step3) step3.style.display = "";
        if (oriShell) oriShell.style.display = "none";
        if (topoHud) topoHud.style.display = "";
        updateHeaderModeTabs();
        goToStep(1);
    }

    function fillOrientationMirrors() {
        const a = document.getElementById("numModulosSelect");
        const b = document.getElementById("puntosPorModuloSelect");
        const am = document.getElementById("oriNumModulosMirror");
        const bm = document.getElementById("oriPuntosPorModuloMirror");
        if (a && am) am.innerHTML = a.innerHTML, am.value = a.value;
        if (b && bm) bm.innerHTML = b.innerHTML, bm.value = b.value;
    }

    function showOrientacionMode() {
        const mainSteps = document.querySelector(".steps-container");
        const step1 = document.getElementById("step1");
        const step2 = document.getElementById("step2");
        const step3 = document.getElementById("step3");
        const oriShell = document.getElementById("orientacionShell");
        const topoHud = document.getElementById("topoVisualHud");
        const qrSelect = document.getElementById("qrModeEnabled");
        if (mainSteps) mainSteps.style.display = "none";
        if (step1) step1.style.display = "none";
        if (step2) step2.style.display = "none";
        if (step3) step3.style.display = "none";
        if (oriShell) oriShell.style.display = "";
        if (topoHud) topoHud.style.display = "none";
        if (qrSelect) qrSelect.value = "1";
        fillOrientationMirrors();
        updateHeaderModeTabs();
    }

    function syncOrientationParticipants() {
        const txt = document.getElementById("oriParticipantsText");
        if (!txt) return;
        try { localStorage.setItem("milimoto_ori_participants", txt.value || ""); } catch (e) {}
    }

    function enterStartupMode(mode) {
        if (mode === "orientacion") {
            window.location.href = "orientacion/";
            return;
        }
        appMode = "topografica";
        const overlay = document.getElementById("startupModeOverlay");
        if (overlay) overlay.style.display = "none";
        try { localStorage.setItem("milimoto_app_mode", appMode); } catch (e) {}

        showTopograficaMode();
        setTimeout(() => {
            const instrModal = document.getElementById("instructionsModal");
            if (instrModal) instrModal.style.display = "flex";
        }, 260);
    }

    function goToStep(step) {
        document.querySelectorAll(".step-content").forEach(c => c.classList.remove("active"));
        document.getElementById(`step${step}`).classList.add("active");
        document.querySelectorAll(".step").forEach((s, idx) => {
            s.classList.remove("active");
            if (idx + 1 === step) s.classList.add("active");
            if (idx + 1 < step) s.classList.add("completed");
            else if (idx + 1 > step) s.classList.remove("completed");
        });
        currentStep = step;
        if (typeof updateTopoVisualState === "function") updateTopoVisualState();
        if (step === 2) actualizarDashboard();
        if (step === 3) renderResumenTecnicoPrevio();
    }

    window.addEventListener("beforeunload", (e) => {
        if (!hasUnsavedChanges) return;
        e.preventDefault();
        e.returnValue = "";
    });

    document.addEventListener("DOMContentLoaded", () => {
        initTheme();
        cargarStorage();
        generarOpcionesRecorridos();
        goToStep(1);

        document.getElementById("startupTopoBtn")?.addEventListener("click", () => enterStartupMode("topografica"));
        document.getElementById("startupOriBtn")?.addEventListener("click", () => enterStartupMode("orientacion"));
        document.getElementById("startupTopoCard")?.addEventListener("click", (e) => { if (e.target.id !== "startupTopoBtn") enterStartupMode("topografica"); });
        document.getElementById("startupOriCard")?.addEventListener("click", (e) => { if (e.target.id !== "startupOriBtn") enterStartupMode("orientacion"); });
        document.getElementById("startupTopoCard")?.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); enterStartupMode("topografica"); } });
        document.getElementById("startupOriCard")?.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); enterStartupMode("orientacion"); } });
        document.getElementById("headerTopoTab")?.addEventListener("click", () => {
            if (appMode !== "topografica") changeModeWithPrompt("topografica");
        });
        document.getElementById("headerOriTab")?.addEventListener("click", () => {
            const overlay = document.getElementById("startupModeOverlay");
            if (overlay) {
                overlay.style.display = "flex";
                const notice = document.getElementById("startupPendingNotice");
                if (notice) notice.hidden = true;
            }
        });

        document.querySelectorAll("input, textarea, select").forEach(el => {
            el.addEventListener("input", markUnsavedChanges);
            el.addEventListener("change", markUnsavedChanges);
        });

        document.getElementById("confirmStep1")?.addEventListener("click", () => { clearUnsavedChanges(); });
        document.getElementById("confirmStep2")?.addEventListener("click", () => { clearUnsavedChanges(); });
        document.getElementById("generarBtn")?.addEventListener("click", () => { clearUnsavedChanges(); });

        const savedOriParticipants = localStorage.getItem("milimoto_ori_participants");
        if (savedOriParticipants && document.getElementById("oriParticipantsText")) document.getElementById("oriParticipantsText").value = savedOriParticipants;
        updateHeaderModeTabs();
        document.getElementById("oriParticipantsText")?.addEventListener("input", syncOrientationParticipants);
        document.getElementById("oriContinueBtn")?.addEventListener("click", () => {
            syncOrientationParticipants();
            const card = document.getElementById("oriStep2Card");
            if (card) card.style.display = "";
            window.scrollTo({ top: document.body.scrollHeight * 0.25, behavior: "smooth" });
        });

        document.getElementById("confirmStep1")?.addEventListener("click", () => { aplicarConfiguracion(); goToStep(2); });
        document.getElementById("backToStep1")?.addEventListener("click", () => { goToStep(1); });
        document.getElementById("confirmStep2")?.addEventListener("click", () => {
            let v = verificarCompletos();
            if (v.ok) {
                toast("✅ Todos los puntos están completos y con formato válido. Avanzando al paso 3", "success");
                goToStep(3);
            } else {
                toast(`❌ Faltan o tienen formato incorrecto: ${v.faltantes.length} puntos (${v.faltantes.join(", ")})`, "error");
            }
        });
        document.getElementById("backToStep2")?.addEventListener("click", () => { goToStep(2); });
        document.getElementById("autofillPuntosBtn")?.addEventListener("click", () => restablecerEjemplos());
        document.getElementById("mapAutofillPuntosBtn")?.addEventListener("click", () => restablecerEjemplos());

        document.getElementById("importCSVBtn")?.addEventListener("click", () => {
            let input = document.createElement('input');
            input.type = 'file';
            input.accept = '.csv, .xlsx, .xls';
            input.onchange = (e) => { if (e.target.files[0]) importFromCSVExcel(e.target.files[0]); };
            input.click();
        });

        document.getElementById("importGPXBtn")?.addEventListener("click", () => {
            let input = document.createElement('input');
            input.type = 'file';
            input.accept = '*/*';
            input.onchange = (e) => { if (e.target.files[0]) importFromGPXKML(e.target.files[0]); };
            input.click();
        });

        document.getElementById("topoInfoModalClose")?.addEventListener("click", closeTopoInfoModal);
        document.getElementById("topoInfoModal")?.addEventListener("click", (e) => { if (e.target.id === "topoInfoModal") closeTopoInfoModal(); });
        document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeTopoInfoModal(); });
        document.getElementById("importCSVInfoIcon")?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); mostrarInfoCSV(); });
        document.getElementById("importGPXInfoIcon")?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); mostrarInfoGPX(); });
        document.getElementById("infoModulosIcon")?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); mostrarInfoModulos(); });
        document.getElementById("infoPuntosIcon")?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); mostrarInfoPuntos(); });
        document.getElementById("infoCoordIcon")?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); mostrarInfoCoord(); });

        document.getElementById("previewRecorridoBtn")?.addEventListener("click", abrirVistaPreviaRecorrido);
        document.getElementById("verRecorridosDetalleBtn")?.addEventListener("click", async () => {
            routeDetailsPanelVisible = !routeDetailsPanelVisible;
            const btn = document.getElementById("verRecorridosDetalleBtn");
            if (btn) btn.textContent = routeDetailsPanelVisible ? "🙈 OCULTAR RECORRIDOS" : "📋 VER RECORRIDOS Y CARACTERÍSTICAS";
            if (routeDetailsPanelVisible && !routeDetailsLastResumen) {
                setRouteDetailsLoading("Calculando recorridos y características...");
                await renderResumenTecnicoPrevio();
            } else {
                renderRouteDetailsPanel(routeDetailsLastResumen);
            }
        });
        document.getElementById("regenerarRecorridosBtn")?.addEventListener("click", async () => {
            const btn = document.getElementById("regenerarRecorridosBtn");
            if (btn) { btn.disabled = true; btn.textContent = "⏳ REGENERANDO..."; }
            try {
                await regenerateRouteSummaryAndDetails(true);
                const verBtn = document.getElementById("verRecorridosDetalleBtn");
                if (verBtn) verBtn.textContent = "🙈 OCULTAR RECORRIDOS";
                toast("🔄 Recorridos regenerados", "success");
            } catch (err) {
                const panel = document.getElementById("routeDetailsPanel");
                if (panel) {
                    panel.style.display = "block";
                    panel.innerHTML = `<div class="route-details-empty">❌ No se pudieron regenerar los recorridos: ${escapeRouteHtml(err.message)}</div>`;
                }
            } finally {
                if (btn) { btn.disabled = false; btn.textContent = "🔄 REGENERAR RECORRIDOS"; }
            }
        });
        document.getElementById("numRecorridos")?.addEventListener("change", async () => {
            routeDetailsLastResumen = null;
            if (routeDetailsPanelVisible) setRouteDetailsLoading("Actualizando número de recorridos...");
            await renderResumenTecnicoPrevio();
        });
        document.getElementById("closePreviewRouteModal")?.addEventListener("click", () => {
            document.getElementById("previewRouteModal").style.display = "none";
            if (previewRouteMap) { previewRouteMap.remove(); previewRouteMap = null; }
        });
        window.addEventListener("click", (e) => {
            if (e.target === document.getElementById("previewRouteModal")) {
                document.getElementById("previewRouteModal").style.display = "none";
                if (previewRouteMap) { previewRouteMap.remove(); previewRouteMap = null; }
            }
        });

        document.getElementById("clearPuntosTopBtn")?.addEventListener("click", limpiarTodosLosPuntos);
        document.getElementById("mapClearPuntosBtn")?.addEventListener("click", limpiarTodosLosPuntos);
        document.getElementById("generarBtn")?.addEventListener("click", async () => {
            let btn = document.getElementById("generarBtn");
            btn.disabled = true;
            btn.textContent = "⏳ Generando...";
            document.getElementById("zipNotification").innerHTML = "";
            try {
                await generarTodo();
            } catch (err) {
                document.getElementById("resultadosGen").innerHTML = `<div class="alert alert-error">❌ Error: ${err.message}</div>`;
            } finally {
                btn.disabled = false;
                btn.textContent = "✨ GENERAR ZIP";
            }
        });

        document.getElementById("themeSwitch")?.addEventListener("click", e => {
            let t = e.target.closest(".theme-opt")?.getAttribute("data-theme");
            if (t) {
                localStorage.setItem("milimoto_tema", t);
                if (t === "dark") document.body.classList.add("dark");
                else document.body.classList.remove("dark");
                document.querySelectorAll(".theme-opt").forEach(o => o.classList.remove("active"));
                e.target.closest(".theme-opt").classList.add("active");
            }
        });

        const searchInput = document.getElementById("searchPuntos");
        const clearBtn = document.getElementById("clearSearchBtn");
        searchInput.addEventListener("input", (e) => { currentSearchTerm = e.target.value; renderizarPuntos(); });
        clearBtn.addEventListener("click", () => { searchInput.value = ""; currentSearchTerm = ""; renderizarPuntos(); });

        const mapModal = document.getElementById("mapModal");
        document.getElementById("mapBtn")?.addEventListener("click", openMapModal);
        document.querySelector("#mapModal .close-modal")?.addEventListener("click", () => {
            mapModal.style.display = "none";
            if (map) { map.remove(); map = null; }
            permanentMarkers = [];
            permanentMarkersByPoint = {};
            currentSearchMarker = null;
            userLocationMarker = null;
            userLocationCircle = null;
            if (window._tempMarker) window._tempMarker = null;
        });
        window.addEventListener("click", (e) => {
            if (e.target === mapModal) {
                mapModal.style.display = "none";
                if (map) { map.remove(); map = null; }
                permanentMarkers = [];
                permanentMarkersByPoint = {};
                currentSearchMarker = null;
                userLocationMarker = null;
                userLocationCircle = null;
                if (window._tempMarker) window._tempMarker = null;
            }
        });

        const instrModal = document.getElementById("instructionsModal"),
              openInstrBtn = document.getElementById("openInstructionsHeaderBtn"),
              closeInstrBtn = document.getElementById("closeInstructionsBtn");

        function showInstructions() { instrModal.style.display = "flex"; }
        function hideInstructions() { instrModal.style.display = "none"; }

        openInstrBtn?.addEventListener("click", showInstructions);
        closeInstrBtn?.addEventListener("click", hideInstructions);
        window.addEventListener("click", (e) => { if (e.target === instrModal) hideInstructions(); });
    });


    /* ZIP LAST ROUTES FOR ZIP JS START */
    function cloneRoutesForZip(recorridos) {
        return JSON.parse(JSON.stringify(recorridos || []));
    }

    function getRoutesForZip(num) {
        if (previewRecorridosCache && previewRecorridosCache.length === num) {
            return cloneRoutesForZip(previewRecorridosCache);
        }

        if (routeDetailsLastResumen?.recorridos && routeDetailsLastResumen.recorridos.length === num) {
            return cloneRoutesForZip(routeDetailsLastResumen.recorridos);
        }

        return generarRecorridosBalanceados(num);
    }
    /* ZIP LAST ROUTES FOR ZIP JS END */


    /* ROUTE DETAILS PANEL JS START */
    let routeDetailsPanelVisible = false;
    let routeDetailsLastResumen = null;

    function escapeRouteHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[ch]));
    }

    function getRouteDifficultyClass(value) {
        const v = String(value || "").toLowerCase();
        if (v.includes("baja")) return "baja";
        if (v.includes("alta")) return "alta";
        return "media";
    }

    function renderRouteDetailsPanel(resumen) {
        const panel = document.getElementById("routeDetailsPanel");
        if (!panel) return;
        routeDetailsLastResumen = resumen || routeDetailsLastResumen;
        if (!routeDetailsPanelVisible) { panel.style.display = "none"; return; }
        const data = routeDetailsLastResumen;
        panel.style.display = "block";
        if (!data || !Array.isArray(data.recorridos) || !data.recorridos.length) {
            panel.innerHTML = `<div class="route-details-empty">Todavía no hay recorridos calculados.</div>`;
            return;
        }
        const cards = data.recorridos.map((rec, i) => {
            const m = (data.metricas && data.metricas[i]) ? data.metricas[i] : {};
            const dificultad = m.dificultad || "MEDIA";
            const dificultadClass = getRouteDifficultyClass(dificultad);
            const puntos = rec.map(step => {
                const pdata = puntosData[step.puntoId] || {};
                const desc = pdata.descripcion ? ` · ${pdata.descripcion}` : "";
                return `${step.puntoId}${desc}`;
            }).join(" → ");
            return `
                <div class="route-detail-card">
                    <div class="route-detail-top">
                        <div class="route-detail-name">R${String(i + 1).padStart(2, "0")}</div>
                        <div class="route-difficulty ${dificultadClass}">${escapeRouteHtml(dificultad)}</div>
                    </div>
                    <div class="route-metrics">
                        <div class="route-metric"><div class="k">Distancia</div><div class="v">${escapeRouteHtml(m.distanciaKm ?? "--")} km</div></div>
                        <div class="route-metric"><div class="k">Desnivel +</div><div class="v">+${escapeRouteHtml(m.desnivelPositivo ?? "--")} m</div></div>
                        <div class="route-metric"><div class="k">Desnivel -</div><div class="v">-${escapeRouteHtml(m.desnivelNegativo ?? "--")} m</div></div>
                        <div class="route-metric"><div class="k">Global</div><div class="v">${escapeRouteHtml(m.desnivelGlobal ?? "--")} m</div></div>
                    </div>
                    <div class="route-points-line">${escapeRouteHtml(puntos)}</div>
                </div>`;
        }).join("");
        panel.innerHTML = `<div class="route-details-head"><div class="route-details-title">📋 Recorridos y características generales</div><div class="route-details-pill">${data.recorridos.length} recorridos calculados</div></div><div class="route-details-grid">${cards}</div>`;
    }

    function setRouteDetailsLoading(message = "Calculando recorridos...") {
        const panel = document.getElementById("routeDetailsPanel");
        if (!panel || !routeDetailsPanelVisible) return;
        panel.style.display = "block";
        panel.innerHTML = `<div class="route-details-loading">⏳ ${escapeRouteHtml(message)}</div>`;
    }

    async function regenerateRouteSummaryAndDetails(showDetails = true) {
        routeDetailsPanelVisible = !!showDetails;
        setRouteDetailsLoading("Regenerando recorridos y métricas...");
        await renderResumenTecnicoPrevio();
        if (routeDetailsPanelVisible) renderRouteDetailsPanel(routeDetailsLastResumen);
    }
    /* ROUTE DETAILS PANEL JS END */


/* ==========================================================
   MILITOPO TOPÓGRAFICA · MICROINTERACCIONES VISUALES
   No modifica generación, coordenadas ni exportación.
   ========================================================== */
function updateTopoVisualState() {
    const panel = document.getElementById("topoVisualHud");
    if (!panel) return;

    const modSelect = document.getElementById("numModulosSelect");
    const puntosSelect = document.getElementById("puntosPorModuloSelect");
    const modulos = parseInt(modSelect?.value || (typeof MODULOS !== "undefined" ? MODULOS : 0) || 0, 10) || 0;
    const puntosPorModulo = parseInt(puntosSelect?.value || (typeof PUNTOS_POR_MODULO !== "undefined" ? PUNTOS_POR_MODULO : 0) || 0, 10) || 0;
    const total = modulos * puntosPorModulo;
    const activeStep = currentStep || 1;

    let analisis = null;
    try {
        if (typeof obtenerAnalisisPuntos === "function") analisis = obtenerAnalisisPuntos();
    } catch (e) { analisis = null; }

    const completados = Number(analisis?.completados || 0);
    const totalAnalisis = Number(analisis?.total || total || 0);
    const porcentajePuntos = Math.max(0, Math.min(100, Number(analisis?.porcentaje || 0)));

    let progressValue = 10;
    if (activeStep === 1) progressValue = 12;
    if (activeStep === 2) progressValue = 25 + Math.round(porcentajePuntos * 0.55);
    if (activeStep === 3) progressValue = porcentajePuntos >= 100 ? 90 : Math.max(80, 25 + Math.round(porcentajePuntos * 0.55));

    const generatedText = [
        document.getElementById("zipNotification")?.textContent || "",
        document.getElementById("resultadosGen")?.textContent || ""
    ].join(" ").toLowerCase();
    if (activeStep === 3 && (generatedText.includes("completado") || generatedText.includes("descargado") || generatedText.includes("zip generado"))) {
        progressValue = 100;
    }
    progressValue = Math.max(0, Math.min(100, progressValue));

    const hudMod = document.getElementById("topoHudModulos");
    const hudPuntos = document.getElementById("topoHudPuntos");
    const hudProgreso = document.getElementById("topoHudProgreso");
    const hudProgressFill = document.getElementById("topoHudProgressFill");
    const st1 = document.getElementById("workflowStatus1");
    const st2 = document.getElementById("workflowStatus2");
    const st3 = document.getElementById("workflowStatus3");

    if (hudMod) hudMod.textContent = String(modulos || "--");
    if (hudPuntos) hudPuntos.textContent = String(totalAnalisis || total || "--");
    if (hudProgreso) hudProgreso.textContent = `${progressValue}%`;
    if (hudProgressFill) hudProgressFill.style.width = `${progressValue}%`;

    if (st1) st1.textContent = activeStep > 1
        ? `Confirmado: ${modulos || "--"} módulos × ${puntosPorModulo || "--"} puntos`
        : "Define módulos, puntos y formato";
    if (st2) st2.textContent = totalAnalisis
        ? `${completados}/${totalAnalisis} puntos completados · ${porcentajePuntos}%`
        : "Sin puntos cargados todavía";
    if (st3) st3.textContent = activeStep === 3
        ? (porcentajePuntos >= 100 ? "Preparado para generar el ZIP final" : "Revisa puntos antes de generar")
        : "Se activa al llegar al último paso";

    document.querySelectorAll(".workflow-card[data-workflow-step]").forEach(card => {
        const stepNum = parseInt(card.getAttribute("data-workflow-step") || "0", 10);
        const completed = stepNum === 1 ? activeStep > 1 : stepNum === 2 ? (porcentajePuntos >= 100 && completados > 0) : progressValue >= 100;
        card.classList.toggle("is-active", stepNum === activeStep);
        card.classList.toggle("is-completed", completed);
        card.classList.toggle("is-pending", stepNum > activeStep && !completed);
    });
}

function setupTopoVisualEnhancements() {
    document.body.classList.add("mt-visual-ready");

    document.querySelectorAll(".step[data-step]").forEach(stepEl => {
        stepEl.setAttribute("role", "button");
        stepEl.setAttribute("tabindex", "0");
        const go = () => {
            const stepNum = parseInt(stepEl.getAttribute("data-step") || "1", 10);
            if (Number.isFinite(stepNum)) goToStep(stepNum);
            updateTopoVisualState();
        };
        stepEl.addEventListener("click", go);
        stepEl.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                go();
            }
        });
    });

    const rippleSelectors = ".btn, .btn-instr-header, .layer-btn, .points-action-tab, .branch-tab, .startup-enter-btn, .modern-info-btn, .step, .search-container button";
    document.addEventListener("pointerdown", (event) => {
        const target = event.target.closest(rippleSelectors);
        if (!target || target.disabled) return;
        const rect = target.getBoundingClientRect();
        const ripple = document.createElement("span");
        ripple.className = "mt-ripple";
        ripple.style.left = `${event.clientX - rect.left}px`;
        ripple.style.top = `${event.clientY - rect.top}px`;
        target.appendChild(ripple);
        setTimeout(() => ripple.remove(), 680);
    }, { passive: true });

    const tiltSelectors = ".startup-mode-card, .option-card, .file-card, .stat-card, .tech-item, .workflow-card";
    const canTilt = window.matchMedia && window.matchMedia("(pointer: fine)").matches && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (canTilt) {
        document.querySelectorAll(tiltSelectors).forEach(card => {
            card.addEventListener("pointermove", (event) => {
                const rect = card.getBoundingClientRect();
                const x = (event.clientX - rect.left) / rect.width - 0.5;
                const y = (event.clientY - rect.top) / rect.height - 0.5;
                card.style.transform = `perspective(900px) rotateX(${(-y * 3).toFixed(2)}deg) rotateY(${(x * 4).toFixed(2)}deg) translateY(-3px)`;
            });
            card.addEventListener("pointerleave", () => {
                card.style.transform = "";
            });
        });
    }

    const revealTargets = ".card, .option-card, .dashboard, .modulo-item, .file-card, .tech-summary, .route-details-panel, .topo-workflow-panel";
    if ("IntersectionObserver" in window) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("is-visible");
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.08 });
        document.querySelectorAll(revealTargets).forEach(el => {
            el.classList.add("mt-reveal");
            observer.observe(el);
        });
    }

    ["numModulosSelect", "puntosPorModuloSelect", "coordTypeConfig", "numRecorridos"].forEach(id => {
        document.getElementById(id)?.addEventListener("change", () => {
            updateTopoVisualState();
            const el = document.getElementById(id);
            el?.classList.remove("mt-soft-pop");
            void el?.offsetWidth;
            el?.classList.add("mt-soft-pop");
        });
    });

    ["confirmStep1", "confirmStep2", "backToStep1", "backToStep2", "generarBtn", "autofillPuntosBtn", "clearPuntosTopBtn"].forEach(id => {
        document.getElementById(id)?.addEventListener("click", () => setTimeout(updateTopoVisualState, 120));
    });

    updateTopoVisualState();
    window.setInterval(updateTopoVisualState, 1600);
}

document.addEventListener("DOMContentLoaded", setupTopoVisualEnhancements);
