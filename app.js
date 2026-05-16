const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR0Yls1hbeHzc_K6z-sJFpjnQYqA9dSW9LZcLi7FOkYdqDtnuVNaNh5T9pbLbIJXv5ZgICe63uyag0a/pub?gid=0&single=true&output=csv';

// drugConfig: { "bevacizumab": 4, ... } - populated from sheet (applications per vial)
let drugConfig = {};
let currentSummary = null;
let currentEditingDrug = null;

function escHtml(str) {
return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function parseCSV(text) {
const rows = [];
const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
for (const line of lines) {
    const values = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
        continue;
        }
        inQuotes = !inQuotes;
        continue;
    }
    if (ch === ',' && !inQuotes) {
        values.push(cur);
        cur = '';
        continue;
    }
    cur += ch;
    }
    values.push(cur);
    rows.push(values.map((v) => v.trim()));
}
return rows;
}

async function loadDrugsFromSheet() {
const loadingEl = document.getElementById('config-loading');
const errorEl = document.getElementById('config-error');
const tableWrap = document.getElementById('config-table-wrap');
const tbody = document.getElementById('drugs-tbody');

loadingEl.style.display = 'flex';
errorEl.style.display = 'none';
tableWrap.style.display = 'none';
drugConfig = {};

try {
    const res = await fetch(SHEET_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    const rows = parseCSV(text);
    if (rows.length === 0) throw new Error('CSV vacío');

    const header = rows[0].map((h) => h.toLowerCase());
    const drugIdx = header.findIndex((h) => h.includes('droga'));
    const appsPerVialIdx = header.findIndex((h) => h.includes('aplicaciones') || h.includes('apps') || h.includes('aplicaciones_por'));
    if (drugIdx === -1 || appsPerVialIdx === -1) {
    throw new Error('Encabezados no encontrados: se esperan "Droga" y "Aplicaciones_por_ampolla"');
    }

    tbody.innerHTML = '';
    for (let i = 1; i < rows.length; i++) {
    const name = (rows[i][drugIdx] || '').trim();
    const qty = Number((rows[i][appsPerVialIdx] || '').replace(/\s+/g, ''));
    if (!name) continue;
    drugConfig[name.toLowerCase()] = Number.isFinite(qty) && qty > 0 ? qty : NaN;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escHtml(name)}</td><td>${Number.isFinite(qty) && qty > 0 ? qty : '-'}</td>`;
    tbody.appendChild(tr);
    }

    loadingEl.style.display = 'none';
    tableWrap.style.display = 'block';

    if (currentSummary) {
    renderSummary();
    }
} catch (e) {
    loadingEl.style.display = 'none';
    errorEl.style.display = 'block';
}
}

function switchTab(tab) {
document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
document.querySelectorAll('.pane').forEach((p) => p.classList.remove('active'));
document.querySelector(`.tab[onclick="switchTab('${tab}')"]`).classList.add('active');
document.getElementById('pane-' + tab).classList.add('active');
}

function parseEye(val) {
const v = val.trim().toUpperCase();
if (v === 'AO') return 2;
if (v === 'OI' || v === 'OD') return 1;
return null;
}

function getAmpoulesForDrug(drug, eyes) {
const appsPerVial = drugConfig[drug.toLowerCase()];
return {
    appsPerVial,
    ampoules: appsPerVial ? Math.ceil(eyes / appsPerVial) : null
};
}

function closeEditModal() {
const modal = document.getElementById('edit-modal');
const errorEl = document.getElementById('edit-modal-error');
modal.style.display = 'none';
errorEl.style.display = 'none';
errorEl.textContent = '';
currentEditingDrug = null;
}

function openEditModal(drug) {
if (!currentSummary || !(drug in currentSummary.eyeCounts)) return;

currentEditingDrug = drug;
document.getElementById('edit-modal-title').textContent = drug;
document.getElementById('edit-eyes-input').value = currentSummary.eyeCounts[drug];
document.getElementById('edit-modal-error').style.display = 'none';
document.getElementById('edit-modal-error').textContent = '';
document.getElementById('edit-modal').style.display = 'flex';
document.getElementById('edit-eyes-input').focus();
document.getElementById('edit-eyes-input').select();
}

function saveEditedEyes(event) {
event.preventDefault();
if (!currentSummary || !currentEditingDrug) return;

const input = document.getElementById('edit-eyes-input');
const errorEl = document.getElementById('edit-modal-error');
const newEyes = Number(input.value);

if (!Number.isInteger(newEyes) || newEyes < 0) {
    errorEl.textContent = 'Ingresá un número entero mayor o igual a 0.';
    errorEl.style.display = 'block';
    input.focus();
    return;
}

currentSummary.eyeCounts[currentEditingDrug] = newEyes;
closeEditModal();
renderSummary();
}

function renderSummary() {
if (!currentSummary) return;

const drugs = Object.keys(currentSummary.eyeCounts).sort();
let totalEyes = 0;
let totalAmpoules = 0;
const unrecognized = [];
const resultEl = document.getElementById('results-grid');
resultEl.innerHTML = '';

drugs.forEach((drug) => {
    const eyes = currentSummary.eyeCounts[drug];
    totalEyes += eyes;

    const { appsPerVial, ampoules } = getAmpoulesForDrug(drug, eyes);
    if (ampoules !== null) {
    totalAmpoules += ampoules;
    } else {
    unrecognized.push(drug);
    }

    const card = document.createElement('div');
    card.className = 'drug-card';

    const title = document.createElement('div');
    title.className = 'drug-card-name';
    title.textContent = drug;
    card.appendChild(title);

    const eyeRow = document.createElement('div');
    eyeRow.className = 'drug-card-row';
    eyeRow.innerHTML = `
        <span class="dc-label">Ojos</span>
        <span class="dc-value">${eyes}</span>
    `;
    card.appendChild(eyeRow);

    const ampRow = document.createElement('div');
    ampRow.className = 'drug-card-row';
    ampRow.innerHTML = `
    <span class="dc-label">Ampollas${appsPerVial ? ' (x' + appsPerVial + ' apps/amp.)' : ''}</span>
    <span class="dc-value${ampoules === null ? ' muted' : ''}">${ampoules !== null ? ampoules : '-'}</span>
    `;
    card.appendChild(ampRow);

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'btn-secondary card-edit-btn';
    editButton.textContent = 'Editar';
    editButton.addEventListener('click', () => openEditModal(drug));
    card.appendChild(editButton);

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
    w.innerHTML = `<strong>Drogas no reconocidas:</strong> ${unrecognized.map(escHtml).join(', ')} - no están en la planilla de configuración.`;
    warnContainer.appendChild(w);
}
if (currentSummary.skipped > 0) {
    const w = document.createElement('div');
    w.className = 'warn-msg';
    w.style.marginTop = '8px';
    w.textContent = `${currentSummary.skipped} fila(s) omitidas por datos inválidos (valor de ojo desconocido o droga vacía).`;
    warnContainer.appendChild(w);
}

document.getElementById('results-section').style.display = 'block';
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
if (!raw) {
    showError('Pegá los datos del Excel primero.');
    return;
}

const lines = raw.split('\n').map((l) => l.trim()).filter((l) => l);
if (lines.length < 2) {
    showError('Se necesitan al menos dos filas (encabezado + datos).');
    return;
}

const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';

const rows = lines.map((l) => l.split(sep).map((c) => (c || '').trim()));

// Try to detect headers by name (flexible contains)
const firstRow = rows[0].map((c) => (c || '').toLowerCase());
let drugIdx = firstRow.findIndex((h) => h.includes('droga') || h.includes('drug'));
let eyeIdx = firstRow.findIndex((h) => h.includes('ojo') || h.includes('eye') || h.includes('oi') || h.includes('od'));
let dataStart = 1;

// If headers not found, try to auto-detect columns from values (assume no header row)
if (drugIdx === -1 || eyeIdx === -1) {
    // analyze columns across rows (including first row as data)
    const maxRows = Math.min(rows.length, 40);
    const colCount = rows[0].length;
    const eyeScores = new Array(colCount).fill(0);
    const drugScores = new Array(colCount).fill(0);

    for (let j = 0; j < colCount; j++) {
    for (let i = 0; i < maxRows; i++) {
        const v = (rows[i][j] || '').trim();
        if (!v) continue;
        if (parseEye(v) !== null) eyeScores[j]++;
        // drug likely contains letters and is not an eye code
        if (/[A-Za-zÑñ].*/.test(v) && parseEye(v) === null) drugScores[j]++;
    }
    }

    const bestEye = eyeScores.indexOf(Math.max(...eyeScores));
    const bestDrug = drugScores.indexOf(Math.max(...drugScores));

    if (eyeScores[bestEye] > 0 && drugScores[bestDrug] > 0 && bestEye !== bestDrug) {
    eyeIdx = bestEye;
    drugIdx = bestDrug;
    dataStart = 0; // first row is data
    } else {
    showError('No se pudieron detectar las columnas de droga y ojo automáticamente. Asegurate que haya columnas con nombres o valores reconocibles.');
    return;
    }
}

const eyeCounts = {};
let skipped = 0;
for (let i = dataStart; i < rows.length; i++) {
    const cols = rows[i];
    const drug = (cols[drugIdx] || '').trim();
    const eyeVal = (cols[eyeIdx] || '').trim();
    const eyes = parseEye(eyeVal);
    if (!drug || eyes === null) {
    skipped++;
    continue;
    }
    eyeCounts[drug] = (eyeCounts[drug] || 0) + eyes;
}

if (Object.keys(eyeCounts).length === 0) {
    showError('No se encontraron filas válidas. Verificá el formato de los datos.');
    return;
}

currentSummary = { eyeCounts, skipped };
renderSummary();
}

function showError(msg) {
const el = document.getElementById('error-msg');
el.textContent = msg;
el.style.display = 'block';
}

document.getElementById('edit-modal-form').addEventListener('submit', saveEditedEyes);
document.getElementById('edit-modal-close').addEventListener('click', closeEditModal);
document.getElementById('edit-modal-cancel').addEventListener('click', closeEditModal);
document.getElementById('edit-modal').addEventListener('click', (event) => {
if (event.target.id === 'edit-modal') {
    closeEditModal();
}
});
document.addEventListener('keydown', (event) => {
if (event.key === 'Escape' && currentEditingDrug) {
    closeEditModal();
}
});

// Init
loadDrugsFromSheet();
