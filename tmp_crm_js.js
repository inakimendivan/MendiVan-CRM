
// =========================================================
// ALERTAS ENGINE
// =========================================================
function calcAlertasVehiculo(v, c) {
  const alerts = [];
  const dias = daysSince(v.fecha_ultima_actualizacion);
  const fase = v.fase_actual || 0;

  if (v.estado === 'activo' && dias > 5)
    alerts.push({ msg: `Sin actualizar hace ${dias} días`, level:'warn' });
  if (fase > 2 && !vTarea(v,'dni_recibido'))
    alerts.push({ msg:'Falta DNI del cliente antes de Fase 3', level:'danger' });
  if (!v.tiene_coc && v.ventanas_originales === false)
    alerts.push({ msg:'Sin COC y tiene ventanas laterales — verificar legalidad importación', level:'danger' });

  const km_cv = parseInt(v.km) || 0;
  const km_car = parseInt(v.km_carvertical) || 0;
  if (km_car && Math.abs(km_cv - km_car) > 20000)
    alerts.push({ msg:`CarVertical muestra discrepancia de km > 20.000 (odómetro: ${km_cv.toLocaleString()} vs CarVertical: ${km_car.toLocaleString()})`, level:'danger' });
  if (v.pintura_excedida)
    alerts.push({ msg:'Informe de revisión: pintura >150µm en zonas estructurales', level:'danger' });
  if (v.tipo_carroceria === 'Furgoneta' && v.uso_wohnmobil && !v.iedmt_calculado)
    alerts.push({ msg:'Vehículo M1 Wohnmobil: no se ha calculado la bonificación IEDMT 30%', level:'warn' });

  return alerts;
}

function vTarea(v, id) { return v.tareas && v.tareas[id]; }

// =========================================================
// FORM HELPERS
// =========================================================
function fld(name, label, value, type, id, objType, specialField) {
  const sf = specialField || name;
  return `<div class="form-group">
    <label class="form-label">${label}</label>
    <input type="${type}" class="form-control" value="${esc(value||'')}"
      onchange="updateField('${id}','${objType}','${sf}',this.value)">
  </div>`;
}

function inputField(id, label, value, type) {
  return `<div class="form-group">
    <label class="form-label">${label}</label>
    <input type="${type}" class="form-control" id="${id}" value="${esc(value||'')}">
  </div>`;
}

// =========================================================
// CLIENTES LIST
// =========================================================
function renderClientesList() {
  const query = (document.getElementById('search-input').value || '').toLowerCase();
  const grid = document.getElementById('clientes-grid');

  const list = Object.values(clientes).filter(c => {
    if (!query) return true;
    return (c.nombre||'').toLowerCase().includes(query) ||
           (c.telefono||'').includes(query) ||
           (c.localidad||'').toLowerCase().includes(query);
  }).sort((a,b) => (b.fecha_ultima_interaccion||'').localeCompare(a.fecha_ultima_interaccion||''));

  if (!list.length) {
    grid.innerHTML = `<div class="empty-state"><div class="icon">👥</div><p>No hay clientes todavía.<br>Crea el primero con el botón "Nuevo cliente".</p></div>`;
    return;
  }

  grid.innerHTML = list.map(c => {
    const vehicActivos = Object.values(vehiculos).filter(v => v.cliente_id === c.id && v.estado === 'activo').length;
    const dias = daysSince(c.fecha_ultima_interaccion);
    const stale = dias > 5;
    return `<div class="cliente-card ${stale?'stale':''}" onclick="openCliente('${c.id}')">
      <div>
        <div class="cliente-name">${esc(c.nombre||'Sin nombre')}${stale?` <span title="Sin actualizar hace ${dias} días" style="color:var(--highlight)">⚠</span>`:''}</div>
        <div class="cliente-meta">
          <span>📞 ${esc(c.telefono||'—')}</span>
          <span>📍 ${esc(c.localidad||'—')}</span>
          <span>🚗 ${vehicActivos} activo${vehicActivos!==1?'s':''}</span>
          <span>📅 ${formatDate(c.fecha_ultima_interaccion)}</span>
        </div>
        <div class="cliente-meta" style="margin-top:4px"><span>→ ${esc(c.proxima_accion||'—')}</span></div>
      </div>
      <div class="cliente-actions">${pipelineBadge(c.estado_pipeline||'nuevo')}</div>
    </div>`;
  }).join('');
}

// =========================================================
// OPEN CLIENTE
// =========================================================
function openCliente(id) {
  currentClienteId = id;
  const c = clientes[id];
  if (!c) return;
  document.getElementById('fc-nombre').textContent = c.nombre || 'Sin nombre';
  document.getElementById('fc-pipeline-badge').innerHTML = pipelineBadge(c.estado_pipeline||'nuevo');
  document.querySelectorAll('.tab-inner').forEach((t,i) => t.classList[i===0?'add':'remove']('active'));
  switchClienteTab('info');
  showView('ficha-cliente');
}

function switchClienteTab(tab) {
  document.querySelectorAll('.tab-inner').forEach(t => {
    t.classList.remove('active');
    if (tab==='info' && t.textContent.includes('Datos')) t.classList.add('active');
    if (tab==='vehiculos' && t.textContent.includes('Vehíc')) t.classList.add('active');
    if (tab==='notas' && t.textContent.includes('Notas')) t.classList.add('active');
  });
  document.querySelectorAll('.cliente-tab').forEach(el => el.style.display = 'none');
  document.getElementById(`cliente-tab-${tab}`).style.display = 'block';
  if (tab==='info') renderClienteInfo();
  else if (tab==='vehiculos') { renderClienteVehiculos(); attachVehiculoRowListener(); }
  else if (tab==='notas') renderClienteNotas();
}

function renderClienteInfo() {
  const c = clientes[currentClienteId];
  if (!c) return;
  const el = document.getElementById('cliente-tab-info');
  el.innerHTML = `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
    <div class="card">
      <div class="mini-section-title">Datos de contacto</div>
      <div class="form-row">
        ${fld('nombre','Nombre',c.nombre,'text',currentClienteId,'cliente')}
        ${fld('telefono','Teléfono',c.telefono,'tel',currentClienteId,'cliente')}
        ${fld('email','Email',c.email,'email',currentClienteId,'cliente')}
        ${fld('localidad','Localidad',c.localidad,'text',currentClienteId,'cliente')}
      </div>
      <div class="form-group">
        <label class="form-label">Canal de entrada</label>
        <select class="form-control" onchange="updateField('${currentClienteId}','cliente','canal_entrada',this.value)">
          ${CANALES.map(ch => `<option ${c.canal_entrada===ch?'selected':''}>${ch}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Estado pipeline</label>
        <select class="form-control" onchange="updatePipeline(this.value)">
          ${PIPELINE_ESTADOS.map(s => `<option value="${s}" ${c.estado_pipeline===s?'selected':''}>${PIPELINE_LABELS[s]}</option>`).join('')}
        </select>
      </div>
      ${fld('proxima_accion','Próxima acción',c.proxima_accion,'text',currentClienteId,'cliente')}
      <div class="form-row">
        ${fld('fecha_primer_contacto','Primer contacto',c.fecha_primer_contacto?.slice(0,10),'date',currentClienteId,'cliente')}
      </div>
    </div>
    <div class="card">
      <div class="mini-section-title">Búsqueda</div>
      ${fld('busca_tipo_vehiculo','Tipo vehículo',c.busca?.tipo_vehiculo||'','text',currentClienteId,'cliente','busca_tipo_vehiculo')}
      ${fld('busca_modelos','Modelos de interés',c.busca?.modelos||'','text',currentClienteId,'cliente','busca_modelos')}
      <div class="form-row">
        ${fld('busca_anyo_min','Año mínimo',c.busca?.anyo_min||'','number',currentClienteId,'cliente','busca_anyo_min')}
        ${fld('busca_anyo_max','Año máximo',c.busca?.anyo_max||'','number',currentClienteId,'cliente','busca_anyo_max')}
        ${fld('busca_km_max','Km máximo',c.busca?.km_max||'','number',currentClienteId,'cliente','busca_km_max')}
        ${fld('busca_presupuesto','Presupuesto total (€)',c.busca?.presupuesto_total||'','number',currentClienteId,'cliente','busca_presupuesto')}
      </div>
      <div class="form-group">
        <label class="form-label">Uso previsto</label>
        <select class="form-control" onchange="updateField('${currentClienteId}','cliente','busca_uso',this.value)">
          <option value="">— Seleccionar —</option>
          ${USOS.map(u => `<option ${(c.busca?.uso_previsto||'')===u?'selected':''}>${u}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Preferencias / notas búsqueda</label>
        <textarea class="form-control" rows="3" onchange="updateField('${currentClienteId}','cliente','busca_preferencias',this.value)">${esc(c.busca?.preferencias||'')}</textarea>
      </div>
    </div>
  </div>`;
}

function renderClienteVehiculos() {
  const vList = Object.values(vehiculos).filter(v => v.cliente_id === currentClienteId);
  const el = document.getElementById('cliente-tab-vehiculos');
  el.innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
      <button class="btn btn-primary" onclick="showNuevoVehiculoModal()">+ Añadir vehículo</button>
    </div>
    <div class="vehiculos-list">
      ${vList.length===0
        ? '<div class="empty-state"><div class="icon">🚗</div><p>Sin vehículos vinculados todavía.</p></div>'
        : vList.map(v => `
          <div class="vehiculo-row ${v.estado}" data-vehiculo-id="${v.id}" style="cursor:pointer" role="button">
            <div class="vehiculo-info">
              <div class="vehiculo-name">${esc(v.marca||'')} ${esc(v.modelo||'')} ${v.anyo||''}</div>
              <div class="vehiculo-meta">${v.km?v.km.toLocaleString()+' km · ':''}${v.combustible||''} · Fase ${v.fase_actual||0} · ${formatDate(v.fecha_ultima_actualizacion)}</div>
            </div>
            <div style="display:flex;gap:8px;align-items:center">
              <span class="badge ${v.estado==='activo'?'badge-green':v.estado==='seleccionado'?'badge-blue':'badge-gray'}">${v.estado}</span>
              ${daysSince(v.fecha_ultima_actualizacion)>5&&v.estado==='activo'?'<span title="Sin actualizar">⚠️</span>':''}
            </div>
          </div>`).join('')}
    </div>`;
  attachVehiculoRowListener();
}

function attachVehiculoRowListener() {
  const container = document.getElementById('cliente-tab-vehiculos');
  if (!container || container.dataset.vehiculoClickAttached) return;
  container.addEventListener('click', event => {
    const row = event.target.closest('.vehiculo-row');
    if (!row || !container.contains(row)) return;
    const vehicleId = row.dataset.vehiculoId;
    if (vehicleId) openVehiculo(vehicleId);
  });
  container.dataset.vehiculoClickAttached = '1';
}

function renderClienteNotas() {
  const c = clientes[currentClienteId];
  const notas = c.notas || [];
  const el = document.getElementById('cliente-tab-notas');
  el.innerHTML = `
    <div class="nota-add">
      <textarea class="form-control" id="nueva-nota-input" placeholder="Escribe una nota..." rows="2"></textarea>
      <button class="btn btn-primary" onclick="addNota()">Añadir</button>
    </div>
    <div class="notas-list">
      ${notas.length===0
        ? '<div class="empty-state"><div class="icon">📝</div><p>Sin notas todavía.</p></div>'
        : [...notas].reverse().map(n => `
          <div class="nota-item">
            <div class="nota-date">${formatDate(n.fecha)}</div>
            <div>${esc(n.texto)}</div>
          </div>`).join('')}
    </div>`;
}

function addNota() {
  const c = clientes[currentClienteId];
  if (!c) return;
  const input = document.getElementById('nueva-nota-input');
  const texto = input.value.trim();
  if (!texto) return;
  if (!c.notas) c.notas = [];
  c.notas.push({ fecha: new Date().toISOString(), texto });
  input.value = '';
  debounceSave('cliente', currentClienteId);
  renderClienteNotas();
}

function updatePipeline(val) {
  const c = clientes[currentClienteId];
  if (!c) return;
  c.estado_pipeline = val;
  document.getElementById('fc-pipeline-badge').innerHTML = pipelineBadge(val);
  debounceSave('cliente', currentClienteId);
}

// =========================================================
// VEHICULO
// =========================================================
function openVehiculo(id) {
  currentVehiculoId = id;
  const v = vehiculos[id];
  const c = clientes[v?.cliente_id];
  if (!v) return;

  document.getElementById('fv-titulo').textContent = `${v.marca||''} ${v.modelo||''} ${v.anyo||''}`.trim()||'Vehículo sin nombre';
  document.getElementById('veh-back-btn').onclick = () => { openCliente(v.cliente_id); switchClienteTab('vehiculos'); };

  document.getElementById('fv-badges').innerHTML = `
    <span class="badge ${v.estado==='activo'?'badge-green':v.estado==='seleccionado'?'badge-blue':'badge-gray'}">${v.estado||'activo'}</span>
    <span class="badge badge-gray">Fase ${v.fase_actual||0}</span>
    ${v.link_mobile?`<a href="${esc(v.link_mobile)}" target="_blank" class="link-ext">🔗 mobile.de</a>`:''}
    ${wpBadge(v)}`;

  renderAlertasVehiculo(v, c);
  renderFichaVehiculoLeft(v, c);
  renderFichaVehiculoRight(v, c);
  showView('ficha-vehiculo');
}

function backToCliente() {
  const v = vehiculos[currentVehiculoId];
  if (v) { openCliente(v.cliente_id); switchClienteTab('vehiculos'); }
  else showView('crm');
}

function renderAlertasVehiculo(v, c) {
  const alertas = calcAlertasVehiculo(v, c||{});
  const el = document.getElementById('fv-alertas');
  if (!alertas.length) { el.innerHTML = ''; return; }
  el.innerHTML = alertas.map(a => `
    <div class="alerta-item ${a.level==='danger'?'danger':''}">
      <span class="alerta-icon">${a.level==='danger'?'🚨':'⚠️'}</span>
      <span>${esc(a.msg)}</span>
    </div>`).join('');
}

function renderFichaVehiculoLeft(v, c) {
  const el = document.getElementById('fv-left');
  const id = v.id;
  el.innerHTML = `
  <div class="card" style="margin-bottom:16px">
    <div class="mini-section-title">Datos del vehículo</div>
    <div class="form-row">
      ${fld('marca','Marca',v.marca,'text',id,'vehiculo')}
      ${fld('modelo','Modelo',v.modelo,'text',id,'vehiculo')}
      ${fld('anyo','Año',v.anyo,'number',id,'vehiculo')}
      ${fld('km','Kilómetros',v.km,'number',id,'vehiculo')}
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Carrocería</label>
        <select class="form-control" onchange="updateField('${id}','vehiculo','tipo_carroceria',this.value)">
          ${CARROCERIAS.map(x => `<option ${v.tipo_carroceria===x?'selected':''}>${x}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Combustible</label>
        <select class="form-control" onchange="updateField('${id}','vehiculo','combustible',this.value)">
          ${COMBUSTIBLES.map(x => `<option ${v.combustible===x?'selected':''}>${x}</option>`).join('')}
        </select>
      </div>
      ${fld('potencia_cv','Potencia (CV)',v.potencia_cv,'number',id,'vehiculo')}
      ${fld('co2','CO₂ (g/km)',v.co2,'number',id,'vehiculo')}
    </div>
    <div class="form-row">
      ${fld('precio_alemania','Precio Alemania (€)',v.precio_alemania,'number',id,'vehiculo')}
      ${fld('concesionario','Concesionario',v.concesionario,'text',id,'vehiculo')}
    </div>
    ${fld('link_mobile','Link mobile.de',v.link_mobile,'url',id,'vehiculo')}
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Estado</label>
        <select class="form-control" onchange="updateVehEstado(this.value)">
          ${ESTADOS_VEH.map(s => `<option value="${s}" ${v.estado===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row" style="margin-top:4px">
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
        <input type="checkbox" ${v.tiene_coc?'checked':''} onchange="updateField('${id}','vehiculo','tiene_coc',this.checked)"> Tiene COC
      </label>
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
        <input type="checkbox" ${v.tiene_scheckheft?'checked':''} onchange="updateField('${id}','vehiculo','tiene_scheckheft',this.checked)"> Scheckheft completo
      </label>
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
        <input type="checkbox" ${v.ventanas_originales===false?'':'checked'} onchange="updateField('${id}','vehiculo','ventanas_originales',this.checked)"> Ventanas originales
      </label>
    </div>
  </div>
  <div id="veh-resumen-panel"></div>
  <div class="card" style="margin-bottom:16px">
    <div class="mini-section-title">Modalidad de transporte</div>
    <div style="display:flex;gap:12px;margin-bottom:12px">
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
        <input type="radio" name="modalidad_${id}" value="camion" ${(v.modalidad_transporte||'camion')==='camion'?'checked':''} onchange="updateField('${id}','vehiculo','modalidad_transporte',this.value)"> 🚛 Camión
      </label>
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
        <input type="radio" name="modalidad_${id}" value="conduccion" ${v.modalidad_transporte==='conduccion'?'checked':''} onchange="updateField('${id}','vehiculo','modalidad_transporte',this.value)"> 🚗 Conducción propia
      </label>
    </div>
  </div>

  <div class="card" style="margin-bottom:16px">
    <div class="mini-section-title" style="margin-bottom:12px">Fase actual</div>
    <div class="fase-selector">
      ${FASES.map(f => {
        const completadas = f.tareas.filter(t => v.tareas && v.tareas[t.id]).length;
        const done = completadas === f.tareas.length;
        return `<button class="fase-btn ${(v.fase_actual||0)===f.id?'active':done?'completed':''}" onclick="setFaseActual(${f.id})">${f.id}</button>`;
      }).join('')}
    </div>
    ${FASES.map(f => renderFaseBlock(v, f)).join('')}
  </div>

  <div class="card">
    <div class="mini-section-title">Notas del vehículo</div>
    <div class="nota-add">
      <textarea class="form-control" id="nueva-nota-veh-input" placeholder="Escribe una nota..." rows="2"></textarea>
      <button class="btn btn-primary" onclick="addNotaVehiculo()">Añadir</button>
    </div>
    <div class="notas-list">
      ${(v.notas_veh||[]).length===0
        ? '<p style="color:var(--gray-400);font-size:13px">Sin notas.</p>'
        : [...(v.notas_veh||[])].reverse().map(n => `
          <div class="nota-item">
            <div class="nota-date">${formatDate(n.fecha)}</div>
            <div>${esc(n.texto)}</div>
          </div>`).join('')}
    </div>
  </div>`;
  renderResumenVehiculoPanel(v);
}

function calcularPorcentajeInfoVehiculo(v) {
  const entries = [
    !!v.marca,
    !!v.modelo,
    !!v.anyo,
    !!v.km,
    !!v.precio_alemania,
    !!v.co2,
    !!v.potencia_cv,
    v.tiene_coc !== undefined,
    v.tiene_scheckheft !== undefined,
    v.ventanas_originales !== undefined,
    v.carvertical_analizado !== undefined,
    v.informe_revision_fisica_analizado !== undefined,
    v.zb1_analizado !== undefined,
    v.zb2_analizado !== undefined,
    v.propietarios_anteriores_confirmados !== undefined,
  ];
  const filled = entries.filter(Boolean).length;
  return Math.round((filled / entries.length) * 100);
}

function generarResumenVehiculo(v) {
  const percent = calcularPorcentajeInfoVehiculo(v);
  const positives = [];
  const attention = [];
  const alerts = [];

  if (v.marca) positives.push('Marca registrada');
  if (v.modelo) positives.push('Modelo registrado');
  if (v.anyo) positives.push('Año registrado');
  if (v.km) positives.push('Kilometraje registrado');
  if (v.precio_alemania) positives.push('Precio Alemania registrado');
  if (v.co2) positives.push('CO₂ registrado');
  if (v.potencia_cv) positives.push('Potencia registrada');
  if (v.tiene_coc === true) positives.push('COC confirmado');
  if (v.tiene_scheckheft === true) positives.push('Scheckheft confirmado');
  if (v.ventanas_originales === true) positives.push('Ventanas originales confirmadas');
  if (v.carvertical_analizado) positives.push('CarVertical analizado');
  if (v.informe_revision_fisica_analizado) positives.push('Informe de revisión física analizado');
  if (v.zb1_analizado) positives.push('ZB I analizado');
  if (v.zb2_analizado) positives.push('ZB II analizado');
  if (v.propietarios_anteriores_confirmados) positives.push('Propietarios anteriores confirmados');

  if (!v.precio_alemania) attention.push('Falta precio Alemania');
  if (!v.co2) attention.push('Falta CO₂');
  if (!v.potencia_cv) attention.push('Falta potencia CV');
  if (v.tiene_coc === false) alerts.push('No tiene COC');
  else if (v.tiene_coc === undefined) attention.push('Confirmar si tiene COC');
  if (v.tiene_scheckheft === false) attention.push('Scheckheft no confirmado');
  else if (v.tiene_scheckheft === undefined) attention.push('Confirmar estado del Scheckheft');
  if (v.ventanas_originales === false) alerts.push('Ventanas no originales');
  else if (v.ventanas_originales === undefined) attention.push('Confirmar si las ventanas son originales');
  if (!v.carvertical_analizado) attention.push('CarVertical pendiente');
  if (!v.informe_revision_fisica_analizado) attention.push('Revisión física pendiente');
  if (!v.zb1_analizado) attention.push('ZB I pendiente');
  if (!v.zb2_analizado) attention.push('ZB II pendiente');
  if (!v.propietarios_anteriores_confirmados) attention.push('Confirmar propietarios anteriores');

  const extraAlertas = calcAlertasVehiculo(v, clientes[v.cliente_id]||{});
  extraAlertas.forEach(item => {
    if (item.level === 'danger' && !alerts.includes(item.msg)) alerts.push(item.msg);
    else if (item.level === 'warn' && !attention.includes(item.msg)) attention.push(item.msg);
  });

  return { percent, positives, attention, alerts };
}

function renderResumenVehiculo(v) {
  const resumen = generarResumenVehiculo(v);
  const renderList = (items) => items.length ? `<ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : '<p style="color:var(--gray-500);font-size:13px">Sin elementos.</p>';
  return `
  <div class="card resumen-panel">
    <div class="mini-section-title">Resumen visual</div>
    <div class="resumen-chart-row">
      <div class="donut-chart" style="background: conic-gradient(var(--accent) ${resumen.percent}%, var(--gray-200) 0);"></div>
      <div>
        <div class="donut-value">${resumen.percent}%<small>Información recabada</small></div>
      </div>
    </div>
    <div class="summary-row">
      <div class="summary-block summary-positive">
        <h4>✅ PUNTOS POSITIVOS</h4>
        ${renderList(resumen.positives)}
      </div>
      <div class="summary-block summary-attention">
        <h4>⚠️ A TENER EN CUENTA</h4>
        ${renderList(resumen.attention)}
      </div>
      <div class="summary-block summary-alert">
        <h4>🔴 ALERTAS</h4>
        ${renderList(resumen.alerts)}
      </div>
    </div>
  </div>`;
}

function renderResumenVehiculoPanel(v) {
  const panel = document.getElementById('veh-resumen-panel');
  if (!panel) return;
  panel.innerHTML = renderResumenVehiculo(v);
}

function toggleFase(header) { header.nextElementSibling.classList.toggle('open'); }

function setFaseActual(fase) {
  const v = vehiculos[currentVehiculoId];
  if (!v) return;
  v.fase_actual = fase;
  debounceSave('vehiculo', currentVehiculoId);
  openVehiculo(currentVehiculoId);
}

function toggleTarea(tareaId, checked) {
  const v = vehiculos[currentVehiculoId];
  if (!v) return;
  if (!v.tareas) v.tareas = {};
  v.tareas[tareaId] = checked;
  debounceSave('vehiculo', currentVehiculoId);
  renderAlertasVehiculo(v, clientes[v.cliente_id]||{});
  const sel = document.querySelector('.fase-selector');
  if (sel) {
    FASES.forEach((f, fi) => {
      const btn = sel.children[fi];
      if (btn) {
        const done = f.tareas.filter(t => v.tareas&&v.tareas[t.id]).length === f.tareas.length;
        btn.className = `fase-btn ${(v.fase_actual||0)===f.id?'active':done?'completed':''}`;
      }
    });
  }
  document.querySelectorAll('.fase-header .fase-progress').forEach((el, fi) => {
    if (FASES[fi]) {
      const completadas = FASES[fi].tareas.filter(t => v.tareas&&v.tareas[t.id]).length;
      el.textContent = `${completadas}/${FASES[fi].tareas.length} ✓`;
    }
  });
  const label = document.querySelector(`label[for="t_${tareaId}"]`);
  if (label) label.className = `tarea-label ${checked?'done':''}`;
}

function updateVehEstado(val) {
  const v = vehiculos[currentVehiculoId];
  if (!v) return;
  v.estado = val;
  debounceSave('vehiculo', currentVehiculoId);
}

function addNotaVehiculo() {
  const v = vehiculos[currentVehiculoId];
  if (!v) return;
  const input = document.getElementById('nueva-nota-veh-input');
  const texto = input.value.trim();
  if (!texto) return;
  if (!v.notas_veh) v.notas_veh = [];
  v.notas_veh.push({ fecha: new Date().toISOString(), texto });
  input.value = '';
  debounceSave('vehiculo', currentVehiculoId);
  openVehiculo(currentVehiculoId);
}

// =========================================================
// AI CHAT PANEL
// =========================================================
function renderFichaVehiculoRight(v, c) {
  const el = document.getElementById('fv-right');
  loadChatHistoryFromVehicle(v);
  ensureVehicleChatWelcome(v, c);
  el.innerHTML = `
  <div class="chat-panel">
    <div class="chat-header">
      <div class="chat-ai-dot"></div>
      <div class="chat-header-title">Asistente IA</div>
    </div>
    <div class="chat-messages" id="chat-messages-${v.id}">
      <div class="msg msg-system">Chat activo para <strong>${esc(v.marca||'')} ${esc(v.modelo||'')}</strong> · Fase ${v.fase_actual||0}</div>
      ${chatHistory[v.id].map(m => `<div class="msg ${m.role==='user'?'msg-user':'msg-ai'}"><pre>${esc(m.content)}</pre></div>`).join('')}
    </div>
    <div class="chat-toolbar">
      <button class="btn-analizar" onclick="showAnalizarModal()">📄 Analizar documento (pegar texto)</button>
    </div>
    <div class="chat-dropzone" id="chat-dropzone-${v.id}">
      Arrastra JPG/PNG o PDF aquí para que el asistente lo analice automáticamente.
      <br><button class="btn btn-ghost btn-sm" onclick="triggerFileInput('${v.id}')" type="button">Seleccionar archivo</button>
      <input type="file" id="chat-fileinput-${v.id}" style="display:none" accept="image/jpeg,image/png,application/pdf" onchange="handleFileSelected(event,'${v.id}')">
    </div>
    <div class="chat-input-row">
      <textarea class="chat-input" id="chat-input-${v.id}" placeholder="Pregunta sobre el vehículo, documentos, trámites..." onkeydown="chatKeyDown(event,'${v.id}')"></textarea>
      <button class="btn-send" id="chat-send-${v.id}" onclick="sendChat('${v.id}')">➤</button>
    </div>
  </div>`;
  setupChatDropzone('${v.id}');
  scrollChat(v.id);
}

function chatKeyDown(e, vid) {
  if (e.key==='Enter'&&!e.shiftKey) { e.preventDefault(); sendChat(vid); }
}

function scrollChat(vid) {
  const el = document.getElementById(`chat-messages-${vid}`);
  if (el) setTimeout(() => { el.scrollTop = el.scrollHeight; }, 50);
}

function buildChatContext(v, c) {
  const tareasPendientes = FASES.flatMap(f => f.tareas.filter(t => !(v.tareas||{})[t.id]).map(t => t.label));
  const previa = Array.isArray(v.contexto_chat) && v.contexto_chat.length
    ? v.contexto_chat.map((m, index) => `${index+1}. ${m.role.toUpperCase()}: ${m.content}`).join('\n')
    : 'No hay conversación previa.';
  return `=== CONTEXTO DEL VEHÍCULO ===
Vehículo: ${v.marca||'?'} ${v.modelo||'?'} ${v.anyo||'?'}
Km: ${v.km||'?'} | Combustible: ${v.combustible||'?'} | CV: ${v.potencia_cv||'?'} | CO2: ${v.co2||'?'} g/km
Precio Alemania: ${v.precio_alemania?'€'+v.precio_alemania:'?'}
Concesionario: ${v.concesionario||'?'}
COC: ${v.tiene_coc===true?'Sí':v.tiene_coc===false?'No':'Desconocido'} | Scheckheft: ${v.tiene_scheckheft===true?'Sí':v.tiene_scheckheft===false?'No':'Desconocido'} | Ventanas originales: ${v.ventanas_originales===false?'No':v.ventanas_originales===true?'Sí':'Desconocido'}
Modalidad transporte: ${v.modalidad_transporte||'?'}
Fase actual: ${v.fase_actual||0}
Tareas pendientes: ${tareasPendientes.slice(0,10).join(', ')||'ninguna'}

=== CLIENTE ===
Cliente: ${c?.nombre||'?'} | ${c?.localidad||'?'}
Pipeline: ${c?.estado_pipeline||'?'}
Busca: ${c?.busca?.tipo_vehiculo||'?'}, presupuesto ${c?.busca?.presupuesto_total?'€'+c.busca.presupuesto_total:'?'}

=== CONTEXTO_CHAT ANTERIOR ===
${previa}`;
}

async function sendChat(vid) {
  const v = vehiculos[vid];
  const c = clientes[v?.cliente_id];
  const inputEl = document.getElementById(`chat-input-${vid}`);
  const msg = inputEl.value.trim();
  if (!msg||!v) return;
  const aiKey = localStorage.getItem('ai_key');
  if (!aiKey) { toast('Configura la Anthropic API Key primero','error'); return; }

  inputEl.value = '';
  document.getElementById(`chat-send-${vid}`).disabled = true;
  chatHistory[vid].push({ role:'user', content:msg });
  appendChatMsg(vid, 'user', msg);

  const thinkId = 'think_'+Date.now();
  const messagesEl = document.getElementById(`chat-messages-${vid}`);
  const thinkEl = document.createElement('div');
  thinkEl.id = thinkId;
  thinkEl.className = 'msg msg-ai chat-thinking';
  thinkEl.innerHTML = '<span class="loading-dots">Pensando</span>';
  messagesEl.appendChild(thinkEl);
  scrollChat(vid);

  try {
    const sysPrompt = `Eres el asistente de gestión de importación de MendiVan. Tienes acceso a la ficha completa de este vehículo y cliente. Tu función es: analizar documentos que te peguen (CarVertical, informe TÜV, ZB I, ZB II, COC, facturas alemanas), extraer datos relevantes y sugerir actualizar la ficha; alertar si detectas algo importante antes de pasar a la siguiente fase; responder preguntas técnicas sobre importación, IEDMT, REBU, homologación. Hablas en español, tuteo, directo y sin relleno. Cuando analices un documento termina siempre indicando qué tareas del checklist se pueden marcar como hechas.

${buildChatContext(v, c)}`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': aiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 1500,
        system: sysPrompt,
        messages: chatHistory[vid].map(m => ({ role:m.role, content:m.content })),
      }),
    });
    thinkEl.remove();
    if (!res.ok) { const err = await res.json().catch(()=>({})); throw new Error(err.error?.message||`API error ${res.status}`); }
    const data = await res.json();
    const reply = data.content?.[0]?.text||'(sin respuesta)';
    chatHistory[vid].push({ role:'assistant', content:reply });
    appendChatMsg(vid, 'ai', reply);
    if (v) {
      v.contexto_chat = [...chatHistory[vid]];
      applyAIUpdatesFromReply(v, reply);
      renderResumenVehiculoPanel(v);
      renderAlertasVehiculo(v, c||{});
      debounceSave('vehiculo', vid);
    }
  } catch(e) {
    document.getElementById(thinkId)?.remove();
    appendChatMsg(vid, 'system', `Error: ${e.message}`);
  }
  document.getElementById(`chat-send-${vid}`).disabled = false;
}

function appendChatMsg(vid, role, content) {
  const el = document.getElementById(`chat-messages-${vid}`);
  if (!el) return;
  const div = document.createElement('div');
  div.className = `msg msg-${role}`;
  div.innerHTML = `<pre>${esc(content)}</pre>`;
  el.appendChild(div);
  scrollChat(vid);
}

function loadChatHistoryFromVehicle(v) {
  if (!v) return;
  if (!Array.isArray(v.contexto_chat)) v.contexto_chat = [];
  chatHistory[v.id] = v.contexto_chat.map(entry => ({ role: entry.role, content: entry.content }));
}

function ensureVehicleChatWelcome(v, c) {
  if (!v || v.chat_iniciado) return;
  const fase = v.fase_actual || 0;
  if (fase === 0 || fase === 1) {
    const message = fase === 0
      ? '¡Buenas! Vamos a arrancar la ficha y preparar la llamada al concesionario. Pregunta: propietarios anteriores, si tienen ZB I y ZB II, si tienen COC, si ha tenido accidentes, si las ventanas laterales son originales o de post-producción, y el estado general. Cuando acabes cuéntame qué te han dicho y lo registro.'
      : '¡Buenas! ¿Listo para la llamada al concesionario? Cuando hables con ellos pregunta: propietarios anteriores, si tienen ZB I y ZB II, si tienen COC, si ha tenido accidentes, si las ventanas laterales son originales o de post-producción, y el estado general. Cuando acabes cuéntame qué te han dicho y lo registro.';
    chatHistory[v.id].push({ role: 'assistant', content: message });
    v.chat_iniciado = true;
    v.contexto_chat = [...chatHistory[v.id]];
    debounceSave('vehiculo', v.id);
  }
}

function setupChatDropzone(vid) {
  const zone = document.getElementById(`chat-dropzone-${vid}`);
  if (!zone || zone.dataset.dropzoneAttached) return;
  zone.dataset.dropzoneAttached = 'true';
  zone.addEventListener('dragover', e => {
    e.preventDefault();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', () => {
    zone.classList.remove('dragover');
  });
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFileSelected({ target: { files: [file] } }, vid);
  });
}

function triggerFileInput(vid) {
  document.getElementById(`chat-fileinput-${vid}`)?.click();
}

function handleFileSelected(event, vid) {
  const file = event.target?.files?.[0];
  if (!file) return;
  processFileForAI(file, vid);
  event.target.value = '';
}

function processFileForAI(file, vid) {
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result;
    if (!dataUrl || typeof dataUrl !== 'string') return;
    const base64 = dataUrl.split(',')[1] || '';
    const prompt = `He subido un archivo ${file.name} (${file.type}). Analiza su contenido y extrae los datos relevantes del vehículo: marca, modelo, año, km, precio, CO2, potencia, COC, Scheckheft, ventanas originales, CarVertical analizado, informe de revisión física analizado, ZB I analizado, ZB II analizado, propietarios anteriores confirmados. Contesta en español y explica qué campos se pueden actualizar.`;
    sendFileToAI(vid, prompt, base64, file.type, file.name);
  };
  reader.readAsDataURL(file);
}

async function sendFileToAI(vid, prompt, base64, mimeType, filename) {
  const v = vehiculos[vid];
  const c = clientes[v?.cliente_id];
  if (!v) return;
  const aiKey = localStorage.getItem('ai_key');
  if (!aiKey) { toast('Configura la Anthropic API Key primero','error'); return; }

  const content = `Archivo: ${filename} (${mimeType})\nBASE64:\n${base64}\n\n${prompt}`;
  chatHistory[vid].push({ role: 'user', content });
  appendChatMsg(vid, 'user', 'He añadido un archivo para analizar: ' + filename);
  v.contexto_chat = [...chatHistory[vid]];
  debounceSave('vehiculo', vid);

  const thinkId = 'think_'+Date.now();
  const messagesEl = document.getElementById(`chat-messages-${vid}`);
  const thinkEl = document.createElement('div');
  thinkEl.id = thinkId;
  thinkEl.className = 'msg msg-ai chat-thinking';
  thinkEl.innerHTML = '<span class="loading-dots">Analizando archivo</span>';
  messagesEl.appendChild(thinkEl);
  scrollChat(vid);

  try {
    const sysPrompt = `Eres el asistente de gestión de importación de MendiVan. Tienes acceso a la ficha completa de este vehículo y cliente. Tu función es: analizar documentos, extraer datos relevantes y sugerir actualizar la ficha; alertar si detectas algo importante antes de pasar a la siguiente fase; responder preguntas técnicas sobre importación. Hablas en español, tuteo, directo y sin relleno. Cuando analices un documento termina indicando qué campos se pueden actualizar y qué tareas del checklist se pueden marcar como hechas.\n\n${buildChatContext(v,c)}`;
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': aiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 1500,
        system: sysPrompt,
        messages: chatHistory[vid].map(m => ({ role: m.role, content: m.content })),
      }),
    });
    thinkEl.remove();
    if (!res.ok) { const err = await res.json().catch(()=>({})); throw new Error(err.error?.message||`API error ${res.status}`); }
    const data = await res.json();
    const reply = data.content?.[0]?.text||'(sin respuesta)';
    chatHistory[vid].push({ role: 'assistant', content: reply });
    appendChatMsg(vid, 'ai', reply);
    v.contexto_chat = [...chatHistory[vid]];
    applyAIUpdatesFromReply(v, reply);
    debounceSave('vehiculo', vid);
  } catch(e) {
    document.getElementById(thinkId)?.remove();
    appendChatMsg(vid, 'system', `Error: ${e.message}`);
  }
}

function applyAIUpdatesFromReply(v, reply) {
  const text = reply.toLowerCase();
  const updated = {};
  const assign = (field, value) => { if (value !== undefined && v[field] !== value) { v[field] = value; updated[field] = value; } };
  if (/\b(no tiene coc|sin coc|coc no|no hay coc)\b/.test(text)) assign('tiene_coc', false);
  else if (/\b(tiene coc|con coc|coc confirmado|coc disponible|coc sí|coc si)\b/.test(text)) assign('tiene_coc', true);
  if (/\b(no tiene scheckheft|sin scheckheft|scheckheft no)\b/.test(text)) assign('tiene_scheckheft', false);
  else if (/\b(tiene scheckheft|scheckheft completo|scheckheft confirmado|scheckheft sí|scheckheft si)\b/.test(text)) assign('tiene_scheckheft', true);
  if (/\b(ventanas (laterales )?(no originales|no originales|post-producción|post produccion))\b/.test(text)) assign('ventanas_originales', false);
  else if (/\b(ventanas (laterales )?(originales|sin reparar|genuinas|de fábrica))\b/.test(text)) assign('ventanas_originales', true);
  if (/\b(carvertical|car vertical).*(analizad|revisad|completo|sí|si|confirmad)/.test(text)) assign('carvertical_analizado', true);
  if (/\b(informe|revisión física).*(analizad|revisad|completo|sí|si|confirmad)/.test(text)) assign('informe_revision_fisica_analizado', true);
  if (/\b(zb i).*(analizad|revisad|completo|sí|si|confirmad)/.test(text)) assign('zb1_analizado', true);
  if (/\b(zb ii).*(analizad|revisad|completo|sí|si|confirmad)/.test(text)) assign('zb2_analizado', true);
  if (/\b(propietarios anteriores).*(confirmad|verificad|sí|si|ok)/.test(text)) assign('propietarios_anteriores_confirmados', true);
  if (/\b(propietarios anteriores).*(no|sin|ninguno)/.test(text)) assign('propietarios_anteriores_confirmados', false);
  const numMatch = (regex) => { const m = reply.match(regex); return m ? parseInt(m[1].replace(/\D/g,''), 10) : null; };
  const co2Val = numMatch(/co2[^\d]*(\d{2,4})/i);
  if (co2Val) assign('co2', co2Val);
  const potenciaVal = numMatch(/potencia[^\d]*(\d{2,4})/i);
  if (potenciaVal) assign('potencia_cv', potenciaVal);
  const kmVal = numMatch(/km[^\d]*(\d{1,3}(?:[.,]\d{3})?)/i);
  if (kmVal) assign('km', kmVal);
  const precioVal = numMatch(/precio[^\d]*(\d{3,}(?:[.,]\d{3})*|\d{1,3})(?:[.,]\d{2})?/i);
  if (precioVal) assign('precio_alemania', precioVal);
  const anyoVal = numMatch(/(?:año|ano|year)[^\d]*(\d{4})/i);
  if (anyoVal) assign('anyo', anyoVal);

  if (Object.keys(updated).length) {
    const id = v.id;
    renderResumenVehiculoPanel(v);
    renderAlertasVehiculo(v, clientes[v.cliente_id]||{});
    debounceSave('vehiculo', id);
  }
}

// =========================================================
// ANALIZAR DOCUMENTO
// =========================================================
function showAnalizarModal() {
  const vid = currentVehiculoId;
  openModal(`
    <div class="modal-title">📄 Analizar documento</div>
    <div class="form-group">
      <label class="form-label">Pega aquí el texto del documento (CarVertical, TÜV, ZB I, ZB II, COC, factura…)</label>
      <textarea class="form-control" id="analizar-texto" placeholder="Pega el texto aquí..." style="min-height:180px"></textarea>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="enviarAnalisis('${vid}')">Analizar con IA</button>
    </div>
  `);
}

function enviarAnalisis(vid) {
  const texto = document.getElementById('analizar-texto').value.trim();
  if (!texto) { toast('Pega un texto primero','error'); return; }
  closeModal();
  const inputEl = document.getElementById(`chat-input-${vid}`);
  if (inputEl) {
    inputEl.value = `Analiza este documento y extrae todos los datos relevantes del vehículo:\n\n${texto}`;
    sendChat(vid);
  }
}

// =========================================================
// NUEVO CLIENTE
// =========================================================
function showNuevoClienteModal() {
  openModal(`
    <div class="modal-title">👤 Nuevo cliente</div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Nombre *</label><input type="text" class="form-control" id="nc-nombre" placeholder="Juan García"></div>
      <div class="form-group"><label class="form-label">Teléfono</label><input type="tel" class="form-control" id="nc-telefono" placeholder="+34 600 000 000"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Email</label><input type="email" class="form-control" id="nc-email"></div>
      <div class="form-group"><label class="form-label">Localidad</label><input type="text" class="form-control" id="nc-localidad"></div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Canal de entrada</label>
        <select class="form-control" id="nc-canal">${CANALES.map(c => `<option>${c}</option>`).join('')}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Estado pipeline</label>
        <select class="form-control" id="nc-pipeline">${PIPELINE_ESTADOS.map(s => `<option value="${s}">${PIPELINE_LABELS[s]}</option>`).join('')}</select>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="crearCliente()">Crear cliente</button>
    </div>
  `);
  setTimeout(() => document.getElementById('nc-nombre')?.focus(), 100);
}

async function crearCliente() {
  const nombre = document.getElementById('nc-nombre').value.trim();
  if (!nombre) { toast('El nombre es obligatorio','error'); return; }
  const id = genId();
  const now = new Date().toISOString();
  clientes[id] = {
    id, nombre,
    telefono: document.getElementById('nc-telefono').value,
    email: document.getElementById('nc-email').value,
    localidad: document.getElementById('nc-localidad').value,
    canal_entrada: document.getElementById('nc-canal').value,
    estado_pipeline: document.getElementById('nc-pipeline').value,
    fecha_primer_contacto: now, fecha_ultima_interaccion: now,
    notas: [], vehiculos: [], busca: {},
  };
  closeModal();
  await saveCliente(id);
  renderClientesList();
  openCliente(id);
  toast('Cliente creado','success');
}

// =========================================================
// NUEVO VEHÍCULO
// =========================================================
function showNuevoVehiculoModal() {
  openModal(`
    <div class="modal-title">🚗 Añadir vehículo</div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Marca *</label><input type="text" class="form-control" id="nv-marca" placeholder="Volkswagen"></div>
      <div class="form-group"><label class="form-label">Modelo *</label><input type="text" class="form-control" id="nv-modelo" placeholder="Transporter"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Año</label><input type="number" class="form-control" id="nv-anyo" placeholder="2020"></div>
      <div class="form-group"><label class="form-label">Kilómetros</label><input type="number" class="form-control" id="nv-km" placeholder="80000"></div>
      <div class="form-group"><label class="form-label">Precio Alemania (€)</label><input type="number" class="form-control" id="nv-precio"></div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Combustible</label>
        <select class="form-control" id="nv-combustible">${COMBUSTIBLES.map(c => `<option>${c}</option>`).join('')}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Carrocería</label>
        <select class="form-control" id="nv-carroceria">${CARROCERIAS.map(c => `<option>${c}</option>`).join('')}</select>
      </div>
    </div>
    <div class="form-group"><label class="form-label">Link mobile.de</label><input type="url" class="form-control" id="nv-link"></div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="crearVehiculo()">Añadir vehículo</button>
    </div>
  `);
  setTimeout(() => document.getElementById('nv-marca')?.focus(), 100);
}

async function crearVehiculo() {
  const marca = document.getElementById('nv-marca').value.trim();
  const modelo = document.getElementById('nv-modelo').value.trim();
  if (!marca||!modelo) { toast('Marca y modelo son obligatorios','error'); return; }
  const id = genId();
  const now = new Date().toISOString();
  vehiculos[id] = {
    id, cliente_id: currentClienteId,
    marca, modelo,
    anyo: parseInt(document.getElementById('nv-anyo').value)||null,
    km: parseInt(document.getElementById('nv-km').value)||null,
    precio_alemania: parseFloat(document.getElementById('nv-precio').value)||null,
    combustible: document.getElementById('nv-combustible').value,
    tipo_carroceria: document.getElementById('nv-carroceria').value,
    link_mobile: document.getElementById('nv-link')?.value||'',
    estado: 'activo', fase_actual: 0, tareas: {},
    tiene_coc: false, tiene_scheckheft: false, ventanas_originales: true,
    modalidad_transporte: 'camion',
    notas_veh: [], documentos: [], contexto_chat: [], chat_iniciado: false,
    carvertical_analizado: false, informe_revision_fisica_analizado: false,
    zb1_analizado: false, zb2_analizado: false, propietarios_anteriores_confirmados: false,
    fecha_ultima_actualizacion: now,
  };
  if (!clientes[currentClienteId].vehiculos) clientes[currentClienteId].vehiculos = [];
  clientes[currentClienteId].vehiculos.push(id);
  closeModal();
  await Promise.all([saveVehiculo(id), saveCliente(currentClienteId)]);
  renderClienteVehiculos();
  openVehiculo(id);
  toast('Vehículo añadido','success');
}

// =========================================================
// EDITAR CLIENTE
// =========================================================
function editarCliente() {
  const c = clientes[currentClienteId];
  if (!c) return;
  openModal(`
    <div class="modal-title">✏️ Editar cliente</div>
    <div class="form-row">
      ${inputField('e-nombre','Nombre',c.nombre,'text')}
      ${inputField('e-telefono','Teléfono',c.telefono,'tel')}
    </div>
    <div class="form-row">
      ${inputField('e-email','Email',c.email,'email')}
      ${inputField('e-localidad','Localidad',c.localidad,'text')}
    </div>
    <div class="form-group">
      <label class="form-label">Estado pipeline</label>
      <select class="form-control" id="e-pipeline">
        ${PIPELINE_ESTADOS.map(s => `<option value="${s}" ${c.estado_pipeline===s?'selected':''}>${PIPELINE_LABELS[s]}</option>`).join('')}
      </select>
    </div>
    ${inputField('e-proxima','Próxima acción',c.proxima_accion,'text')}
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="guardarEdicionCliente()">Guardar</button>
    </div>
  `);
}

async function guardarEdicionCliente() {
  const c = clientes[currentClienteId];
  if (!c) return;
  c.nombre = document.getElementById('e-nombre').value.trim();
  c.telefono = document.getElementById('e-telefono').value;
  c.email = document.getElementById('e-email').value;
  c.localidad = document.getElementById('e-localidad').value;
  c.estado_pipeline = document.getElementById('e-pipeline').value;
  c.proxima_accion = document.getElementById('e-proxima').value;
  closeModal();
  await saveCliente(currentClienteId);
  document.getElementById('fc-nombre').textContent = c.nombre;
  document.getElementById('fc-pipeline-badge').innerHTML = pipelineBadge(c.estado_pipeline);
  renderClientesList();
  toast('Cliente actualizado','success');
}

// =========================================================
// ELIMINAR
// =========================================================
async function eliminarCliente() {
  if (!confirm(`¿Eliminar al cliente "${clientes[currentClienteId]?.nombre}"? Se eliminarán también sus vehículos.`)) return;
  const vIds = Object.values(vehiculos).filter(v => v.cliente_id===currentClienteId).map(v => v.id);
  for (const vid of vIds) {
    delete vehiculos[vid];
    localStorage.removeItem('vehiculo_'+vid);
    try { const ex = await ghGet(`data/vehiculos/${vid}.json`); if (ex) await ghDelete(`data/vehiculos/${vid}.json`, ex.sha); } catch(e) {}
  }
  delete clientes[currentClienteId];
  localStorage.removeItem('cliente_'+currentClienteId);
  try { const ex = await ghGet(`data/clientes/${currentClienteId}.json`); if (ex) await ghDelete(`data/clientes/${currentClienteId}.json`, ex.sha); } catch(e) {}
  showView('crm');
  renderClientesList();
  toast('Cliente eliminado','success');
}

async function eliminarVehiculo() {
  const v = vehiculos[currentVehiculoId];
  if (!confirm(`¿Eliminar el vehículo "${v?.marca} ${v?.modelo}"?`)) return;
  const cid = v.cliente_id;
  delete vehiculos[currentVehiculoId];
  localStorage.removeItem('vehiculo_'+currentVehiculoId);
  try { const ex = await ghGet(`data/vehiculos/${currentVehiculoId}.json`); if (ex) await ghDelete(`data/vehiculos/${currentVehiculoId}.json`, ex.sha); } catch(e) {}
  if (clientes[cid]) {
    clientes[cid].vehiculos = (clientes[cid].vehiculos||[]).filter(id => id!==currentVehiculoId);
    await saveCliente(cid);
  }
  openCliente(cid);
  switchClienteTab('vehiculos');
  toast('Vehículo eliminado','success');
}
