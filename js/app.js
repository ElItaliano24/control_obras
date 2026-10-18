// app.js - Lógica de UI, validaciones, registros y gestión de trabajadores

let currentValidatedWorkers = [];
let currentSearchMode = 'sctr'; // 'sctr', 'celeste' o 'verde'
let isRegistering = false;

// Audio Feedback nativo con Web Audio API
function playAudioFeedback(isOk) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (isOk) {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, ctx.currentTime); // A3
      osc.frequency.setValueAtTime(164.81, ctx.currentTime + 0.12); // E3
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    }

    // Cierra el contexto de audio liberando la memoria del teléfono
    setTimeout(() => {
      if (ctx.state !== 'closed') {
        ctx.close();
      }
    }, 400);

  } catch (e) { }
}

// Función para formatear fechas de "YYYY-MM-DD" a "DD de [mes]"
function formatearFechaTexto(fechaString) {
  if (!fechaString) return '---';
  const fecha = new Date(fechaString + 'T00:00:00');
  const opciones = { day: '2-digit', month: 'long' };
  return fecha.toLocaleDateString('es-PE', opciones).replace(/-/g, ' ');
}

// Cambio de pestañas (Validar / En Obra)
function switchTab(tab) {
  document.getElementById("tab-validar").classList.add("hidden");
  document.getElementById("tab-en-obra").classList.add("hidden");

  const inactivoNavCls = "flex flex-col items-center justify-center gap-1 text-slate-800 font-extrabold text-xs transition-colors";
  const activoNavCls = "flex flex-col items-center justify-center gap-1 text-blue-700 font-black text-xs transition-colors";

  if (tab === 'validar') {
    document.getElementById("tab-validar").classList.remove("hidden");
    document.getElementById("navBtnValidar").className = activoNavCls;
    document.getElementById("navBtnEnObra").className = inactivoNavCls + " relative";
    // Ya no forzamos focus() para evitar abrir el teclado automáticamente en el celular
  } else if (tab === 'en-obra') {
    document.getElementById("tab-en-obra").classList.remove("hidden");
    document.getElementById("navBtnValidar").className = inactivoNavCls;
    document.getElementById("navBtnEnObra").className = activoNavCls + " relative";

    // Restablecer buscador de texto
    const searchInput = document.getElementById("searchEnObra");
    if (searchInput) searchInput.value = "";

    // Restablecer filtro de categoría a 'TODOS'
    setFiltroEnObra('TODOS');

    cargarTrabajadoresEnObra();
  }
}

// Modos de búsqueda: Obras (SCTR), Celestes, Verdes
function setSearchMode(mode) {
  currentSearchMode = mode;
  const input = document.getElementById("dniInput");
  const btnSctr = document.getElementById("btnModoSctr");
  const btnCeleste = document.getElementById("btnModoCeleste");
  const btnVerde = document.getElementById("btnModoVerde");
  const lbl = document.getElementById("lblSearchInput");
  const btnText = document.getElementById("btnValidarText");

  const clsInactivo = "py-2.5 px-2 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1 bg-transparent text-slate-800 hover:text-black";

  if (mode === 'sctr') {
    btnSctr.className = "py-2.5 px-3 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 bg-blue-600 text-white shadow-md shadow-blue-600/20";
    btnCeleste.className = clsInactivo;
    btnVerde.className = clsInactivo;

    lbl.innerText = "Ingrese DNI del trabajador";
    input.placeholder = "Escriba DNI aquí...";
    input.removeAttribute("maxlength");
    input.value = "";
    btnText.innerText = "Validar";

  } else if (mode === 'celeste') {
    btnCeleste.className = "py-2.5 px-3 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 bg-sky-500 text-white shadow-md shadow-sky-500/20";
    btnSctr.className = clsInactivo;
    btnVerde.className = clsInactivo;

    lbl.innerText = "Ingrese código de carnet";
    input.value = "C";
    input.placeholder = "C2, C10...";
    input.removeAttribute("maxlength");
    btnText.innerText = "Validar";

  } else if (mode === 'verde') {
    btnVerde.className = "py-2.5 px-3 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 bg-emerald-600 text-white shadow-md shadow-emerald-600/20";
    btnSctr.className = clsInactivo;
    btnCeleste.className = clsInactivo;

    lbl.innerText = "Ingrese código de carnet";
    input.value = "V";
    input.placeholder = "V2, V10...";
    input.removeAttribute("maxlength");
    btnText.innerText = "Validar";
  }
}

// Búsqueda y Validación en Supabase
async function validarDNI() {
  const input = document.getElementById("dniInput");
  const query = input.value.trim();

  if (!query || !supabaseClient) return;

  let workersList = [];

  if (currentSearchMode === 'sctr') {
    // 1. BÚSQUEDA SCTR (Por DNI)
    const { data: workersData } = await supabaseClient
      .from('trabajadores_sctr')
      .select('*, directorio ( Propietario )')
      .eq('dni', query);

    if (workersData && workersData.length > 0) {
      workersList = workersData.map(worker => ({
        ...worker,
        propietario: worker.directorio?.Propietario || "No asignado",
        tipo_registro: 'SCTR'
      }));
    }
  } else if (currentSearchMode === 'celeste') {
    // 2. BÚSQUEDA CELESTES (Por Código Fotocheck)
    const { data: workersData } = await supabaseClient
      .from('trabajadores_particulares')
      .select('*, directorio ( Propietario )')
      .eq('codigo_fotocheck', query);

    if (workersData && workersData.length > 0) {
      const datosBase = workersData[0];

      // Siempre insertamos PRIMERO la opción comodín
      workersList = [{
        dni: datosBase.dni || '---',
        nombre_completo: datosBase.nombre_completo,
        codigo_casa: null,
        propietario: "Sin casa asignada",
        codigo_fotocheck: datosBase.codigo_fotocheck,
        tipo_registro: 'CELESTE',
        es_comodin: true
      }];

      // Luego agregamos las casas asignadas
      workersData.forEach(worker => {
        const propietarioReal = worker.directorio?.Propietario || (worker.codigo_casa ? `Casa ${worker.codigo_casa}` : null);
        if (propietarioReal && propietarioReal !== "Sin casa asignada") {
          workersList.push({
            dni: worker.dni || '---',
            nombre_completo: worker.nombre_completo,
            codigo_casa: worker.codigo_casa,
            propietario: propietarioReal,
            codigo_fotocheck: worker.codigo_fotocheck,
            tipo_registro: 'CELESTE',
            es_comodin: false
          });
        }
      });
    }
  } else if (currentSearchMode === 'verde') {
    // 3. BÚSQUEDA VERDES (Por Código Fotocheck 'V...')
    const { data: verdesData } = await supabaseClient
      .from('trabajadores_verdes')
      .select('*')
      .eq('codigo_fotocheck', query);

    if (verdesData && verdesData.length > 0) {
      const datosBase = verdesData[0];

      // Comodín al inicio
      workersList.push({
        dni: datosBase.dni || '---',
        nombre_completo: datosBase.nombre_completo,
        codigo_casa: null,
        propietario: "Sin casa asignada",
        codigo_fotocheck: datosBase.codigo_fotocheck,
        tipo_registro: 'VERDE',
        es_comodin: true
      });

      // Casas reales de todos los Celestes asociados
      for (const verde of verdesData) {
        if (verde.codigo_celeste) {
          const { data: celesteData } = await supabaseClient
            .from('trabajadores_particulares')
            .select('codigo_casa, directorio(Propietario)')
            .eq('codigo_fotocheck', verde.codigo_celeste);

          if (celesteData) {
            celesteData.forEach(c => {
              const propietarioReal = c.directorio?.Propietario || (c.codigo_casa ? `Casa ${c.codigo_casa}` : null);
              if (propietarioReal && propietarioReal !== "Sin casa asignada") {
                if (!workersList.some(w => w.propietario === propietarioReal)) {
                  workersList.push({
                    dni: verde.dni || '---',
                    nombre_completo: verde.nombre_completo,
                    codigo_casa: c.codigo_casa,
                    propietario: propietarioReal,
                    codigo_fotocheck: verde.codigo_fotocheck,
                    tipo_registro: 'VERDE',
                    es_comodin: false
                  });
                }
              }
            });
          }
        }
      }
    }
  }

  renderResultadoCard(workersList, query);
}

function togglePlaca(index) {
  const contenedor = document.getElementById(`contenedorPlaca_${index}`);
  const input = document.getElementById(`placaInput_${index}`);
  if (contenedor) {
    contenedor.classList.toggle('hidden');
    if (!contenedor.classList.contains('hidden') && input) {
      input.focus();
    }
  }
}

function renderResultadoCard(workersList, query) {
  const container = document.getElementById("resultadoContainer");
  container.innerHTML = "";
  container.classList.remove("hidden");

  // CASO 1: NO REGISTRADO
  if (!workersList || workersList.length === 0) {
    playAudioFeedback(false);

    let tipoTexto = 'DNI';
    if (currentSearchMode === 'celeste') tipoTexto = 'Fotocheck Celeste';
    if (currentSearchMode === 'verde') tipoTexto = 'Fotocheck Verde';

    container.innerHTML = `
      <div class="bg-red-50 border-2 border-red-500 rounded-2xl p-5 space-y-3 shadow-md animate-pop">
        <div class="flex items-center gap-2.5 text-red-800">
          <div class="w-8 h-8 rounded-full bg-red-600 text-white flex items-center justify-center font-black text-lg">✕</div>
          <div>
            <h3 class="font-black text-base text-red-950 uppercase tracking-wide">NO REGISTRADO</h3>
          </div>
        </div>
        <p class="text-xs text-red-900 bg-red-100 p-3 rounded-xl border border-red-200 font-medium">
          El ${tipoTexto} <b>${query}</b> no se encuentra registrado en el sistema. Acceso denegado.
        </p>
      </div>
    `;
    return;
  }

  playAudioFeedback(true);
  currentValidatedWorkers = workersList;

  const nombreTrabajador = workersList[0].nombre_completo;
  const tipoRegistro = workersList[0].tipo_registro; // 'SCTR', 'CELESTE' o 'VERDE'
  const now = new Date();
  const hoy = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let textoBadgeHeader = '👷‍♂️ Personal de Obra';
  let estiloBadgeHeader = 'bg-blue-100 text-blue-800 border-blue-300';

  if (tipoRegistro === 'CELESTE') {
    textoBadgeHeader = `💳 ${workersList[0].codigo_fotocheck}`;
    estiloBadgeHeader = 'bg-sky-100 text-sky-800 border-sky-300';
  } else if (tipoRegistro === 'VERDE') {
    textoBadgeHeader = `🌿 ${workersList[0].codigo_fotocheck}`;
    estiloBadgeHeader = 'bg-emerald-100 text-emerald-800 border-emerald-300';
  }

  let htmlContent = `
    <div class="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-md animate-pop">
      <div class="text-center border-b border-slate-100 pb-3">
        <span class="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase mb-1 border ${estiloBadgeHeader}">
          ${textoBadgeHeader}
        </span>
        <span class="text-slate-900 font-black text-lg leading-tight block">${nombreTrabajador}</span>
      </div>
      <h3 class="text-center font-bold text-[13px] text-slate-800">¿A qué casa ingresa hoy?</h3>
      <div class="space-y-3">
  `;

  workersList.forEach((worker, index) => {
    // A: VERDE
    if (tipoRegistro === 'VERDE') {
      if (worker.propietario === "Sin casa asignada" || worker.es_comodin) {
        htmlContent += `
          <div class="bg-amber-50 border-2 border-amber-300 border-dashed rounded-xl p-3.5 space-y-2 mb-2">
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-sm"></span>
              <span class="font-extrabold text-[13px] text-amber-900">Sin casa asignada</span>
            </div>
            <div class="flex justify-end mb-2 mt-1">
              <button onclick="togglePlaca(${index})" class="w-1/2 bg-white border-2 border-amber-500 text-amber-900 font-extrabold py-2 px-2 rounded-lg text-[10px] flex items-center justify-center gap-1.5 shadow-sm active:bg-amber-100 active:scale-95 transition-all uppercase tracking-wide">
                <img src="iconos/carro.svg" class="w-4 h-4" style="filter: invert(41%) sepia(85%) saturate(1021%) hue-rotate(1deg) brightness(97%) contrast(93%);" alt="Auto">
                AGREGAR PLACA
              </button>
            </div>
            <div id="contenedorPlaca_${index}" class="hidden mb-3 transition-all">
              <input type="text" id="placaInput_${index}" placeholder="PLACA (ABC123)" class="w-full bg-white border-2 border-amber-500 rounded-lg px-3 py-2.5 text-center text-sm font-black text-slate-900 placeholder-slate-400 focus:bg-amber-50 focus:outline-none uppercase tracking-widest shadow-inner">
            </div>
            <button id="btnIngreso_${index}" onclick="confirmarIngreso(${index}, this)" class="w-full bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-amber-950 font-extrabold py-2.5 rounded-lg shadow-sm shadow-amber-500/30 text-xs transition-all tracking-wide uppercase disabled:opacity-60 disabled:cursor-not-allowed">
              REGISTRAR INGRESO
            </button>
          </div>
        `;
      } else {
        htmlContent += `
          <div class="bg-emerald-50/60 border border-emerald-200 rounded-xl p-3.5 space-y-2">
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm"></span>
              <span class="font-extrabold text-[13px] text-emerald-950">${worker.propietario}</span>
            </div>
            <div class="flex justify-end mb-2 mt-1">
              <button onclick="togglePlaca(${index})" class="w-1/2 bg-white border-2 border-emerald-600 text-emerald-900 font-extrabold py-2 px-2 rounded-lg text-[10px] flex items-center justify-center gap-1.5 shadow-sm active:bg-emerald-100 active:scale-95 transition-all uppercase tracking-wide">
                <img src="iconos/carro.svg" class="w-4 h-4" style="filter: invert(32%) sepia(80%) saturate(1200%) hue-rotate(120deg) brightness(92%) contrast(98%);" alt="Auto">
                AGREGAR PLACA
              </button>
            </div>
            <div id="contenedorPlaca_${index}" class="hidden mb-3 transition-all">
              <input type="text" id="placaInput_${index}" placeholder="PLACA (ABC123)" class="w-full bg-white border-2 border-emerald-600 rounded-lg px-3 py-2.5 text-center text-sm font-black text-slate-900 placeholder-slate-400 focus:bg-emerald-50 focus:outline-none uppercase tracking-widest shadow-inner">
            </div>
            <button id="btnIngreso_${index}" onclick="confirmarIngreso(${index}, this)" class="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-extrabold py-2.5 rounded-lg shadow-sm shadow-emerald-600/20 text-xs transition-all tracking-wide uppercase disabled:opacity-60 disabled:cursor-not-allowed">
              REGISTRAR INGRESO
            </button>
          </div>
        `;
      }
    // B: CELESTE
    } else if (tipoRegistro === 'CELESTE') {
      if (worker.es_comodin) {
        htmlContent += `
          <div class="bg-amber-50 border-2 border-amber-300 border-dashed rounded-xl p-3.5 space-y-2 mb-2">
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-sm"></span>
              <span class="font-extrabold text-[13px] text-amber-900">Sin casa asignada</span>
            </div>
            <div class="flex justify-end mb-2 mt-1">
              <button onclick="togglePlaca(${index})" class="w-1/2 bg-white border-2 border-amber-500 text-amber-900 font-extrabold py-2 px-2 rounded-lg text-[10px] flex items-center justify-center gap-1.5 shadow-sm active:bg-amber-100 active:scale-95 transition-all uppercase tracking-wide">
                <img src="iconos/carro.svg" class="w-4 h-4" style="filter: invert(41%) sepia(85%) saturate(1021%) hue-rotate(1deg) brightness(97%) contrast(93%);" alt="Auto">
                AGREGAR PLACA
              </button>
            </div>
            <div id="contenedorPlaca_${index}" class="hidden mb-3 transition-all">
              <input type="text" id="placaInput_${index}" placeholder="PLACA (ABC123)" class="w-full bg-white border-2 border-amber-500 rounded-lg px-3 py-2.5 text-center text-sm font-black text-slate-900 placeholder-slate-400 focus:bg-amber-50 focus:outline-none uppercase tracking-widest shadow-inner">
            </div>
            <button id="btnIngreso_${index}" onclick="confirmarIngreso(${index}, this)" class="w-full bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-amber-950 font-extrabold py-2.5 rounded-lg shadow-sm shadow-amber-500/30 text-xs transition-all tracking-wide uppercase disabled:opacity-60 disabled:cursor-not-allowed">
              REGISTRAR INGRESO
            </button>
          </div>
        `;
      } else {
        htmlContent += `
          <div class="bg-sky-50/60 border border-sky-200 rounded-xl p-3.5 space-y-2">
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-sky-500 shadow-sm"></span>
              <span class="font-extrabold text-[13px] text-sky-950">${worker.propietario}</span>
            </div>
            <div class="flex justify-end mb-2 mt-1">
              <button onclick="togglePlaca(${index})" class="w-1/2 bg-white border-2 border-blue-600 text-blue-800 font-extrabold py-2 px-2 rounded-lg text-[10px] flex items-center justify-center gap-1.5 shadow-sm active:bg-blue-50 active:scale-95 transition-all uppercase tracking-wide">
                <img src="iconos/carro.svg" class="w-4 h-4" style="filter: invert(27%) sepia(91%) saturate(2352%) hue-rotate(213deg) brightness(93%) contrast(97%);" alt="Auto">
                AGREGAR PLACA
              </button>
            </div>
            <div id="contenedorPlaca_${index}" class="hidden mb-3 transition-all">
              <input type="text" id="placaInput_${index}" placeholder="PLACA (ABC123)" class="w-full bg-white border-2 border-blue-600 rounded-lg px-3 py-2.5 text-center text-sm font-black text-slate-900 placeholder-slate-500 focus:bg-blue-50 focus:outline-none uppercase tracking-widest shadow-inner">
            </div>
            <button id="btnIngreso_${index}" onclick="confirmarIngreso(${index}, this)" class="w-full bg-sky-600 hover:bg-sky-700 active:scale-[0.98] text-white font-extrabold py-2.5 rounded-lg shadow-sm shadow-sky-600/20 text-xs transition-all tracking-wide uppercase disabled:opacity-60 disabled:cursor-not-allowed">
              REGISTRAR INGRESO
            </button>
          </div>
        `;
      }
    // C: SCTR (OBRAS)
    } else {
      const [vYear, vMonth, vDay] = worker.fecha_vencimiento.split('-');
      const vencimiento = new Date(vYear, vMonth - 1, vDay);
      const diffMs = vencimiento - hoy;
      const diasRestantes = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      if (worker.activo && diasRestantes >= 0) {
        const badgeDiasText = diasRestantes === 0 ? "Vence hoy" : `Vence en ${diasRestantes} días`;
        htmlContent += `
          <div class="bg-emerald-50/50 border border-emerald-200 rounded-xl p-3.5 space-y-2">
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm"></span>
              <span class="font-extrabold text-[13px] text-emerald-950">${worker.propietario}</span>
            </div>
            <p class="text-[11px] text-emerald-700 font-bold ml-4">SCTR Vigente (${badgeDiasText})</p>
            <div class="flex justify-end mb-2 mt-1">
              <button onclick="togglePlaca(${index})" class="w-1/2 bg-white border-2 border-emerald-600 text-emerald-900 font-extrabold py-2 px-2 rounded-lg text-[10px] flex items-center justify-center gap-1.5 shadow-sm active:bg-emerald-100 active:scale-95 transition-all uppercase tracking-wide">
                <img src="iconos/carro.svg" class="w-4 h-4" style="filter: invert(32%) sepia(80%) saturate(1200%) hue-rotate(120deg) brightness(92%) contrast(98%);" alt="Auto">
                AGREGAR PLACA
              </button>
            </div>
            <div id="contenedorPlaca_${index}" class="hidden mb-3 transition-all">
              <input type="text" id="placaInput_${index}" placeholder="PLACA (ABC123)" class="w-full bg-white border-2 border-emerald-600 rounded-lg px-3 py-2.5 text-center text-sm font-black text-slate-900 placeholder-slate-400 focus:bg-emerald-50 focus:outline-none uppercase tracking-widest shadow-inner">
            </div>
            <button id="btnIngreso_${index}" onclick="confirmarIngreso(${index}, this)" class="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-extrabold py-2.5 rounded-lg shadow-sm shadow-emerald-600/20 text-xs transition-all tracking-wide uppercase disabled:opacity-60 disabled:cursor-not-allowed">
              REGISTRAR INGRESO
            </button>
          </div>
        `;
      } else {
        htmlContent += `
          <div class="bg-red-50/50 border border-red-200 rounded-xl p-3.5 space-y-2 opacity-90">
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-red-500 shadow-sm"></span>
              <span class="font-extrabold text-[13px] text-red-950">${worker.propietario}</span>
            </div>
            <p class="text-[11px] text-red-700 font-bold ml-4">SCTR Vencido</p>
            <button disabled class="w-full bg-slate-200 text-slate-400 font-extrabold py-2.5 rounded-lg text-xs tracking-wide cursor-not-allowed uppercase">
              ACCESO DENEGADO
            </button>
          </div>
        `;
      }
    }
  });

  htmlContent += `</div></div>`;
  container.innerHTML = htmlContent;
}

// Confirmar e insertar registro de ingreso
async function confirmarIngreso(index, btnElement) {
  if (isRegistering) return;
  if (!currentValidatedWorkers || currentValidatedWorkers.length === 0 || !supabaseClient) return;

  isRegistering = true;

  const allActionBtns = document.querySelectorAll('[id^="btnIngreso_"]');
  allActionBtns.forEach(btn => {
    btn.disabled = true;
  });

  let originalBtnHtml = "";
  if (btnElement) {
    originalBtnHtml = btnElement.innerHTML;
    btnElement.innerHTML = `
      <span class="inline-flex items-center justify-center gap-2">
        <svg class="animate-spin h-3.5 w-3.5 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
        </svg>
        REGISTRANDO...
      </span>
    `;
  }

  const container = document.getElementById("resultadoContainer");
  const data = currentValidatedWorkers[index];
  const esCeleste = data.tipo_registro === 'CELESTE';

  const placaInput = document.getElementById(`placaInput_${index}`);
  const placaValue = placaInput && !placaInput.parentElement.classList.contains('hidden') && placaInput.value.trim() !== ""
    ? placaInput.value.trim().toUpperCase()
    : null;

  const textoObservacion = data.tipo_registro === 'CELESTE' ? 'CELESTE' : (data.tipo_registro === 'VERDE' ? 'VERDE' : 'OBRAS');

  try {
    const { error } = await supabaseClient
      .from('historial_ingresos')
      .insert([{
        dni: data.dni,
        nombre_trabajador: data.nombre_completo,
        codigo_casa: data.codigo_casa,
        propietario: data.propietario,
        codigo_carnet: (esCeleste || data.tipo_registro === 'VERDE') ? data.codigo_fotocheck : null,
        estado: 'PERMITIDO',
        observaciones: textoObservacion,
        placa: placaValue
      }]);

    if (error) throw error;

    // Animación de Éxito
    container.innerHTML = `
      <div class="${esCeleste ? 'bg-sky-600' : 'bg-emerald-600'} text-white rounded-2xl p-6 text-center space-y-3 shadow-xl animate-pop">
        <div class="w-20 h-20 bg-white ${esCeleste ? 'text-sky-600' : 'text-emerald-600'} rounded-full flex items-center justify-center mx-auto shadow-md">
          <svg class="w-12 h-12 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="4" d="M5 13l4 4L19 7"></path>
          </svg>
        </div>
        <h2 class="text-2xl font-black tracking-wider uppercase">¡REGISTRADO!</h2>
      </div>
    `;

    setTimeout(() => {
      if (currentSearchMode === 'celeste') {
        document.getElementById("dniInput").value = "C";
      } else if (currentSearchMode === 'verde') {
        document.getElementById("dniInput").value = "V";
      } else {
        document.getElementById("dniInput").value = "";
      }
      container.classList.add("hidden");
      currentValidatedWorkers = [];
      document.getElementById("dniInput").focus();
      cargarTrabajadoresEnObra();
      isRegistering = false;
    }, 1400);

  } catch (err) {
    console.error("Error al registrar ingreso:", err);
    alert("Ocurrió un error al registrar el ingreso. Intente nuevamente.");
    isRegistering = false;
    allActionBtns.forEach(btn => {
      btn.disabled = false;
    });
    if (btnElement) {
      btnElement.innerHTML = originalBtnHtml;
    }
  }
}

let currentCategoryFilter = 'TODOS'; // 'TODOS', 'OBRAS', 'CELESTE', 'VERDE'

function setFiltroEnObra(categoria) {
  currentCategoryFilter = categoria;

  // Actualizar estilos de las pastillas (pills)
  const pills = {
    'TODOS': document.getElementById("pillFiltroTodos"),
    'OBRAS': document.getElementById("pillFiltroObras"),
    'CELESTE': document.getElementById("pillFiltroCeleste"),
    'VERDE': document.getElementById("pillFiltroVerde"),
  };

  const activoCls = "py-2 px-1 rounded-lg transition-all text-center bg-white border border-slate-400 text-slate-950 shadow-md font-black";
  const inactivoCls = "py-2 px-1 rounded-lg transition-all text-center text-slate-900 hover:text-black font-extrabold";

  Object.keys(pills).forEach(cat => {
    if (pills[cat]) {
      pills[cat].className = (cat === categoria) ? activoCls : inactivoCls;
    }
  });

  filtrarTrabajadoresEnObra();
}

function actualizarContadoresCategoria(todos) {
  const cntTodos = document.getElementById("cntFiltroTodos");
  const cntObras = document.getElementById("cntFiltroObras");
  const cntCeleste = document.getElementById("cntFiltroCeleste");
  const cntVerde = document.getElementById("cntFiltroVerde");

  if (!cntTodos) return;

  const total = todos.length;
  let obras = 0;
  let celestes = 0;
  let verdes = 0;

  todos.forEach(w => {
    if (w.observaciones === 'CELESTE') celestes++;
    else if (w.observaciones === 'VERDE') verdes++;
    else obras++; // OBRAS o SCTR
  });

  cntTodos.innerText = total;
  cntObras.innerText = obras;
  cntCeleste.innerText = celestes;
  cntVerde.innerText = verdes;
}

// Cargar y Renderizar Trabajadores en Obra
async function cargarTrabajadoresEnObra() {
  if (!supabaseClient) return;

  const { data } = await supabaseClient
    .from('historial_ingresos')
    .select('id, dni, nombre_trabajador, codigo_casa, propietario, observaciones, codigo_carnet, created_at, placa')
    .is('fecha_salida', null)
    .eq('estado', 'PERMITIDO')
    .order('created_at', { ascending: false });

  window.cacheEnObra = data || [];
  actualizarContadoresCategoria(window.cacheEnObra);
  filtrarTrabajadoresEnObra();
}

function renderListaEnObra(items) {
  const container = document.getElementById("listaEnObra");
  const badgeNav = document.getElementById("navBadgeEnObra");
  const badgeCount = document.getElementById("badgeCountEnObra");

  if (!container || !badgeNav || !badgeCount) return;

  const totalEnObra = window.cacheEnObra ? window.cacheEnObra.length : items.length;
  badgeCount.innerText = `${totalEnObra} persona${totalEnObra === 1 ? '' : 's'}`;
  
  if (totalEnObra > 0) {
    badgeNav.innerText = totalEnObra;
    badgeNav.classList.remove("hidden");
    badgeNav.classList.add("flex");
  } else {
    badgeNav.classList.add("hidden");
    badgeNav.classList.remove("flex");
  }

  if (items.length === 0) {
    container.innerHTML = `
      <div class="text-center py-8 bg-white border border-slate-300 rounded-2xl p-4 text-slate-800 font-bold text-xs shadow-sm">
        ${window.cacheEnObra && window.cacheEnObra.length > 0 ? 'No hay resultados para este filtro o búsqueda.' : 'No hay personal dentro del condominio actualmente.'}
      </div>
    `;
    return;
  }

  container.innerHTML = items.map(w => {
    const hora = new Date(w.created_at).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' });
    const esCeleste = w.observaciones === 'CELESTE';
    const esVerde = w.observaciones === 'VERDE';
    const propietarioNombre = w.propietario || `Casa ${w.codigo_casa}`;

    let textoVisualDestino = propietarioNombre;
    if (esCeleste && w.codigo_carnet) {
      textoVisualDestino = `💳 ${w.codigo_carnet} - ${propietarioNombre}`;
    } else if (esVerde && w.codigo_carnet) {
      textoVisualDestino = `🌿 ${w.codigo_carnet} - ${propietarioNombre}`;
    }

    let badgeEstilo = 'bg-blue-100 text-blue-950 border-blue-300 font-bold';
    if (esCeleste) {
      badgeEstilo = 'bg-sky-100 text-sky-950 border-sky-300 font-extrabold';
    } else if (esVerde) {
      badgeEstilo = 'bg-emerald-100 text-emerald-950 border-emerald-300 font-extrabold';
    }

    const badgePlaca = w.placa
      ? `<span class="bg-slate-800 text-white px-2 py-0.5 rounded text-[10px] font-black tracking-wider flex items-center gap-1"><img src="iconos/carro.svg" class="w-3.5 h-3.5 invert" alt="Auto"> ${w.placa}</span>`
      : '';

    return `
      <div class="bg-white border-2 border-slate-300 rounded-xl p-3.5 flex items-center justify-between gap-3 shadow-sm transition-all">
        <div class="space-y-1 min-w-0 flex-1">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="${badgeEstilo} border text-[10px] px-2 py-0.5 rounded truncate max-w-full">
              ${textoVisualDestino}
            </span>
            ${badgePlaca}
          </div>

          <h4 class="font-extrabold text-slate-950 text-sm truncate">${w.nombre_trabajador}</h4>

          <div class="flex items-center gap-2 text-xs text-slate-950 font-extrabold flex-wrap">
            <span>DNI: ${w.dni}</span>
            <span class="text-slate-400 font-bold">•</span>
            <span class="text-emerald-900 font-black">Ingresó ${hora}</span>
          </div>
        </div>

        <button 
          onclick="marcarSalida(${w.id || `'${w.dni}'`})" 
          class="bg-red-600 hover:bg-red-700 active:scale-95 text-white px-3.5 py-2 rounded-xl text-xs font-black shrink-0 transition-all flex items-center gap-1 shadow-md shadow-red-600/20 tracking-wide uppercase"
        >
          <span>Salida</span>
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
          </svg>
        </button>
      </div>
    `;
  }).join('');
}

function filtrarTrabajadoresEnObra() {
  if (!window.cacheEnObra) return;

  const searchInput = document.getElementById("searchEnObra");
  const q = searchInput ? searchInput.value.toLowerCase().trim() : "";

  // Si el usuario escribe en el buscador, activamos automáticamente 'TODOS'
  // para que busque globalmente y ningún vigilante se confunda
  if (q !== "" && currentCategoryFilter !== 'TODOS') {
    currentCategoryFilter = 'TODOS';
    const pills = {
      'TODOS': document.getElementById("pillFiltroTodos"),
      'OBRAS': document.getElementById("pillFiltroObras"),
      'CELESTE': document.getElementById("pillFiltroCeleste"),
      'VERDE': document.getElementById("pillFiltroVerde"),
    };
    const activoCls = "py-2 px-1 rounded-lg transition-all text-center bg-white border border-slate-400 text-slate-950 shadow-md font-black";
    const inactivoCls = "py-2 px-1 rounded-lg transition-all text-center text-slate-900 hover:text-black font-extrabold";

    Object.keys(pills).forEach(cat => {
      if (pills[cat]) {
        pills[cat].className = (cat === 'TODOS') ? activoCls : inactivoCls;
      }
    });
  }

  let filtrados = window.cacheEnObra;

  // 1. Si NO está buscando por texto, respeta la pastilla seleccionada
  if (q === "") {
    if (currentCategoryFilter === 'CELESTE') {
      filtrados = filtrados.filter(w => w.observaciones === 'CELESTE');
    } else if (currentCategoryFilter === 'VERDE') {
      filtrados = filtrados.filter(w => w.observaciones === 'VERDE');
    } else if (currentCategoryFilter === 'OBRAS') {
      filtrados = filtrados.filter(w => w.observaciones !== 'CELESTE' && w.observaciones !== 'VERDE');
    }
  } else {
    // 2. Si SÍ está buscando texto, busca en el 100% de los trabajadores registrados
    filtrados = filtrados.filter(w =>
      (w.nombre_trabajador && w.nombre_trabajador.toLowerCase().includes(q)) ||
      (w.dni && w.dni.includes(q)) ||
      (w.propietario && w.propietario.toLowerCase().includes(q)) ||
      (w.codigo_carnet && w.codigo_carnet.toLowerCase().includes(q)) ||
      (w.placa && w.placa.toLowerCase().includes(q))
    );
  }

  renderListaEnObra(filtrados);
}

async function marcarSalida(idOrDni) {
  if (!supabaseClient) return;
  const horaPeru = new Date().toLocaleString("sv-SE", { timeZone: "America/Lima" });

  if (typeof idOrDni === 'number') {
    await supabaseClient
      .from('historial_ingresos')
      .update({ fecha_salida: horaPeru })
      .eq('id', idOrDni);
  } else {
    await supabaseClient
      .from('historial_ingresos')
      .update({ fecha_salida: horaPeru })
      .eq('dni', idOrDni)
      .is('fecha_salida', null);
  }

  cargarTrabajadoresEnObra();
}

// Inicialización de Eventos y Startup
document.addEventListener("DOMContentLoaded", () => {
  const dniInput = document.getElementById("dniInput");

  if (dniInput) {
    dniInput.addEventListener("keypress", function (e) {
      if (e.key === "Enter") {
        this.blur();
        validarDNI();
      }
    });

    dniInput.addEventListener("input", function () {
      let raw = this.value.toUpperCase();
      if (currentSearchMode === 'celeste') {
        if (!raw.startsWith("C")) {
          raw = "C" + raw.replace(/[^0-9]/g, "");
        } else {
          raw = "C" + raw.substring(1).replace(/[^0-9]/g, "");
        }
        this.value = raw;
      } else if (currentSearchMode === 'verde') {
        if (!raw.startsWith("V")) {
          raw = "V" + raw.replace(/[^0-9]/g, "");
        } else {
          raw = "V" + raw.substring(1).replace(/[^0-9]/g, "");
        }
        this.value = raw;
      }
    });
  }

  initSupabase();
  cargarTrabajadoresEnObra();
});
