const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR0Yls1hbeHzc_K6z-sJFpjnQYqA9dSW9LZcLi7FOkYdqDtnuVNaNh5T9pbLbIJXv5ZgICe63uyag0a/pub?gid=0&single=true&output=csv';

// drugConfig: { "bevacizumab": 4, ... } — populated from sheet (applications per vial)
let drugConfig = {};

function escHtml(str) {
return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function parseCSV(text) {
const rows = [];
const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
for (const line of lines) {
    const values = [];
    let cur = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
        if (inQuotes && line[i+1] === '"') { cur += '"'; i++; continue; }
        inQuotes = !inQuotes;
        continue;
    }
    if (ch === ',' && !inQuotes) { values.push(cur); cur = ''; continue; }
    cur += ch;
    }
    values.push(cur);
    rows.push(values.map(v => v.trim()));
}
return rows;
}

async function loadDrugsFromSheet() {
const loadingEl = document.getElementById('config-loading');
const errorEl   = document.getElementById('config-error');
const tableWrap = document.getElementById('config-table-wrap');
const tbody     = document.getElementById('drugs-tbody');

loadingEl.style.display = 'flex';
errorEl.style.display   = 'none';
tableWrap.style.display = 'none';
drugConfig = {};

try {
    const res = await fetch(SHEET_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    const rows = parseCSV(text);
    if (rows.length === 0) throw new Error('CSV vacío');

    const header = rows[0].map(h => h.toLowerCase());
    const drugIdx  = header.findIndex(h => h.includes('droga'));
    const appsPerVialIdx = header.findIndex(h => h.includes('aplicaciones') || h.includes('apps') || h.includes('aplicaciones_por'));
    if (drugIdx === -1 || appsPerVialIdx === -1)
    throw new Error('Encabezados no encontrados: se esperan "Droga" y "Aplicaciones_por_ampolla"');

    tbody.innerHTML = '';
    for (let i = 1; i < rows.length; i++) {
    const name = (rows[i][drugIdx] || '').trim();
    const qty  = Number((rows[i][appsPerVialIdx] || '').replace(/\s+/g, ''));
    if (!name) continue;
    drugConfig[name.toLowerCase()] = Number.isFinite(qty) && qty > 0 ? qty : NaN;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escHtml(name)}</td><td>${Number.isFinite(qty) && qty > 0 ? qty : '—'}</td>`;
    tbody.appendChild(tr);
    }

    loadingEl.style.display = 'none';
    tableWrap.style.display = 'block';
} catch(e) {
    loadingEl.style.display = 'none';
    errorEl.style.display   = 'block';
}
}

function switchTab(tab) {
document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
document.querySelectorAll('.pane').forEach(p => p.classList.remove('active'));
document.querySelector(`.tab[onclick="switchTab('${tab}')"]`).classList.add('active');
document.getElementById('pane-' + tab).classList.add('active');
}

function parseEye(val) {
const v = val.trim().toUpperCase();
if (v === 'AO') return 2;
if (v === 'OI' || v === 'OD') return 1;
return null;
}

function calculate() {
const errEl = document.getElementById('error-msg');
errEl.style.display = 'none';
errEl.textContent = '';
document.getElementById('results-section').style.display = 'none';

if (Object.keys(drugConfig).length === 0) {
    showError('Las drogas aún no se cargaron. Verificá tu conexión e intentá de nuevo desde la pestaña "Configuración de drogas".');
    return;
}

const raw = document.getElementById('paste-area').value.trim();
if (!raw) { showError('Pegá los datos del Excel primero.'); return; }

const lines = raw.split('\n').map(l => l.trim()).filter(l => l);
if (lines.length < 2) { showError('Se necesitan al menos dos filas (encabezado + datos).'); return; }

const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
const headers = lines[0].split(sep).map(h => h.trim().toLowerCase());
const drugIdx = headers.findIndex(h => h === 'droga');
const eyeIdx  = headers.findIndex(h => h === 'ojo');

if (drugIdx === -1 || eyeIdx === -1) {
    showError('No se encontraron columnas "Droga" y "Ojo" en los encabezados. Verificá que los nombres sean exactamente esos.');
    return;
}

const eyeCounts = {}; // drug -> total eyes
let skipped = 0;
for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep);
    const drug   = (cols[drugIdx] || '').trim();
    const eyeVal = (cols[eyeIdx]  || '').trim();
    const eyes = parseEye(eyeVal);
    if (!drug || eyes === null) { skipped++; continue; }
    eyeCounts[drug] = (eyeCounts[drug] || 0) + eyes;
}

const drugs = Object.keys(eyeCounts).sort();
if (drugs.length === 0) { showError('No se encontraron filas válidas. Verificá el formato de los datos.'); return; }

let totalEyes = 0, totalAmpoules = 0;
const unrecognized = [];
const resultEl = document.getElementById('results-grid');
resultEl.innerHTML = '';

drugs.forEach(drug => {
    const eyes = eyeCounts[drug];
    totalEyes += eyes;
    const appsPerVial = drugConfig[drug.toLowerCase()];
    const ampoules = appsPerVial ? Math.ceil(eyes / appsPerVial) : null;
    if (ampoules !== null) totalAmpoules += ampoules;
    else unrecognized.push(drug);

    const card = document.createElement('div');
    card.className = 'drug-card';
    card.innerHTML = `
    <div class="drug-card-name">${escHtml(drug)}</div>
    <div class="drug-card-row">
        <span class="dc-label">Ojos</span>
        <span class="dc-value">${eyes}</span>
    </div>
    <div class="drug-card-row">
        <span class="dc-label">Ampollas${appsPerVial ? ' (×' + appsPerVial + ' apps/amp.)' : ''}</span>
        <span class="dc-value${ampoules === null ? ' muted' : ''}">${ampoules !== null ? ampoules : '—'}</span>
    </div>
    `;
    resultEl.appendChild(card);
});

document.getElementById('totals-bar').innerHTML = `
    <div class="total-item">
    <span class="total-label">Total ojos</span>
    <span class="total-value">${totalEyes}</span>
    </div>
    <div class="total-item">
    <span class="total-label">Total ampollas necesarias</span>
    <span class="total-value">${totalAmpoules}</span>
    </div>
`;

const warnContainer = document.getElementById('warn-msg-container');
warnContainer.innerHTML = '';
if (unrecognized.length > 0) {
    const w = document.createElement('div');
    w.className = 'warn-msg';
    w.innerHTML = `<strong>Drogas no reconocidas:</strong> ${unrecognized.map(escHtml).join(', ')} — no están en la planilla de configuración.`;
    warnContainer.appendChild(w);
}
if (skipped > 0) {
    const w = document.createElement('div');
    w.className = 'warn-msg';
    w.style.marginTop = '8px';
    w.textContent = `${skipped} fila(s) omitidas por datos inválidos (valor de ojo desconocido o droga vacía).`;
    warnContainer.appendChild(w);
}

document.getElementById('results-section').style.display = 'block';
}

function showError(msg) {
const el = document.getElementById('error-msg');
el.textContent = msg;
el.style.display = 'block';
}

// Init
loadDrugsFromSheet(); 