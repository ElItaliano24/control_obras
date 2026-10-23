// dashboard.js - Lógica del Panel Gerencial y Métricas
let mainChart = null;
let donutChart = null;
let currentMonthRecords = [];

const NOMBRES_MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const ANIO_INICIO = 2026;
const MES_INICIO = 9; // Octubre (base 0)

document.addEventListener('DOMContentLoaded', async () => {
  inicializarSelectoresFecha();
  if (typeof initSupabase === 'function') {
    initSupabase();
  }
  await cargarDashboard();
});

// Inicializar selectores de año y mes: solo desde Octubre del año de inicio en adelante
function inicializarSelectoresFecha() {
  const hoy = new Date();
  const selectYear = document.getElementById('selectYear');

  const anioActual = Math.max(ANIO_INICIO, hoy.getFullYear());
  selectYear.innerHTML = '';

  // Solo desde el año de inicio hacia adelante (sin años anteriores vacíos)
  for (let anio = ANIO_INICIO; anio <= anioActual + 2; anio++) {
    const opt = document.createElement('option');
    opt.value = anio;
    opt.textContent = anio;
    if (anio === anioActual) opt.selected = true;
    selectYear.appendChild(opt);
  }

  // forzarMesActual = true para que al entrar se posicione SIEMPRE en el mes en el que te encuentras
  actualizarOpcionesMeses(true);
}

function actualizarOpcionesMeses(forzarMesActual = false) {
  const anioSeleccionado = parseInt(document.getElementById('selectYear').value, 10);
  const selectMonth = document.getElementById('selectMonth');
  const valorPrevio = forzarMesActual ? null : selectMonth.value;

  selectMonth.innerHTML = '';

  const hoy = new Date();
  const mesDesde = (anioSeleccionado === ANIO_INICIO) ? MES_INICIO : 0;

  // Primero los meses correspondientes (Octubre, Noviembre, Diciembre...)
  for (let m = mesDesde; m < 12; m++) {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = NOMBRES_MESES[m];
    selectMonth.appendChild(opt);
  }

  // Opción general para ver todo el acumulado histórico al final
  const optAll = document.createElement('option');
  optAll.value = 'ALL';
  optAll.textContent = 'Histórico Completo';
  selectMonth.appendChild(optAll);

  // Seleccionar automáticamente el mes actual
  if (!forzarMesActual && valorPrevio !== null && valorPrevio !== undefined && valorPrevio !== '' && valorPrevio !== 'ALL') {
    selectMonth.value = valorPrevio;
  } else if (anioSeleccionado === hoy.getFullYear() && hoy.getMonth() >= mesDesde) {
    selectMonth.value = hoy.getMonth();
  } else {
    selectMonth.value = mesDesde;
  }
}

async function cambiarAnio() {
  actualizarOpcionesMeses();
  await cargarDashboard();
}

async function cambiarMes() {
  await cargarDashboard();
}

// Función auxiliar para paginar en Supabase y superar el límite de 1000 registros por consulta
async function obtenerRegistrosPaginados(filtroFecha) {
  let acumulados = [];
  let desde = 0;
  const chunk = 1000;
  let continuar = true;

  while (continuar) {
    let query = supabaseClient
      .from('historial_ingresos')
      .select('id, created_at, fecha_salida, dni, nombre_trabajador, codigo_casa, propietario, observaciones, estado, placa');

    if (filtroFecha && filtroFecha.inicio && filtroFecha.fin) {
      query = query
        .gte('created_at', filtroFecha.inicio)
        .lte('created_at', filtroFecha.fin);
    }

    const { data, error } = await query
      .order('created_at', { ascending: true })
      .range(desde, desde + chunk - 1);

    if (error) {
      console.error("Error al paginar registros:", error);
      break;
    }

    if (!data || data.length === 0) {
      continuar = false;
    } else {
      acumulados = acumulados.concat(data);
      if (data.length < chunk) {
        continuar = false;
      } else {
        desde += chunk;
      }
    }
  }

  return acumulados;
}

// Carga principal de datos y actualización de gráficos
async function cargarDashboard() {
  mostrarCargando(true);

  const valorMes = document.getElementById('selectMonth').value;
  const anio = parseInt(document.getElementById('selectYear').value);
  const esHistoricoCompleto = (valorMes === 'ALL');

  try {
    if (!supabaseClient) {
      console.warn("Cliente de Supabase no listo.");
      mostrarCargando(false);
      return;
    }

    // 1. Consultar quién está dentro ahora mismo (tiempo real)
    const { count: dentroCount } = await supabaseClient
      .from('historial_ingresos')
      .select('*', { count: 'exact', head: true })
      .is('fecha_salida', null);

    document.getElementById('kpiDentroAhora').textContent = (dentroCount || 0).toLocaleString();

    let registros = [];
    let totalDiasMes = 30;
    let categoriasEjeX = [];
    let conteoDiario = [];

    if (esHistoricoCompleto) {
      // MODO HISTÓRICO COMPLETO (Traer todos los registros mediante paginación sin límite de 1000)
      registros = await obtenerRegistrosPaginados(null);
      currentMonthRecords = registros;

      const chartSub = document.getElementById('chartSubheading');
      if (chartSub) chartSub.textContent = `Mostrando todo el historial acumulado (${registros.length.toLocaleString()} registros)`;

      // Agrupar por mes/año para el gráfico
      const mesesMap = {};
      registros.forEach(rec => {
        if (!rec.created_at) return;
        const f = rec.created_at.split('T')[0].split(' ')[0]; // YYYY-MM-DD
        const anioMes = f.substring(0, 7); // YYYY-MM
        mesesMap[anioMes] = (mesesMap[anioMes] || 0) + 1;
      });

      const mesesOrdenados = Object.keys(mesesMap).sort();
      categoriasEjeX = mesesOrdenados.map(am => {
        const [a, m] = am.split('-');
        return `${NOMBRES_MESES[parseInt(m, 10) - 1].substring(0, 3)} ${a.substring(2)}`;
      });
      conteoDiario = mesesOrdenados.map(am => mesesMap[am]);

      // KPIs
      document.getElementById('kpiTotalMes').textContent = registros.length.toLocaleString();
      const promedio = (registros.length / Math.max(1, mesesOrdenados.length)).toFixed(1);
      document.getElementById('kpiPromedioDia').textContent = promedio;

      let maxVal = 0;
      let mesPicoStr = '--';
      mesesOrdenados.forEach(am => {
        if (mesesMap[am] > maxVal) {
          maxVal = mesesMap[am];
          mesPicoStr = am;
        }
      });
      document.getElementById('kpiDiaPicoCantidad').textContent = maxVal.toLocaleString();
      document.getElementById('kpiDiaPicoFecha').textContent = mesPicoStr;

    } else {
      // MODO MES ESPECÍFICO
      const mes = parseInt(valorMes, 10);
      const ultimoDia = new Date(anio, mes + 1, 0);
      totalDiasMes = ultimoDia.getDate();

      const mStr = String(mes + 1).padStart(2, '0');
      const dStr = String(totalDiasMes).padStart(2, '0');

      // Cubrimos ambos formatos de timestamp (con espacio o con T)
      const filtro = {
        inicio: `${anio}-${mStr}-01 00:00:00`,
        fin: `${anio}-${mStr}-${dStr} 23:59:59`
      };

      registros = await obtenerRegistrosPaginados(filtro);
      currentMonthRecords = registros;

      const chartSub = document.getElementById('chartSubheading');
      if (chartSub) {
        chartSub.textContent = `Tendencia de personas ingresadas en ${NOMBRES_MESES[mes]} ${anio}`;
      }

      // Preparar días del 1 al 31
      conteoDiario = new Array(totalDiasMes).fill(0);
      categoriasEjeX = [];
      for (let d = 1; d <= totalDiasMes; d++) {
        categoriasEjeX.push(`${d}`);
      }

      registros.forEach(rec => {
        if (!rec.created_at) return;
        const fechaStr = rec.created_at.split('T')[0].split(' ')[0];
        const partes = fechaStr.split('-');
        if (partes.length === 3) {
          const diaIndex = parseInt(partes[2], 10) - 1;
          if (diaIndex >= 0 && diaIndex < totalDiasMes) {
            conteoDiario[diaIndex]++;
          }
        }
      });

      // KPIs del mes
      const totalMes = registros.length;
      document.getElementById('kpiTotalMes').textContent = totalMes.toLocaleString();

      const hoy = new Date();
      const esMesActual = (hoy.getMonth() === mes && hoy.getFullYear() === anio);
      const diasTranscurridos = esMesActual ? Math.max(1, hoy.getDate()) : totalDiasMes;
      const promedio = (totalMes / diasTranscurridos).toFixed(1);
      document.getElementById('kpiPromedioDia').textContent = promedio;

      let maxIngresos = 0;
      let diaPicoNum = 1;
      conteoDiario.forEach((cant, idx) => {
        if (cant > maxIngresos) {
          maxIngresos = cant;
          diaPicoNum = idx + 1;
        }
      });
      document.getElementById('kpiDiaPicoCantidad').textContent = maxIngresos.toLocaleString();
      document.getElementById('kpiDiaPicoFecha').textContent = maxIngresos > 0 ? `Día ${diaPicoNum}` : 'Sin datos';
    }

    // 3. Procesar conteo por propietarios/casas y tipo de personal
    const mapaCasasPropietarios = {};
    const conteoPorTipo = { 'OBRAS': 0, 'CELESTE': 0, 'VERDE': 0 };

    registros.forEach(rec => {
      // Agrupar por casa y asociar su propietario
      const casa = (rec.codigo_casa || '').trim().toUpperCase();
      const propietario = (rec.propietario || '').trim();

      if (casa) {
        if (!mapaCasasPropietarios[casa]) {
          mapaCasasPropietarios[casa] = {
            casa: casa,
            propietario: propietario || 'Sin Propietario',
            cantidad: 0
          };
        } else if (propietario && (mapaCasasPropietarios[casa].propietario === 'Sin Propietario' || !mapaCasasPropietarios[casa].propietario)) {
          mapaCasasPropietarios[casa].propietario = propietario;
        }
        mapaCasasPropietarios[casa].cantidad++;
      }

      // Conteo por tipo de personal (Solo los 3 existentes)
      const obs = (rec.observaciones || '').toUpperCase();
      if (obs.includes('CELESTE')) {
        conteoPorTipo['CELESTE']++;
      } else if (obs.includes('VERDE')) {
        conteoPorTipo['VERDE']++;
      } else {
        // En este sistema todo lo demás es Obras
        conteoPorTipo['OBRAS']++;
      }
    });

    // 4. Renderizar Gráfico de Área Suave
    const labelX = esHistoricoCompleto ? 'Meses' : NOMBRES_MESES[parseInt(valorMes, 10)];
    renderizarAreaChart(categoriasEjeX, conteoDiario, labelX);

    // 5. Renderizar Top Casas / Propietarios
    renderizarTopCasas(mapaCasasPropietarios, registros.length);

    // 6. Renderizar Donut Chart (Solo 3 tipos)
    renderizarDonutChart(conteoPorTipo);

  } catch (e) {
    console.error("Excepción en dashboard:", e);
  } finally {
    mostrarCargando(false);
  }
}

// Renderizar el Smooth Area Chart con ApexCharts
function renderizarAreaChart(dias, datos, nombreMes) {
  const chartContainer = document.querySelector("#chartContainer");

  const options = {
    series: [{
      name: 'Personas Ingresadas',
      data: datos
    }],
    chart: {
      type: 'area',
      height: 340,
      fontFamily: 'Inter, sans-serif',
      toolbar: {
        show: true,
        tools: {
          download: true,
          selection: false,
          zoom: false,
          zoomin: false,
          zoomout: false,
          pan: false,
          reset: false
        }
      },
      animations: {
        enabled: true,
        easing: 'easeinout',
        speed: 700
      }
    },
    colors: ['#2563eb'], // Azul corporativo elegante
    stroke: {
      curve: 'smooth',
      width: 3
    },
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.45,
        opacityTo: 0.05,
        stops: [0, 90, 100]
      }
    },
    dataLabels: {
      enabled: false
    },
    grid: {
      borderColor: '#f1f5f9',
      strokeDashArray: 4,
      yaxis: { lines: { show: true } },
      xaxis: { lines: { show: false } }
    },
    xaxis: {
      categories: dias,
      title: {
        text: `Días de ${nombreMes}`,
        style: { color: '#94a3b8', fontSize: '11px', fontWeight: 600 }
      },
      labels: {
        style: { colors: '#64748b', fontSize: '11px', fontWeight: 600 },
        hideOverlappingLabels: true
      },
      axisBorder: { show: false },
      axisTicks: { show: false }
    },
    yaxis: {
      title: {
        text: 'N° Ingresos',
        style: { color: '#94a3b8', fontSize: '11px', fontWeight: 600 }
      },
      labels: {
        style: { colors: '#64748b', fontSize: '11px', fontWeight: 600 },
        formatter: (val) => Math.round(val)
      },
      min: 0
    },
    tooltip: {
      theme: 'light',
      x: {
        formatter: (val) => `${nombreMes} ${val}`
      },
      y: {
        formatter: (val) => `${val} personas`
      }
    },
    markers: {
      size: 3,
      colors: ['#2563eb'],
      strokeColors: '#ffffff',
      strokeWidth: 2,
      hover: { size: 6 }
    }
  };

  if (mainChart) {
    mainChart.destroy();
  }

  mainChart = new ApexCharts(chartContainer, options);
  mainChart.render();
}

// Renderizar Top 5 Propietarios y Casas con mayor afluencia
function renderizarTopCasas(mapaCasas, totalIngresos) {
  const container = document.getElementById('topCasasContainer');
  if (!container) return;

  const ordenadas = Object.values(mapaCasas)
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 5);

  if (ordenadas.length === 0) {
    container.innerHTML = `<div class="text-xs text-slate-400 py-6 text-center">No hay registros de ingresos en este período.</div>`;
    return;
  }

  let html = '';
  const maxVal = ordenadas[0].cantidad;

  ordenadas.forEach((item, idx) => {
    const porcentajeRelativo = Math.round((item.cantidad / maxVal) * 100);
    const porcentajeTotal = totalIngresos > 0 ? ((item.cantidad / totalIngresos) * 100).toFixed(1) : 0;
    
    html += `
      <div class="space-y-1.5 p-2 rounded-xl hover:bg-slate-50 transition-colors">
        <div class="flex items-center justify-between text-xs gap-3">
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="w-6 h-6 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center text-[11px] font-black shrink-0 border border-blue-100">#${idx + 1}</span>
            <div class="min-w-0" title="${item.casa ? 'Casa: ' + item.casa : ''}">
              <span class="font-extrabold text-slate-900 block truncate leading-tight">${item.propietario || item.casa}</span>
            </div>
          </div>
          <div class="text-right shrink-0">
            <span class="text-slate-900 font-extrabold text-xs">${item.cantidad}</span>
            <span class="text-[10px] text-slate-400 font-medium block">${porcentajeTotal}% del total</span>
          </div>
        </div>
        <div class="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
          <div class="bg-blue-600 h-1.5 rounded-full transition-all duration-500" style="width: ${porcentajeRelativo}%"></div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// Renderizar Donut Chart de tipos de personal (Solo los 3 tipos del sistema)
function renderizarDonutChart(conteoPorTipo) {
  const container = document.querySelector("#donutChartContainer");
  if (!container) return;

  const etiquetas = Object.keys(conteoPorTipo);
  const valores = Object.values(conteoPorTipo);
  const totalValores = valores.reduce((a, b) => a + b, 0);

  if (totalValores === 0) {
    container.innerHTML = `<div class="text-xs text-slate-400 py-8 text-center">Sin datos en el período seleccionado.</div>`;
    return;
  }

  const options = {
    series: valores,
    labels: etiquetas,
    chart: {
      type: 'donut',
      height: 250,
      fontFamily: 'Inter, sans-serif'
    },
    colors: ['#2563eb', '#0284c7', '#10b981'], // Obras (Azul), Celestes (Cielo), Verdes (Esmeralda)
    legend: {
      position: 'bottom',
      fontSize: '12px',
      fontWeight: 600,
      labels: { colors: '#64748b' }
    },
    dataLabels: {
      enabled: true,
      formatter: (val) => `${Math.round(val)}%`
    },
    plotOptions: {
      pie: {
        donut: {
          size: '65%',
          labels: {
            show: true,
            total: {
              show: true,
              label: 'Total',
              fontSize: '12px',
              fontWeight: 700,
              color: '#64748b',
              formatter: () => totalValores.toLocaleString()
            }
          }
        }
      }
    },
    tooltip: {
      y: {
        formatter: (val) => `${val} personas`
      }
    }
  };

  if (donutChart) {
    donutChart.destroy();
  }

  donutChart = new ApexCharts(container, options);
  donutChart.render();
}

// Exportar datos a archivo Excel (.xlsx) real con el formato exacto de tu Google Sheets
function exportarExcel() {
  if (!currentMonthRecords || currentMonthRecords.length === 0) {
    alert("No hay registros para exportar en este mes.");
    return;
  }

  const valorMes = document.getElementById('selectMonth').value;
  const anio = document.getElementById('selectYear').value;
  const nombreMes = valorMes === 'ALL' ? 'Historico_Completo' : NOMBRES_MESES[parseInt(valorMes, 10)];

  // Encabezados idénticos a tu Google Sheets
  const headers = [
    "NOMBRE",
    "PROPIETARIO",
    "DNI",
    "FECHA",
    "HORA INGRESO",
    "HORA SALIDA",
    "VEHICULO PLACA",
    "OBSERVACIONES"
  ];

  // Filas formateadas
  const filas = currentMonthRecords.map(r => {
    let fechaStr = "";
    let horaIngresoStr = "";
    if (r.created_at) {
      const partes = r.created_at.split(/[T ]/);
      if (partes[0]) {
        const fPartes = partes[0].split('-');
        if (fPartes.length === 3) {
          fechaStr = `${fPartes[2]}/${fPartes[1]}/${fPartes[0]}`; // DD/MM/YYYY
        } else {
          fechaStr = partes[0];
        }
      }
      if (partes[1]) {
        horaIngresoStr = partes[1].split('.')[0]; // HH:MM:SS
      }
    }

    let horaSalidaStr = "";
    if (r.fecha_salida) {
      const partesSalida = r.fecha_salida.split(/[T ]/);
      horaSalidaStr = (partesSalida[1] || partesSalida[0]).split('.')[0];
    }

    return [
      r.nombre_trabajador || '',
      r.propietario || '',
      r.dni || '',
      fechaStr,
      horaIngresoStr,
      horaSalidaStr,
      r.placa || '',
      r.observaciones || ''
    ];
  });

  // Si SheetJS está cargado, generar archivo .xlsx nativo de Excel
  if (typeof XLSX !== 'undefined') {
    const aoa = [headers, ...filas];
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Autoajustar ancho de columnas para que no salgan textos cortados
    ws['!cols'] = headers.map((h, i) => {
      let maxLen = h.length;
      filas.forEach(row => {
        const val = row[i] ? String(row[i]) : '';
        if (val.length > maxLen) maxLen = val.length;
      });
      return { wch: Math.min(Math.max(maxLen + 3, 12), 45) };
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Control_Obras");

    XLSX.writeFile(wb, `control_obras_${nombreMes}_${anio}.xlsx`);
  } else {
    // Respaldo en CSV si no hubiera conexión al CDN
    let csvContent = "\uFEFF" + headers.join(";") + "\n";
    filas.forEach(f => {
      csvContent += f.map(v => `"${String(v).replace(/"/g, '""')}"`).join(";") + "\n";
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `control_obras_${nombreMes}_${anio}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

function mostrarCargando(estado) {
  const el = document.getElementById('loadingIndicator');
  if (el) {
    if (estado) el.classList.remove('hidden');
    else el.classList.add('hidden');
  }
}
