// =========================================================
// Fonte — app.js
// Initialisation Supabase + navigation par onglets + export/import JSON
// =========================================================

// ---------------------------------------------------------
// 0. CONFIGURATION — à renseigner avec les identifiants de votre projet Supabase
//    (Project Settings > API dans le dashboard Supabase)
// ---------------------------------------------------------
const SUPABASE_URL = 'https://bwpglzrnpurbsufyrzoz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_7y1e1M0Dcy7B7k89G2eq1w_gegUKKcM';

// Liste des tables gérées par l'application, dans un ORDRE DE DÉPENDANCE
// (une table ne référence que des tables qui la précèdent dans cette liste).
// Cet ordre est utilisé tel quel pour l'export et inversé pour l'import.
const TABLES = ['exercices', 'fetiches', 'seances', 'series', 'autres_sports'];

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
    const { error } = await supabaseClient.from('exercices').select('id').limit(1);
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
// 3. Calendrier
// ---------------------------------------------------------
const JOURS_SEMAINE = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MOIS_NOMS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

// État global exposé (utile pour le module "Séance active" à venir : il pourra
// lire window.appState.selectedDate pour savoir sur quel jour créer une séance).
window.appState = {
  viewMode: 'month',       // 'month' | 'week'
  viewDate: new Date(),    // mois ou semaine actuellement affiché
  selectedDate: new Date() // jour sélectionné, "aujourd'hui" par défaut
};

function toDateKey(date) {
  // Format YYYY-MM-DD en heure locale (évite les décalages liés à toISOString/UTC).
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isSameDay(a, b) {
  return toDateKey(a) === toDateKey(b);
}

function startOfWeek(date) {
  // Semaine démarrant le lundi.
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // 0 = lundi ... 6 = dimanche
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

const calGrid = document.getElementById('cal-grid');
const calPeriodLabel = document.getElementById('cal-period-label');
const calWeekdayLabels = document.getElementById('cal-weekday-labels');
const calViewButtons = document.querySelectorAll('.cal-view-btn');
const daySummaryTitle = document.getElementById('day-summary-title');
const daySummaryContent = document.getElementById('day-summary-content');

function updateViewToggleUI() {
  calViewButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.calView === window.appState.viewMode);
  });
}

function getVisibleRange() {
  // Renvoie la plage de dates (début inclus, fin inclus) réellement affichée
  // dans la grille, qu'on soit en vue mois (avec jours de bordure) ou semaine.
  if (window.appState.viewMode === 'week') {
    const start = startOfWeek(window.appState.viewDate);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { start, end };
  }

  const year = window.appState.viewDate.getFullYear();
  const month = window.appState.viewDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);
  const start = startOfWeek(firstOfMonth);
  const end = new Date(startOfWeek(lastOfMonth));
  end.setDate(end.getDate() + 6);
  return { start, end };
}

async function fetchIndicatorsForRange(start, end) {
  // Renvoie une Map dateKey -> { muscu: bool, autre: bool }
  const map = new Map();
  try {
    const { data, error } = await supabaseClient
      .from('seances')
      .select('date, type')
      .gte('date', toDateKey(start))
      .lte('date', toDateKey(end));

    if (error) throw error;

    (data || []).forEach((row) => {
      const entry = map.get(row.date) || { muscu: false, autre: false };
      if (row.type === 'muscu') entry.muscu = true;
      if (row.type === 'autre') entry.autre = true;
      map.set(row.date, entry);
    });
  } catch (err) {
    console.error('Erreur chargement indicateurs calendrier :', err);
  }
  return map;
}

async function renderCalendar() {
  updateViewToggleUI();

  const { start, end } = getVisibleRange();
  const indicators = await fetchIndicatorsForRange(start, end);

  // Libellé de la période affichée
  if (window.appState.viewMode === 'week') {
    const endLabel = new Date(end);
    calPeriodLabel.textContent = `${start.getDate()} – ${endLabel.getDate()} ${MOIS_NOMS[endLabel.getMonth()]}`;
    calWeekdayLabels.classList.add('hidden');
  } else {
    calPeriodLabel.textContent = `${MOIS_NOMS[window.appState.viewDate.getMonth()]} ${window.appState.viewDate.getFullYear()}`;
    calWeekdayLabels.classList.remove('hidden');
  }

  calGrid.innerHTML = '';
  calGrid.classList.toggle('week-row', window.appState.viewMode === 'week');

  const currentMonth = window.appState.viewDate.getMonth();
  const today = new Date();
  const cursor = new Date(start);

  while (cursor <= end) {
    const dateKey = toDateKey(cursor);
    const dayEntry = indicators.get(dateKey);
    const isOutside = window.appState.viewMode === 'month' && cursor.getMonth() !== currentMonth;

    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cal-day' + (isOutside ? ' outside' : '') + (isSameDay(cursor, today) ? ' today' : '') + (isSameDay(cursor, window.appState.selectedDate) ? ' selected' : '');
    cell.dataset.date = dateKey;

    const num = document.createElement('span');
    num.className = 'cal-day-num font-mono text-sm';
    num.textContent = cursor.getDate();
    cell.appendChild(num);

    if (window.appState.viewMode === 'week') {
      const label = document.createElement('span');
      label.className = 'text-[0.65rem] font-mono text-fonte-muted uppercase';
      label.textContent = JOURS_SEMAINE[(cursor.getDay() + 6) % 7];
      cell.insertBefore(label, num);
    }

    const dots = document.createElement('span');
    dots.className = 'cal-dots';
    if (dayEntry?.muscu) {
      const dot = document.createElement('span');
      dot.className = 'cal-dot cal-dot-muscu';
      dots.appendChild(dot);
    }
    if (dayEntry?.autre) {
      const dot = document.createElement('span');
      dot.className = 'cal-dot cal-dot-autre';
      dots.appendChild(dot);
    }
    cell.appendChild(dots);

    cell.addEventListener('click', () => {
      window.appState.selectedDate = new Date(cursor);
      // Si on clique un jour "hors mois", on recentre la vue sur son mois.
      if (isOutside) {
        window.appState.viewDate = new Date(cursor);
      }
      renderCalendar();
      renderDaySummary();
    });

    calGrid.appendChild(cell);
    cursor.setDate(cursor.getDate() + 1);
  }
}

function formatDayTitle(date) {
  const isToday = isSameDay(date, new Date());
  const jour = JOURS_SEMAINE[(date.getDay() + 6) % 7];
  const label = `${jour} ${date.getDate()} ${MOIS_NOMS[date.getMonth()]}`;
  return isToday ? `Aujourd'hui — ${label}` : label;
}

async function renderDaySummary() {
  const date = window.appState.selectedDate;
  daySummaryTitle.textContent = formatDayTitle(date);
  daySummaryContent.textContent = 'Chargement…';

  const dateKey = toDateKey(date);

  try {
    const { data: seancesJour, error } = await supabaseClient
      .from('seances')
      .select('*')
      .eq('date', dateKey)
      .order('heure_debut', { ascending: true });

    if (error) throw error;

    if (!seancesJour || seancesJour.length === 0) {
      daySummaryContent.textContent = 'Aucune séance enregistrée ce jour.';
      return;
    }

    const muscuIds = seancesJour.filter((s) => s.type === 'muscu').map((s) => s.id);
    const autreIds = seancesJour.filter((s) => s.type === 'autre').map((s) => s.id);

    const lines = [];

    if (muscuIds.length > 0) {
      const { data: series, error: seriesError } = await supabaseClient
        .from('series')
        .select('exercice_id, poids_kg, reps, exercices ( nom )')
        .in('seance_id', muscuIds);
      if (seriesError) throw seriesError;

      const parExercice = new Map();
      (series || []).forEach((s) => {
        const nom = s.exercices?.nom || 'Exercice';
        const count = parExercice.get(nom) || 0;
        parExercice.set(nom, count + 1);
      });

      if (parExercice.size > 0) {
        const detail = Array.from(parExercice.entries())
          .map(([nom, n]) => `${nom} (${n} série${n > 1 ? 's' : ''})`)
          .join(' · ');
        lines.push(`Musculation — ${detail}`);
      } else {
        lines.push('Musculation — séance enregistrée sans série.');
      }
    }

    if (autreIds.length > 0) {
      const { data: autres, error: autresError } = await supabaseClient
        .from('autres_sports')
        .select('nom_sport, duree_minutes, metrique')
        .in('seance_id', autreIds);
      if (autresError) throw autresError;

      (autres || []).forEach((a) => {
        const metrique = a.metrique ? ` — ${a.metrique}` : '';
        lines.push(`${a.nom_sport} — ${a.duree_minutes} min${metrique}`);
      });
    }

    daySummaryContent.innerHTML = lines.map((l) => `<div class="mb-1">${l}</div>`).join('');
  } catch (err) {
    console.error('Erreur chargement du résumé du jour :', err);
    daySummaryContent.textContent = 'Impossible de charger les séances de ce jour.';
  }
}

calViewButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    window.appState.viewMode = btn.dataset.calView;
    renderCalendar();
  });
});

document.getElementById('cal-prev').addEventListener('click', () => {
  const d = window.appState.viewDate;
  if (window.appState.viewMode === 'week') {
    d.setDate(d.getDate() - 7);
  } else {
    d.setMonth(d.getMonth() - 1);
  }
  window.appState.viewDate = new Date(d);
  renderCalendar();
});

document.getElementById('cal-next').addEventListener('click', () => {
  const d = window.appState.viewDate;
  if (window.appState.viewMode === 'week') {
    d.setDate(d.getDate() + 7);
  } else {
    d.setMonth(d.getMonth() + 1);
  }
  window.appState.viewDate = new Date(d);
  renderCalendar();
});

document.getElementById('btn-add-seance').addEventListener('click', () => {
  // Le module de saisie détaillé arrive dans un prochain prompt. En attendant,
  // on bascule sur l'onglet "Séance active" avec le jour sélectionné en contexte.
  document.querySelector('.tab-btn[data-tab="seance"]').click();
});

renderCalendar();
renderDaySummary();

// ---------------------------------------------------------
// 4. Export JSON
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
      const { data, error } = await supabaseClient.from(table).select('*');
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
// 5. Import JSON
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

      const { error } = await supabaseClient.from(table).upsert(rows, { onConflict: 'id' });
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
