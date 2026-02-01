// --- CONFIGURACIÓN ---
const supabaseUrl = 'https://dvjfhrptjpffxaxlbqfx.supabase.co';
const supabaseKey = 'sb_publishable_ZBBY6u9DDHLIcT8dITMNBQ_E62v7OkJ';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

// Variables Globales
let myChart = null;
let prestamoActualHistorial = null;
let currentTandaData = null;

// --- AUTENTICACIÓN Y ARRANQUE ---
_supabase.auth.onAuthStateChange((e, s)=> {
if (s) {
document.getElementById('login-screen').classList.add('hidden');
document.getElementById('app-screen').classList.remove('hidden');
cargarTodo();
} else {
document.getElementById('login-screen').classList.remove('hidden');
document.getElementById('app-screen').classList.add('hidden');
}
});

async function iniciarSesion() {
const e = document.getElementById('email').value, p = document.getElementById('password').value;
await _supabase.auth.signInWithPassword({
email: e,
password: p
});
}
async function registrarse() {
const e = document.getElementById('email').value, p = document.getElementById('password').value;
await _supabase.auth.signUp({
email: e,
password: p
});
alert("Cuenta creada. Intenta iniciar sesión.");
}
async function cerrarSesion() {
await _supabase.auth.signOut();
}

function cargarTodo() {
cargarDashboard();
cargarClientes();
cargarPrestamos();
cargarTandas();
}

function nav(id, btn) {
document.querySelectorAll('[id^="seccion-"]').forEach(s => s.classList.add('hidden'));
document.getElementById('seccion-'+id).classList.remove('hidden');
document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
btn.classList.add('active');
if (id === 'inicio') cargarDashboard();
}
function cerrar(id) {
document.getElementById(id).classList.add('hidden');
}

// --- 💰 FUNCIÓN MAESTRA DE DINERO 💰 ---
function parseMoney(val) {
if (typeof val === 'number') return val;
if (!val) return 0;
const clean = val.toString().replace(/[^0-9.-]+/g, "");
return parseFloat(clean) || 0;
}

// --- DASHBOARD V32 (HISTORIAL AMPLIADO) ---
async function cargarDashboard() {
try {
// 1. Contadores
const {
count: totalClientes
} = await _supabase.from('clientes').select('*', {
count: 'exact', head: true
});
document.getElementById('dash-clientes').innerText = totalClientes || 0;

// 2. Cálculos Financieros
let cap = 0,
gan = 0,
deu = 0,
idsP = new Set();
const {
data: p
} = await _supabase.from('prestamos').select('monto_prestado, monto_total_a_pagar, abonos_prestamos(monto_abonado), cliente_id').eq('estado', 'activo');

if (p) p.forEach(x => {
const pag = x.abonos_prestamos ? x.abonos_prestamos.reduce((s, i)=>s+parseMoney(i.monto_abonado), 0): 0;
const res = parseMoney(x.monto_total_a_pagar) - pag;
if (res > 0) {
cap += parseMoney(x.monto_prestado);
gan += (parseMoney(x.monto_total_a_pagar)-parseMoney(x.monto_prestado));
deu += res;
idsP.add(x.cliente_id);
}
});

let caj = 0, idsA = new Set();
const {
data: a
} = await _supabase.from('movimientos_ahorro').select('monto, tipo, cliente_id');
if (a && a.length > 0) a.forEach(x => {
const m = parseMoney(x.monto);
const t = (x.tipo || "").toUpperCase();
if (t.includes('RETIR')) caj -= m; else caj += m;
idsA.add(x.cliente_id);
});

// Render Texto Tarjetas
const updateCard = (id,
label,
val,
icon) => {
const el = document.getElementById(id);
if (el && el.parentElement) {
el.parentElement.innerHTML = `<h3>${label}</h3><p id="${id}">$${val.toLocaleString()}</p><div class="card-bg-icon">${icon}</div>`;
}
};

updateCard('dash-ganancia', 'Ganancia', gan, '🚀');
updateCard('dash-capital', 'Prestado', cap, '💼');
updateCard('dash-deuda', 'Por Cobrar', deu, '⏳');
updateCard('dash-ahorro', 'Caja Ahorro', caj, '🐷');

const updateCount = (id, label, val, icon) => {
const el = document.getElementById(id);
if (el && el.parentElement) el.parentElement.innerHTML = `<h3>${label}</h3><p id="${id}">${val}</p><div class="card-bg-icon">${icon}</div>`;
}
updateCount('dash-clientes', 'Clientes', totalClientes || 0, '👥');
updateCount('dash-activos-p', 'Deudores', idsP.size, '🧾');
updateCount('dash-activos-a', 'Ahorradores', idsA.size, '💎');

// GRÁFICA CON PORCENTAJES
Chart.register(ChartDataLabels);
const ctx = document.getElementById('financeChart').getContext('2d');
if (myChart) myChart.destroy();

const totalGlobal = cap + gan + caj;

myChart = new Chart(ctx, {
type: 'doughnut',
data: {
labels: ['Capital', 'Ganancia', 'Caja'],
datasets: [{
data: [cap, gan, caj],
backgroundColor: ['#3b82f6', '#f97316', '#10b981'],
borderWidth: 2,
borderColor: document.body.getAttribute('data-theme') === 'dark'?'#1e1e1e': '#ffffff'
}]
},
options: {
maintainAspectRatio: false,
plugins: {
legend: {
position: 'bottom', labels: {
color: document.body.getAttribute('data-theme') === 'dark'?'#fff': '#333'
}
},
datalabels: {
color: '#fff',
font: {
weight: 'bold', size: 11
},
formatter: (value) => {
if (value <= 0 || totalGlobal === 0) return null;
return ((value / totalGlobal) * 100).toFixed(1) + "%";
},
textShadowColor: 'rgba(0, 0, 0, 0.5)',
textShadowBlur: 4
}
}
}
});

// --- HISTORIAL RECIENTE (AMPLIADO x2) ---
let mix = [];
const listaHTML = document.getElementById('lista-reciente');
listaHTML.innerHTML = '<li style="padding:10px;text-align:center;">Cargando...</li>';

const getFecha = (x) => x.fecha_movimiento || x.fecha_inicio || x.created_at || new Date().toISOString();
const getNombre = (cli) => cli ? cli.nombre_completo: 'Usuario';

// AHORA TRAEMOS 10 DE CADA UNO (ANTES ERAN 5)
const {
data: ahs
} = await _supabase.from('movimientos_ahorro').select('monto, tipo, created_at, fecha_movimiento, clientes(nombre_completo)').order('fecha_movimiento',
{
ascending: false
}).limit(10);
const {
data: nL
} = await _supabase.from('prestamos').select('monto_prestado, created_at, fecha_inicio, clientes(nombre_completo)').order('fecha_inicio',
{
ascending: false
}).limit(10);
const {
data: abs
} = await _supabase.from('abonos_prestamos').select('monto_abonado, created_at, prestamos(clientes(nombre_completo))').order('created_at',
{
ascending: false
}).limit(10);

if (nL) nL.forEach(x => mix.push({
i: '🆕', t: 'Préstamo', n: getNombre(x.clientes), m: parseMoney(x.monto_prestado), d: getFecha(x), c: 'blue'
}));
if (abs) abs.forEach(x => {
const nom = (x.prestamos && x.prestamos.clientes) ? x.prestamos.clientes.nombre_completo: 'Usuario'; mix.push({
i: '💰', t: 'Abono', n: nom, m: parseMoney(x.monto_abonado), d: getFecha(x), c: 'green'
})});
if (ahs) ahs.forEach(x => {
const t = (x.tipo || "").toUpperCase(); const isRet = t.includes('RETIR'); mix.push({
i: isRet?'💸': '🐷', t: x.tipo || 'Movimiento', n: getNombre(x.clientes), m: parseMoney(x.monto), d: getFecha(x), c: isRet?'red': 'green'
});
});

listaHTML.innerHTML = '';
if (mix.length === 0) {
listaHTML.innerHTML = '<li style="padding:10px;text-align:center;">Sin movimientos recientes</li>';
} else {
mix.sort((a, b) => new Date(b.d) - new Date(a.d));

// AHORA MOSTRAMOS LOS ÚLTIMOS 12 (ANTES ERAN 6)
mix.slice(0, 12).forEach(m => {
const dObj = new Date(m.d);
listaHTML.innerHTML += `<li class="recent-item"><div style="display:flex;align-items:center;"><span class="ri-icon">${m.i}</span><div><strong>${m.n}</strong><small style="display:block; color:var(--sec); font-size:0.75em;">${m.t} • ${dObj.getDate()}/${dObj.getMonth()+1}</small></div></div><div style="font-weight:bold; color:${m.c === 'red'?'#dc2626': (m.c === 'green'?'#059669': '#2563eb')}">${m.c === 'red'?'-': '+'}$${m.m.toLocaleString()}</div></li>`;
});
}
} catch (err) {
console.error("Error Dashboard:", err);
}
}




// --- CLIENTES ---
function toggleTel() {
document.getElementById('cli-tel').disabled = document.getElementById('check-no-tel').checked;
}

async function cargarClientes() {
const {
data
} = await _supabase.from('clientes').select('*').order('nombre_completo');
const tb = document.getElementById('lista-clientes'); tb.innerHTML = '';
const sP = document.getElementById('select-clientes-p'); sP.innerHTML = '';
const sA = document.getElementById('select-clientes-a'); sA.innerHTML = '<option value="">Selecciona</option>';
const sT = document.getElementById('sel-miembro-tanda'); sT.innerHTML = '<option value="">Selecciona</option>';

if (data) data.forEach(c => {
const tel = c.telefono ? c.telefono: 'Sin Tel';
const btnWa = c.telefono ? `<button class="btn-mini btn-wa" onclick="window.open('https://wa.me/52${c.telefono.replace(/\D/g, '')}','_blank')">💬</button>`: '';
tb.innerHTML += `<tr><td><strong>${c.nombre_completo}</strong></td><td>${tel}</td><td>${c.notas?c.notas.split(':')[0]: ''}</td><td><button class="btn-mini btn-edit" onclick="abrirEditCliente('${c.id}','${c.nombre_completo}','${c.telefono}','${c.notas}')">✏️</button>${btnWa}<button class="btn-mini btn-del" onclick="borrar('clientes','${c.id}')">🗑️</button></td></tr>`;
const opt = `<option value="${c.id}">${c.nombre_completo}</option>`; sP.innerHTML += opt; sA.innerHTML += opt; sT.innerHTML += opt;
});
}

async function guardarCliente() {
const n = document.getElementById('cli-nombre').value, t = document.getElementById('check-no-tel').checked?null: document.getElementById('cli-tel').value, rel = document.getElementById('cli-relacion').value, det = document.getElementById('cli-detalle').value; if (!n)return; await _supabase.from('clientes').insert([{
nombre_completo: n, telefono: t, notas: `${rel}: ${det}`
}]); document.getElementById('cli-nombre').value = ''; cargarClientes();
}
async function crearPerfilAdmin() {
const n = prompt("Nombre:"); if (n) {
await _supabase.from('clientes').insert([{
nombre_completo: n, notas: "Admin"
}]); cargarClientes();
}
}

function abrirEditCliente(id, n, t, nota) {
document.getElementById('id-edit-c').value = id; document.getElementById('nom-edit-c').value = n; document.getElementById('tel-edit-c').value = (t === 'null'?'': t); document.getElementById('nota-edit-c').value = nota; document.getElementById('modal-edit-cliente').classList.remove('hidden');
}
async function confirmarEditCliente() {
const id = document.getElementById('id-edit-c').value; await _supabase.from('clientes').update({
nombre_completo: document.getElementById('nom-edit-c').value, telefono: document.getElementById('tel-edit-c').value, notas: document.getElementById('nota-edit-c').value
}).eq('id', id); cerrar('modal-edit-cliente'); cargarClientes();
}

// --- PRÉSTAMOS ---
['monto-p', 'interes-p', 'plazo-p'].forEach(id => {
document.getElementById(id).addEventListener('input', () => {
const m = parseFloat(document.getElementById('monto-p').value) || 0, i = parseFloat(document.getElementById('interes-p').value) || 0, p = parseFloat(document.getElementById('plazo-p').value) || 1; const total = m + (m * (i/100)); const cuota = total / p; const box = document.getElementById('loan-preview'); if (m > 0) {
box.classList.remove('hidden'); box.innerHTML = `💵 Prestas: <strong>$${m}</strong><br>📈 Cobras: <strong>$${total}</strong><br>🗓️ <strong>${p}</strong> pagos de <strong>$${cuota.toFixed(2)}</strong>`;
} else {
box.classList.add('hidden');
}
});
});

async function cargarPrestamos() {
    // 1. OJO: Pedimos el 'telefono' dentro de la tabla clientes
    const { data } = await _supabase
        .from('prestamos')
        .select('*, clientes(nombre_completo, telefono), abonos_prestamos(*)')
        .eq('estado', 'activo');
    
    const list = document.getElementById('lista-prestamos'); 
    list.innerHTML = '';

    if (data) data.forEach(p => {
        const ab = p.abonos_prestamos ? p.abonos_prestamos.reduce((s, a)=>s+parseMoney(a.monto_abonado), 0): 0;
        const sal = parseMoney(p.monto_total_a_pagar) - ab;
        const frecNum = parseInt(p.frecuencia_pago.match(/\d+/)) || 1; 
        const cuota = parseMoney(p.monto_total_a_pagar) / frecNum;

        // Datos para WhatsApp
        const nombre = p.clientes?.nombre_completo || 'Cliente';
        const tel = p.clientes?.telefono || '';
        const fecha = p.fecha_inicio ? new Date(p.fecha_inicio).toLocaleDateString() : 'hoy';

        list.innerHTML += `
        <div class="loan-item">
            <div class="loan-header">
                <strong>${nombre}</strong>
                <span style="color:${sal > 0?'#ef4444': '#10b981'}; font-weight:bold;">$${sal.toFixed(0)} Resta</span>
            </div>
            <progress value="${ab}" max="${p.monto_total_a_pagar}"></progress>
            
            <div class="loan-stats">
                <div class="loan-stat-box"><div>$${cuota.toFixed(0)}</div>Cuota</div>
                <div class="loan-stat-box"><div>$${p.monto_total_a_pagar}</div>Total</div>
                <div class="loan-stat-box"><div>$${p.monto_prestado}</div>Prestado</div>
            </div>

            <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
                <button class="btn-pay" style="flex:1;" onclick="abrirAbono('${p.id}',${sal})">💰 Abonar</button>
                
                <button class="btn-wa-pro" onclick="whatsappPrestamo('${nombre}', '${tel}', '${sal.toFixed(2)}', '${fecha}')">
                    📱 Cobrar
                </button>

                <button class="btn-hist" onclick="abrirHistorial('${p.id}')">📜</button>
                <button class="btn-del" onclick="borrar('prestamos','${p.id}')">🗑️</button>
            </div>
        </div>`;
    });
}


async function crearPrestamo() {
const c = document.getElementById('select-clientes-p').value, m = parseFloat(document.getElementById('monto-p').value), i = parseFloat(document.getElementById('interes-p').value), f = document.getElementById('frec-p').value, p = document.getElementById('plazo-p').value; let d = document.getElementById('fecha-p').value; if (!d) d = new Date().toISOString(); const total = m+(m*(i/100)); const frecFinal = `${f} (${p} pagos)`; await _supabase.from('prestamos').insert([{
cliente_id: c, monto_prestado: m, tasa_interes: i, monto_total_a_pagar: total, frecuencia_pago: frecFinal, estado: 'activo', fecha_inicio: d
}]); alert("Creado"); document.getElementById('loan-preview').classList.add('hidden'); cargarPrestamos();
}

// --- AHORRO (FINALMENTE ARREGLADO) ---
async function verSaldoAhorro() {
const c = document.getElementById('select-clientes-a').value;
if (!c) {
document.getElementById('hist-ahorro-cli-wrapper').classList.add('hidden'); document.getElementById('saldo-ahorro-display').innerText = '$0.00'; return;
}

// Usamos fecha_movimiento que ahora EXISTE gracias al SQL
const {
data,
error
} = await _supabase.from('movimientos_ahorro')
.select('*')
.eq('cliente_id', c)
.order('fecha_movimiento', {
ascending: false
});

if (error) {
console.error(error); return;
}

let s = 0;
const tb = document.getElementById('lista-ahorros-cliente');
tb.innerHTML = '';

if (data && data.length > 0) {
document.getElementById('hist-ahorro-cli-wrapper').classList.remove('hidden');
data.forEach(x => {
const montoNum = parseMoney(x.monto);
const t = (x.tipo || "").toUpperCase();
const esRetiro = t.includes('RETIR');

if (esRetiro) s -= montoNum; else s += montoNum;

// Prioridad fecha_movimiento
const fechaRaw = x.fecha_movimiento || x.created_at || new Date();
const fechaStr = new Date(fechaRaw).toLocaleDateString();

tb.innerHTML += `<tr><td style="padding:8px;">${fechaStr}</td><td style="padding:8px;">${x.tipo || 'Depósito'}</td><td style="padding:8px; font-weight:bold; color:${esRetiro?'red': 'green'}">${esRetiro?'-': '+'}$${montoNum.toLocaleString()}</td></tr>`;
});
} else {
document.getElementById('hist-ahorro-cli-wrapper').classList.add('hidden');
}
document.getElementById('saldo-ahorro-display').innerText = `$${s.toFixed(2)}`;
}

async function movimientoAhorro() {
const c = document.getElementById('select-clientes-a').value, m = parseFloat(document.getElementById('monto-ahorro').value), t = document.getElementById('tipo-ahorro').value, con = document.getElementById('concepto-ahorro').value;
if (!c || !m) return alert("Selecciona cliente y monto");

await _supabase.from('movimientos_ahorro').insert([{
cliente_id: c,
monto: m,
tipo: t,
concepto: con,
fecha_movimiento: new Date().toISOString()
}]);

document.getElementById('monto-ahorro').value = '';
document.getElementById('concepto-ahorro').value = '';
alert("Registrado correctamente");
verSaldoAhorro();
cargarDashboard();
}


// --- HISTORIAL INDIVIDUAL (CON CORRECCIÓN DE DINERO) ---
async function abrirHistorial(pid) {
const {
data: p
} = await _supabase.from('prestamos').select('*, clientes(*), abonos_prestamos(*)').eq('id', pid).single();
prestamoActualHistorial = p;
const ab = p.abonos_prestamos ? p.abonos_prestamos.reduce((s, a)=>s+parseMoney(a.monto_abonado), 0): 0;

document.getElementById('hist-tot-pres').innerText = '$'+parseMoney(p.monto_prestado).toLocaleString();
document.getElementById('hist-tot-deu').innerText = '$'+parseMoney(p.monto_total_a_pagar).toLocaleString();
document.getElementById('hist-saldo').innerText = '$'+(parseMoney(p.monto_total_a_pagar) - ab).toLocaleString();

const tb = document.querySelector('#tabla-historial-ind tbody'); tb.innerHTML = '';
if (p.abonos_prestamos) {
p.abonos_prestamos.forEach(a => {
tb.innerHTML += `<tr><td>${new Date(a.created_at).toLocaleDateString()}</td><td>$${parseMoney(a.monto_abonado).toLocaleString()}</td><td><button class="btn-mini btn-del" onclick="borrarAbono('${a.id}','${pid}')">🗑️</button></td></tr>`;
});
}
document.getElementById('modal-historial').classList.remove('hidden');
}

async function borrarAbono(aid, pid) {
if (confirm("¿Eliminar este abono?")) {
await _supabase.from('abonos_prestamos').delete().eq('id', aid);
abrirHistorial(pid);
cargarPrestamos();
cargarDashboard();
}
}

function imprimirHistorialPDF() {
if (!prestamoActualHistorial) return;
const p = prestamoActualHistorial;
const {
jsPDF
} = window.jspdf;
const doc = new jsPDF();

doc.text("Estado de Cuenta", 14, 20);
doc.setFontSize(10);
doc.text(`Cliente: ${p.clientes.nombre_completo}`, 14, 30);

const ab = p.abonos_prestamos ? p.abonos_prestamos.reduce((s, a)=>s+parseMoney(a.monto_abonado), 0): 0;

doc.autoTable({
startY: 35,
body: [
['Prestado', `$${parseMoney(p.monto_prestado).toLocaleString()}`],
['Total Deuda', `$${parseMoney(p.monto_total_a_pagar).toLocaleString()}`],
['Pagado', `-$${ab.toLocaleString()}`],
['SALDO PENDIENTE', `$${(parseMoney(p.monto_total_a_pagar) - ab).toLocaleString()}`]
]
});

if (p.abonos_prestamos) {
doc.autoTable({
startY: doc.lastAutoTable.finalY+10,
head: [['Fecha', 'Monto']],
body: p.abonos_prestamos.map(a => [new Date(a.created_at).toLocaleDateString(), `$${parseMoney(a.monto_abonado).toLocaleString()}`])
});
}

doc.save(`EdoCuenta_${p.clientes.nombre_completo}.pdf`);
}

// --- TANDAS (COMPLETO) ---
async function crearTanda() {
const n = document.getElementById('tanda-nom').value, m = document.getElementById('tanda-monto').value, f = document.getElementById('tanda-frec').value, d = document.getElementById('tanda-fecha').value;
await _supabase.from('tandas').insert([{
nombre: n, monto_aporte: m, frecuencia: f, fecha_inicio: d
}]);
alert("Tanda Creada"); cargarTandas();
}

async function cargarTandas() {
const {
data
} = await _supabase.from('tandas').select('*');
const l = document.getElementById('lista-tandas'); l.innerHTML = '';
if (data) data.forEach(t => {
l.innerHTML += `<div style="padding:10px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center;"><div><strong>${t.nombre}</strong><br><small>$${t.monto_aporte} - ${t.frecuencia}</small></div><button class="btn-mini btn-edit" onclick="gestionarTanda('${t.id}', '${t.nombre}', '${t.fecha_inicio}', '${t.monto_aporte}', '${t.frecuencia}')">⚙️ Gestionar</button></div>`;
});
}

async function gestionarTanda(id, nombre, fecha, monto, frec) {
currentTandaData = {
id,
nombre,
fecha,
monto,
frec
};
document.getElementById('id-gest-tanda').value = id;
document.getElementById('tit-gest-tanda').innerText = nombre;
document.getElementById('modal-gest-tanda').classList.remove('hidden');
cargarMiembrosTanda(id);
}

async function agregarMiembroTanda() {
const id = document.getElementById('id-gest-tanda').value, cid = document.getElementById('sel-miembro-tanda').value, num = document.getElementById('num-tanda').value;
if (!cid||!num)return;
const {
error
} = await _supabase.from('tanda_miembros').insert([{
tanda_id: id, cliente_id: cid, numero_turno: num
}]);
if (!error) cargarMiembrosTanda(id); else alert("Error: Verifica que no esté repetido");
}

async function cargarMiembrosTanda(tid) {
const {
data
} = await _supabase.from('tanda_miembros').select('*, clientes(nombre_completo)').eq('tanda_id', tid).order('numero_turno', {
ascending: true
});
const tb = document.querySelector('#tabla-miembros-tanda tbody'); tb.innerHTML = '';
if (data) data.forEach(m => {
tb.innerHTML += `<tr><td>${m.numero_turno}</td><td>${m.clientes.nombre_completo}</td><td><button class="btn-mini btn-del" onclick="borrarMiembroTanda('${m.id}','${tid}')">🗑️</button></td></tr>`;
});
}

async function borrarMiembroTanda(mid, tid) {
if (confirm("¿Quitar miembro?")) {
await _supabase.from('tanda_miembros').delete().eq('id', mid); cargarMiembrosTanda(tid);
}
}

function generarPDFTanda() {
if (!currentTandaData) return;
const {
jsPDF
} = window.jspdf; const doc = new jsPDF();
doc.text(`Tanda: ${currentTandaData.nombre}`, 14, 20);
doc.setFontSize(10);
doc.text(`Inicio: ${new Date(currentTandaData.fecha).toLocaleDateString()} | Aporte: $${currentTandaData.monto}`, 14, 28);

const filas = [];
document.querySelectorAll('#tabla-miembros-tanda tbody tr').forEach(tr => {
const tds = tr.querySelectorAll('td');
if (tds.length > 1) {
const turno = parseInt(tds[0].innerText);
const dias = currentTandaData.frec === 'Semanal' ? 7: 15;
const f = new Date(currentTandaData.fecha);
f.setDate(f.getDate() + ((turno-1)*dias));
filas.push([tds[0].innerText, tds[1].innerText, f.toLocaleDateString()]);
}
});
doc.autoTable({
startY: 35,
head: [['Turno',
'Nombre',
'Fecha Entrega']],
body: filas
});
doc.save(`Tanda_${currentTandaData.nombre}.pdf`);
}

// --- REPORTES Y EXPORTACIÓN ---
async function verBitacora(tipo) {
const visor = document.getElementById('visor-reportes'); visor.classList.remove('hidden');
const th = document.querySelector('#tabla-visor thead'), tb = document.querySelector('#tabla-visor tbody'), btn = document.getElementById('btn-imprimir-reporte');
tb.innerHTML = '<tr><td>Cargando...</td></tr>';

// Helper de fecha segura
const getFecha = (x) => x.fecha_movimiento || x.fecha_inicio || x.created_at || new Date().toISOString();

if (tipo === 'prestamos') {
th.innerHTML = '<tr><th>Cliente</th><th>Total</th><th>Fecha</th></tr>';
const {
data
} = await _supabase.from('prestamos').select('*, clientes(nombre_completo)').order('fecha_inicio', {
ascending: false
});
tb.innerHTML = ''; const pdf = [];
if (data && data.length > 0) data.forEach(x => {
const m = parseMoney(x.monto_total_a_pagar);
const f = new Date(getFecha(x)).toLocaleDateString();
tb.innerHTML += `<tr><td>${x.clientes.nombre_completo}</td><td>$${m.toLocaleString()}</td><td>${f}</td></tr>`;
pdf.push([x.clientes.nombre_completo, `$${m.toLocaleString()}`, f]);
});
else tb.innerHTML = '<tr><td>Sin datos</td></tr>';
btn.onclick = ()=>generarPDF("Bitacora_Prestamos", ["Cliente", "Total", "Fecha"], pdf);
} else if (tipo === 'ahorro') {
// AQUI ESTÁ EL CAMBIO: Agregamos columna Fecha
th.innerHTML = '<tr><th>Fecha</th><th>Cliente</th><th>Monto</th><th>Tipo</th></tr>';

// Ordenamos por fecha_movimiento para que salga cronológico
const {
data
} = await _supabase.from('movimientos_ahorro').select('*, clientes(nombre_completo)').order('fecha_movimiento', {
ascending: false
});

tb.innerHTML = ''; const pdf = [];
if (data && data.length > 0) data.forEach(x => {
const m = parseMoney(x.monto);
const f = new Date(getFecha(x)).toLocaleDateString(); // Fecha formateada

tb.innerHTML += `<tr><td>${f}</td><td>${x.clientes.nombre_completo}</td><td>$${m.toLocaleString()}</td><td>${x.tipo}</td></tr>`;
pdf.push([f, x.clientes.nombre_completo, `$${m.toLocaleString()}`, x.tipo]);
});
else tb.innerHTML = '<tr><td>Sin datos</td></tr>';

// Actualizamos el PDF también con la nueva columna
btn.onclick = ()=>generarPDF("Bitacora_Ahorro", ["Fecha", "Cliente", "Monto", "Tipo"], pdf);
} else if (tipo === 'tandas') {
th.innerHTML = '<tr><th>Nombre</th><th>Aporte</th><th>Inicio</th></tr>';
const {
data
} = await _supabase.from('tandas').select('*');
tb.innerHTML = ''; const pdf = [];
if (data && data.length > 0) data.forEach(x => {
const f = new Date(x.fecha_inicio).toLocaleDateString();
tb.innerHTML += `<tr><td>${x.nombre}</td><td>$${x.monto_aporte}</td><td>${f}</td></tr>`;
pdf.push([x.nombre, `$${x.monto_aporte}`, f]);
});
else tb.innerHTML = '<tr><td>Sin datos</td></tr>';
btn.onclick = ()=>generarPDF("Bitacora_Tandas", ["Nombre", "Aporte", "Inicio"], pdf);
}
}


async function verReporteSemanal() {
const visor = document.getElementById('visor-reportes'); visor.classList.remove('hidden');

// 1. Cabecera visual en la App (Vista Previa)
document.querySelector('#tabla-visor thead').innerHTML = '<tr><th>Cliente</th><th>Prestado</th><th>Abonado</th><th>Resta</th><th># Pago</th></tr>';

const {
data
} = await _supabase.from('prestamos').select('*, clientes(nombre_completo), abonos_prestamos(monto_abonado)').eq('estado', 'activo');
const tb = document.querySelector('#tabla-visor tbody'); tb.innerHTML = '';
const pdf = [];

if (data) data.forEach(p => {
// Cálculos Matemáticos
const ab = p.abonos_prestamos ? p.abonos_prestamos.reduce((s, a)=>s+parseMoney(a.monto_abonado), 0): 0;
const total = parseMoney(p.monto_total_a_pagar);
const prestado = parseMoney(p.monto_prestado);
const rest = total - ab;

// Cálculo de Número de Pago (Aproximado)
// Dividimos lo abonado entre el monto de la cuota para saber en qué pago va
// Ejemplo: Si la cuota es $100 y ha pagado $300, va en el pago 3.
// Extraemos el número de pagos totales del texto "Semanal (10 pagos)" -> 10
const numPagosTotal = parseInt(p.frecuencia_pago.match(/\d+/)) || 1;
const valorCuota = total / numPagosTotal;

// Si la cuota es 0 (error), evitamos dividir por cero
const pagosRealizados = valorCuota > 0 ? Math.floor(ab / valorCuota): 0;
const textoPago = `${pagosRealizados}/${numPagosTotal}`;

const fec = new Date(p.fecha_inicio);
fec.setDate(fec.getDate()+7); // Fecha límite estimada (próxima semana)

if (rest > 0.1) {
// Solo mostramos si debe más de 10 centavos
// Fila HTML (Vista rápida)
tb.innerHTML += `<tr>
<td>${p.clientes.nombre_completo}</td>
<td>$${prestado.toLocaleString()}</td>
<td style="color:green;">$${ab.toLocaleString()}</td>
<td style="color:red; font-weight:bold;">$${rest.toLocaleString()}</td>
<td>${textoPago}</td>
</tr>`;

// Fila PDF (Datos completos)
pdf.push([
p.clientes.nombre_completo,
`$${prestado.toLocaleString()}`, // Monto Prestado
`$${total.toLocaleString()}`, // Monto Total a Pagar
`$${ab.toLocaleString()}`, // Monto Abonado
`$${rest.toLocaleString()}`, // Resta
textoPago, // No. Pago (Ej: 3/10)
fec.toLocaleDateString() // Fecha Límite
]);
}
});

// Configuración del botón de imprimir
document.getElementById('btn-imprimir-reporte').onclick = ()=> {
const {
jsPDF
} = window.jspdf;
const doc = new jsPDF('l'); // 'l' = Landscape (Horizontal) para que quepa todo

doc.setFontSize(18);
doc.text("Reporte Semanal de Cobranza",
14,
15);
doc.setFontSize(10);
doc.text(`Generado el: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
14,
22);

doc.autoTable({
startY: 25,
head: [['Cliente',
'Prestado',
'Total Deuda',
'Abonado',
'Resta',
'Pago #',
'F. Límite']],
body: pdf,
theme: 'grid',
headStyles: {
fillColor: [22,
163,
74]
},
// Verde bonito
styles: {
fontSize: 10,
cellPadding: 3
}
});

doc.save(`Reporte_Cobranza_${new Date().toISOString().split('T')[0]}.pdf`);
}
}


function generarPDF(t, c, b) {
const {
jsPDF
} = window.jspdf; const doc = new jsPDF(); doc.text(t, 14, 20); doc.autoTable({
startY: 30,
head: [c],
body: b
}); doc.save(`${t}.pdf`);
}

// --- 📊 EXPORTAR TODO A EXCEL (MEJORADO PARA FECHAS V13) ---
async function exportarExcelDetallado() {
if (!confirm("¿Descargar copia completa en Excel?")) return;

const {
data: c
} = await _supabase.from('clientes').select('*');
const {
data: p
} = await _supabase.from('prestamos').select('*, clientes(nombre_completo)');
const {
data: a
} = await _supabase.from('abonos_prestamos').select('*, prestamos(monto_total_a_pagar, clientes(nombre_completo))');
const {
data: s
} = await _supabase.from('movimientos_ahorro').select('*, clientes(nombre_completo)');
const {
data: t
} = await _supabase.from('tandas').select('*');
const {
data: tm
} = await _supabase.from('tanda_miembros').select('*, tandas(nombre), clientes(nombre_completo)');

const fmt = (d) => d ? new Date(d).toLocaleDateString(): '-';
// Helper para fecha híbrida (nueva o vieja)
const getFecha = (x) => x.created_at || x.fecha_movimiento || null;

const hojaC = c ? c.map(x => ({
"ID": x.id, "Nombre": x.nombre_completo, "Tel": x.telefono, "Nota": x.notas
})): [];
const hojaP = p ? p.map(x => ({
"Cliente": x.clientes.nombre_completo, "Prestado": parseMoney(x.monto_prestado), "Total": parseMoney(x.monto_total_a_pagar), "Fecha": fmt(x.fecha_inicio)
})): [];
const hojaA = a ? a.map(x => ({
"Cliente": x.prestamos.clientes.nombre_completo, "Abono": parseMoney(x.monto_abonado), "Fecha": fmt(x.created_at)
})): [];

// Aquí aplicamos la corrección de fecha para el Excel de Ahorros también
const hojaS = s ? s.map(x => ({
"Cliente": x.clientes.nombre_completo, "Tipo": x.tipo, "Monto": parseMoney(x.monto), "Fecha": fmt(getFecha(x))
})): [];

const hojaT = t ? t.map(x => ({
"Tanda": x.nombre, "Aporte": x.monto_aporte, "Inicio": fmt(x.fecha_inicio)
})): [];
const hojaTM = tm ? tm.map(x => ({
"Tanda": x.tandas.nombre, "Miembro": x.clientes.nombre_completo, "Turno": x.numero_turno
})): [];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hojaC), "Clientes");
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hojaP), "Prestamos");
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hojaA), "Abonos");
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hojaS), "Ahorros");
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hojaT), "Tandas");
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hojaTM), "Miembros");

XLSX.writeFile(wb, "SuperFinTech_Respaldo_Completo.xlsx");
}

// --- UTILIDADES ---
function abrirAbono(id, sal) {
document.getElementById('id-p-modal').value = id; document.getElementById('txt-deuda-modal').innerText = '$'+sal.toLocaleString(); document.getElementById('modal-abono').classList.remove('hidden');
}
async function confirmarAbono() {
const id = document.getElementById('id-p-modal').value, m = document.getElementById('monto-abono').value; await _supabase.from('abonos_prestamos').insert([{
prestamo_id: id, monto_abonado: m
}]); document.getElementById('modal-abono').classList.add('hidden'); cargarPrestamos();
}
async function borrar(t, id) {
if (confirm("¿Borrar elemento permanentemente?")) {
await _supabase.from(t).delete().eq('id', id); cargarTodo();
}
}

function abrirConfiguracion() {
document.getElementById('modal-settings').classList.remove('hidden');
}

function toggleTheme() {
if (document.body.getAttribute('data-theme') === 'dark') {
document.body.removeAttribute('data-theme');
localStorage.setItem('t', 'l');
} else {
document.body.setAttribute('data-theme', 'dark');
localStorage.setItem('t', 'd');
}
cargarDashboard();
}
if (localStorage.getItem('t') === 'd') document.body.setAttribute('data-theme', 'dark');

// --- ☢️ ZONA DE PELIGRO: BORRADO TOTAL ☢️ ---
async function borrarBaseDatosCompleta() {
const confirm1 = confirm("⚠️ ¡PELIGRO EXTREMO! ⚠️\n\n¿Estás seguro de que quieres BORRAR TODA LA INFORMACIÓN?\n\nEsto eliminará TODOS los clientes, préstamos, ahorros y tandas.\n\nNO SE PUEDE DESHACER.");
if (!confirm1) return;

const frase = prompt("Para confirmar, escribe exactamente: BORRAR TODO");
if (frase !== "BORRAR TODO") return alert("Operación cancelada. La frase no coincide.");

alert("Iniciando borrado... No cierres la página.");

// Orden de borrado: Hijos primero -> Padres después
const tablas = [
'tanda_pagos',
'tanda_miembros',
'abonos_prestamos',
'movimientos_ahorro',
'prestamos',
'tandas',
'clientes'
];

try {
for (const t of tablas) {
// Borramos todo lo que tenga una fecha de creación (es decir, todo)
// Nota: para tablas viejas sin created_at, esto podría fallar, así que usamos un truco
// Borramos donde el ID no sea nulo (o sea, todo)
const {
error
} = await _supabase.from(t).delete().neq('id', 0); // Asumiendo IDs numéricos o UUIDs que no son 0
if (error) console.error(`Error borrando ${t}:`, error);
}
alert("✅ BASE DE DATOS REINICIADA.\n\nLa aplicación comenzará desde cero.");
location.reload();
} catch (e) {
alert("Ocurrió un error al intentar borrar: " + e.message);
}
}

// --- FUNCIONES EXTRA LOGIN ---

// 1. Mostrar/Ocultar Contraseña
function togglePassLogin() {
const input = document.getElementById('password');
const btn = document.getElementById('btn-eye');
if (input.type === 'password') {
input.type = 'text';
btn.innerText = '🙈'; // Cambia a monito tapándose los ojos
} else {
input.type = 'password';
btn.innerText = '👁️';
}
}

// 2. Ayuda para Crear Cuenta
function mostrarAyudaLogin() {
alert(
"💡 AYUDA DE CUENTA\n\n" +
"1. Escribe un correo real y una contraseña segura.\n" +
"2. Dale click en 'Crear Cuenta'.\n" +
"3. IMPORTANTE: Cuando Google/Navegador te pregunte '¿Guardar contraseña?', dale que SÍ ✅.\n\n" +
"Así entrarás rápido y seguro la próxima vez."
);
}

// 3. Recuperar Contraseña
async function recuperarContra() {
const e = document.getElementById('email').value;
if (!e) return alert("⚠️ Primero escribe tu correo en la casilla de arriba para saber a dónde enviar el enlace.");

const {
error
} = await _supabase.auth.resetPasswordForEmail(e, {
redirectTo: window.location.href, // Para que vuelva a esta página
});

if (error) {
alert("Error: " + error.message);
} else {
alert("📧 ¡Enviado!\n\nRevisa tu correo (y la carpeta Spam). Te llegará un enlace mágico para entrar y cambiar tu contraseña.");
}
}

// ==========================================
// 📱 FUNCIONES DE WHATSAPP AUTOMÁTICO
// ==========================================

// Ayudante: Limpia el número y agrega lada MX si es necesario
function formatearCelular(numero) {
    if (!numero || numero === 'null') return null;
    let limpio = numero.toString().replace(/\D/g, ''); // Quita espacios y guiones
    
    // Si tiene 10 dígitos (ej. 8717123456), agrega 52
    if (limpio.length === 10) return '52' + limpio;
    return limpio;
}

// A. COBRANZA (Para Préstamos)
function whatsappPrestamo(nombre, telefono, monto, fecha) {
    const cel = formatearCelular(telefono);
    if (!cel) return alert("⚠️ El cliente no tiene celular registrado.");

    const msg = `Hola ${nombre} 👋, paso a recordarte tu pago pendiente en *SuperFinTech*.\n\n💰 Saldo restante: $${monto}\n📅 Fecha corte: ${fecha}\n\nQuedo al pendiente. ¡Gracias!`;
    window.open(`https://wa.me/${cel}?text=${encodeURIComponent(msg)}`, '_blank');
}

// B. COMPROBANTE (Para Ahorros)
function whatsappAhorro(nombre, telefono, monto, semana) {
    const cel = formatearCelular(telefono);
    if (!cel) return alert("⚠️ El cliente no tiene celular registrado.");

    const msg = `¡Hola ${nombre}! 🌟\n\n✅ Confirmo que recibí tu ahorro.\n💰 Cantidad: $${monto}\n🗓️ Semana: ${semana}\n\n¡Sigue así! Tu meta está más cerca. 🚀`;
    window.open(`https://wa.me/${cel}?text=${encodeURIComponent(msg)}`, '_blank');
}
