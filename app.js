// =========================================================
// Fonte — app.js
// Initialisation Supabase + navigation par onglets + export/import JSON
// =========================================================

// ---------------------------------------------------------
// 0. CONFIGURATION — à renseigner avec les identifiants de votre projet Supabase
//    (Project Settings > API dans le dashboard Supabase)
// ---------------------------------------------------------
const SUPABASE_URL = 'https://bwpglzrnpurbsufyrzoz.supabase.co/rest/v1/';
const SUPABASE_ANON_KEY = 'sb_publishable_7y1e1M0Dcy7B7k89G2eq1w_gegUKKcM';

// Liste des tables gérées par l'application, dans un ORDRE DE DÉPENDANCE
// (une table ne référence que des tables qui la précèdent dans cette liste).
// Cet ordre est utilisé tel quel pour l'export et inversé pour l'import.
const TABLES = ['exercices', 'fetiches', 'seances', 'series', 'autres_sports'];

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------------------------------------------------------
// 1. Indicateur de connexion
// ---------------------------------------------------------
const syncDot = document.getElementById('sync-dot');
const syncLabel = document.getElementById('sync-label');

function setSyncStatus(state, message) {
  const colors = {
    checking: '#8B96A6',
    ok: '#4FA3C7',
    error: '#E8A33D'
  };
  syncDot.style.backgroundColor = colors[state] || colors.checking;
  syncLabel.textContent = message;
}

async function checkConnection() {
  if (SUPABASE_URL.includes('VOTRE-PROJET') || SUPABASE_ANON_KEY.includes('VOTRE-CLE')) {
    setSyncStatus('error', 'Identifiants Supabase non configurés');
    return;
  }
  setSyncStatus('checking', 'Connexion…');
  try {
    const { error } = await supabase.from('exercices').select('id').limit(1);
    if (error) throw error;
    setSyncStatus('ok', 'Connecté à Supabase');
  } catch (err) {
    console.error('Erreur de connexion Supabase :', err);
    setSyncStatus('error', 'Connexion impossible (voir console)');
  }
}

checkConnection();

// ---------------------------------------------------------
// 2. Navigation par onglets
// ---------------------------------------------------------
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;

    tabButtons.forEach((b) => {
      b.classList.remove('active');
      b.classList.add('text-fonte-muted');
    });
    btn.classList.add('active');
    btn.classList.remove('text-fonte-muted');

    tabPanels.forEach((panel) => panel.classList.remove('active'));
    document.getElementById(`panel-${target}`).classList.add('active');
  });
});

// ---------------------------------------------------------
// 3. Export JSON
// ---------------------------------------------------------
const exportStatus = document.getElementById('donnees-status');

async function exportAllData() {
  exportStatus.textContent = 'Export en cours…';
  const payload = {
    exported_at: new Date().toISOString(),
    version: 1,
    tables: {}
  };

  try {
    for (const table of TABLES) {
      const { data, error } = await supabase.from(table).select('*');
      if (error) throw new Error(`Table "${table}" : ${error.message}`);
      payload.tables[table] = data;
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().slice(0, 10);

    const link = document.createElement('a');
    link.href = url;
    link.download = `fonte-export-${dateStr}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    const total = TABLES.reduce((sum, t) => sum + (payload.tables[t]?.length || 0), 0);
    exportStatus.textContent = `Export réussi : ${total} enregistrement(s) sur ${TABLES.length} tables.`;
  } catch (err) {
    console.error('Erreur export :', err);
    exportStatus.textContent = `Échec de l'export : ${err.message}`;
  }
}

document.getElementById('btn-export').addEventListener('click', exportAllData);

// ---------------------------------------------------------
// 4. Import JSON
// ---------------------------------------------------------
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

async function importAllData(file) {
  exportStatus.textContent = 'Lecture du fichier…';
  try {
    const text = await readFileAsText(file);
    const payload = JSON.parse(text);

    if (!payload || typeof payload.tables !== 'object') {
      throw new Error('Format de fichier invalide : clé "tables" manquante.');
    }

    exportStatus.textContent = 'Import en cours…';
    let totalUpserted = 0;

    // On respecte l'ordre de dépendance (exercices/fetiches avant seances,
    // seances avant series/autres_sports) pour que les clés étrangères existent déjà.
    for (const table of TABLES) {
      const rows = payload.tables[table];
      if (!Array.isArray(rows) || rows.length === 0) continue;

      const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
      if (error) throw new Error(`Table "${table}" : ${error.message}`);
      totalUpserted += rows.length;
    }

    exportStatus.textContent = `Import réussi : ${totalUpserted} enregistrement(s) restauré(s)/mis à jour.`;
  } catch (err) {
    console.error('Erreur import :', err);
    exportStatus.textContent = `Échec de l'import : ${err.message}`;
  }
}

document.getElementById('input-import').addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (file) importAllData(file);
  event.target.value = ''; // permet de réimporter le même fichier deux fois de suite si besoin
});
