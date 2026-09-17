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
// 4. Séance de musculation (saisie d'une séance)
// ---------------------------------------------------------
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function makeLocalId() {
  return 'local_' + Math.random().toString(36).slice(2, 10);
}

function defaultSeriesSet() {
  return [
    { localId: makeLocalId(), id: null, type: 'standard', poids_kg: 0, reps: 0 },
    { localId: makeLocalId(), id: null, type: 'standard', poids_kg: 0, reps: 0 },
    { localId: makeLocalId(), id: null, type: 'standard', poids_kg: 0, reps: 0 },
    { localId: makeLocalId(), id: null, type: 'echec', poids_kg: 0, reps: 0 }
  ];
}

// État de la séance en cours de saisie (en mémoire jusqu'à l'enregistrement).
let currentSeance = null;
let timerInterval = null;
let timerStartRef = null;

const seanceDateLabel = document.getElementById('seance-date-label');
const btnTimerStart = document.getElementById('btn-timer-start');
const btnTimerStop = document.getElementById('btn-timer-stop');
const timerElapsed = document.getElementById('timer-elapsed');
const manualDurationInput = document.getElementById('input-manual-duration');
const btnSaveUpdates = document.getElementById('btn-save-updates');
const exoSearchInput = document.getElementById('exo-search-input');
const exoSearchResults = document.getElementById('exo-search-results');
const seanceExosList = document.getElementById('seance-exercices-list');
const seanceEmptyHint = document.getElementById('seance-empty-hint');
const seanceSaveStatus = document.getElementById('seance-save-status');

// --- Chrono ---
function resetTimerUI() {
  clearInterval(timerInterval);
  timerInterval = null;
  timerElapsed.textContent = '';
  btnTimerStart.disabled = false;
  btnTimerStop.disabled = false;
  manualDurationInput.disabled = false;
  manualDurationInput.value = '';
  btnSaveUpdates.classList.add('hidden');
}

function updateElapsedDisplay() {
  const totalSec = Math.max(0, Math.floor((Date.now() - timerStartRef.getTime()) / 1000));
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  timerElapsed.textContent = `${mm}:${ss}`;
}

btnTimerStart.addEventListener('click', () => {
  currentSeance.heure_debut = new Date().toISOString();
  currentSeance.heure_fin = null;
  timerStartRef = new Date(currentSeance.heure_debut);
  clearInterval(timerInterval);
  timerInterval = setInterval(updateElapsedDisplay, 1000);
  updateElapsedDisplay();
  btnTimerStart.disabled = true;
  manualDurationInput.disabled = true;
  manualDurationInput.value = '';
});

btnTimerStop.addEventListener('click', async () => {
  if (currentSeance.heure_debut) {
    const now = new Date();
    currentSeance.heure_fin = now.toISOString();
    currentSeance.duree_minutes = Math.round((now.getTime() - new Date(currentSeance.heure_debut).getTime()) / 60000);
  } else {
    const manual = parseInt(manualDurationInput.value, 10);
    if (!manual || manual <= 0) {
      seanceSaveStatus.textContent = 'Indiquez une durée manuelle ou démarrez le chrono avant de terminer.';
      return;
    }
    currentSeance.duree_minutes = manual;
  }
  clearInterval(timerInterval);
  btnTimerStart.disabled = true;
  btnTimerStop.disabled = true;
  manualDurationInput.disabled = true;
  await saveSeance();
});

btnSaveUpdates.addEventListener('click', () => saveSeance());

// --- Recherche / création d'exercice ---
let searchDebounceTimer = null;

exoSearchInput.addEventListener('input', () => {
  clearTimeout(searchDebounceTimer);
  const query = exoSearchInput.value.trim();
  if (!query) {
    hideSearchResults();
    return;
  }
  searchDebounceTimer = setTimeout(() => runExerciseSearch(query), 250);
});

document.addEventListener('click', (event) => {
  if (!exoSearchResults.contains(event.target) && event.target !== exoSearchInput) {
    hideSearchResults();
  }
});

function hideSearchResults() {
  exoSearchResults.classList.add('hidden');
  exoSearchResults.innerHTML = '';
}

async function runExerciseSearch(query) {
  try {
    const { data, error } = await supabaseClient
      .from('exercices')
      .select('*')
      .ilike('nom', `%${query}%`)
      .order('nom')
      .limit(8);
    if (error) throw error;
    renderSearchResults(query, data || []);
  } catch (err) {
    console.error('Erreur recherche exercice :', err);
  }
}

function renderSearchResults(query, matches) {
  exoSearchResults.innerHTML = '';

  matches.forEach((exo) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'w-full text-left px-4 py-2.5 text-sm hover:bg-fonte-panel border-b border-fonte-border last:border-b-0 flex items-center justify-between';
    item.innerHTML = `<span>${escapeHtml(exo.nom)}</span><span class="text-xs font-mono text-fonte-muted">${exo.unite_charge === 'par_cote' ? 'par côté' : 'total'}</span>`;
    item.addEventListener('click', () => {
      addExerciseToSession(exo);
      exoSearchInput.value = '';
      hideSearchResults();
    });
    exoSearchResults.appendChild(item);
  });

  const exactMatch = matches.some((e) => e.nom.trim().toLowerCase() === query.trim().toLowerCase());
  if (!exactMatch && query.trim().length > 0) {
    const createWrap = document.createElement('div');
    createWrap.className = 'p-3 border-t border-fonte-border';
    createWrap.innerHTML = `
      <p class="text-xs font-mono text-fonte-muted mb-2">Créer « ${escapeHtml(query.trim())} » comme nouvel exercice :</p>
      <div class="flex items-center gap-4 mb-2 text-xs font-mono">
        <label class="flex items-center gap-1.5"><input type="radio" name="new-exo-unit" value="total" checked class="accent-fonte-amber"> Poids total</label>
        <label class="flex items-center gap-1.5"><input type="radio" name="new-exo-unit" value="par_cote" class="accent-fonte-amber"> Par côté</label>
      </div>
      <button type="button" data-role="confirm-create"
        class="font-display uppercase tracking-wide text-xs px-3 py-1.5 bg-fonte-amber text-fonte-bg font-medium hover:bg-fonte-amberDark transition-colors">
        Créer et ajouter
      </button>
    `;
    createWrap.querySelector('[data-role="confirm-create"]').addEventListener('click', () => {
      const unit = createWrap.querySelector('input[name="new-exo-unit"]:checked').value;
      createExerciseAndAdd(query.trim(), unit);
    });
    exoSearchResults.appendChild(createWrap);
  }

  exoSearchResults.classList.remove('hidden');
}

async function createExerciseAndAdd(nom, uniteCharge) {
  try {
    const { data, error } = await supabaseClient
      .from('exercices')
      .insert({ nom, unite_charge: uniteCharge })
      .select()
      .single();
    if (error) throw error;
    addExerciseToSession(data);
    exoSearchInput.value = '';
    hideSearchResults();
  } catch (err) {
    console.error('Erreur création exercice :', err);
    if (err.code === '23505') {
      seanceSaveStatus.textContent = `Un exercice nommé « ${nom} » existe déjà : recherchez-le plutôt que de le recréer.`;
    } else {
      seanceSaveStatus.textContent = "Échec de la création de l'exercice (voir console).";
    }
  }
}

function addExerciseToSession(exo) {
  const already = currentSeance.exercices.find((e) => e.exercice_id === exo.id);
  if (already) {
    seanceSaveStatus.textContent = `« ${exo.nom} » est déjà dans cette séance.`;
    return;
  }
  currentSeance.exercices.push({
    exercice_id: exo.id,
    nom: exo.nom,
    unite_charge: exo.unite_charge,
    series: defaultSeriesSet()
  });
  renderExercicesList();
}

// --- Historique (3 dernières séances sur un exercice) ---
async function loadHistory(exerciceId, panelEl) {
  panelEl.textContent = 'Chargement…';
  try {
    const { data: rows, error } = await supabaseClient
      .from('series')
      .select('seance_id, poids_kg, reps, type, seances ( date )')
      .eq('exercice_id', exerciceId);
    if (error) throw error;

    const bySeance = new Map();
    (rows || []).forEach((r) => {
      const date = r.seances?.date;
      if (!date) return;
      if (!bySeance.has(r.seance_id)) bySeance.set(r.seance_id, { date, series: [] });
      bySeance.get(r.seance_id).series.push({ poids_kg: r.poids_kg, reps: r.reps, type: r.type });
    });

    const last3 = Array.from(bySeance.values())
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 3);

    if (last3.length === 0) {
      panelEl.textContent = 'Aucun historique pour cet exercice.';
      return;
    }

    panelEl.innerHTML = last3
      .map((s) => {
        const detail = s.series
          .map((se) => `${se.poids_kg}kg×${se.reps}${se.type === 'echec' ? ' (échec)' : ''}`)
          .join(' · ');
        return `<div class="mb-1"><span class="text-fonte-text">${s.date}</span> — ${detail}</div>`;
      })
      .join('');
  } catch (err) {
    console.error('Erreur historique exercice :', err);
    panelEl.textContent = "Erreur de chargement de l'historique.";
  }
}

// --- Rendu de la liste d'exercices / séries ---
function renderExercicesList() {
  seanceExosList.innerHTML = '';
  if (!currentSeance.exercices.length) {
    seanceExosList.appendChild(seanceEmptyHint);
    return;
  }
  currentSeance.exercices.forEach((exo) => {
    seanceExosList.appendChild(buildExerciceBlock(exo));
  });
}

function buildSerieRow(exo, serie, refreshRows) {
  const row = document.createElement('div');
  row.className = 'flex items-center gap-2';

  const badge = document.createElement('span');
  badge.className = 'text-[0.65rem] font-mono uppercase w-12 ' + (serie.type === 'echec' ? 'text-fonte-amber' : 'text-fonte-muted');
  badge.textContent = serie.type === 'echec' ? 'Échec' : 'Std';
  row.appendChild(badge);

  const poidsInput = document.createElement('input');
  poidsInput.type = 'number';
  poidsInput.min = '0';
  poidsInput.step = '0.5';
  poidsInput.value = serie.poids_kg;
  poidsInput.className = 'w-20 bg-fonte-panel2 border border-fonte-border text-sm font-mono px-2 py-1 focus:outline-none focus:border-fonte-amber';
  poidsInput.addEventListener('input', () => { serie.poids_kg = parseFloat(poidsInput.value) || 0; });
  row.appendChild(poidsInput);

  const kgLabel = document.createElement('span');
  kgLabel.className = 'text-xs font-mono text-fonte-muted';
  kgLabel.textContent = 'kg';
  row.appendChild(kgLabel);

  const repsInput = document.createElement('input');
  repsInput.type = 'number';
  repsInput.min = '0';
  repsInput.value = serie.reps;
  repsInput.className = 'w-16 bg-fonte-panel2 border border-fonte-border text-sm font-mono px-2 py-1 focus:outline-none focus:border-fonte-amber';
  repsInput.addEventListener('input', () => { serie.reps = parseInt(repsInput.value, 10) || 0; });
  row.appendChild(repsInput);

  const repsLabel = document.createElement('span');
  repsLabel.className = 'text-xs font-mono text-fonte-muted';
  repsLabel.textContent = 'reps';
  row.appendChild(repsLabel);

  const btnRemove = document.createElement('button');
  btnRemove.type = 'button';
  btnRemove.className = 'ml-auto text-fonte-muted hover:text-fonte-amber transition-colors text-lg leading-none';
  btnRemove.setAttribute('aria-label', 'Supprimer la série');
  btnRemove.textContent = '×';
  btnRemove.addEventListener('click', () => {
    exo.series = exo.series.filter((s) => s !== serie);
    refreshRows();
  });
  row.appendChild(btnRemove);

  return row;
}

function buildExerciceBlock(exo) {
  const wrap = document.createElement('div');
  wrap.className = 'bg-fonte-panel border border-fonte-border p-4';

  const header = document.createElement('div');
  header.className = 'flex items-center justify-between mb-3 gap-2';
  header.innerHTML = `
    <div>
      <h3 class="font-display text-base uppercase tracking-wide">${escapeHtml(exo.nom)}</h3>
      <span class="text-xs font-mono text-fonte-muted">${exo.unite_charge === 'par_cote' ? 'Charge par côté' : 'Charge totale'}</span>
    </div>
  `;

  const btnGroup = document.createElement('div');
  btnGroup.className = 'flex items-center gap-2 shrink-0';

  const btnHistory = document.createElement('button');
  btnHistory.type = 'button';
  btnHistory.className = 'font-mono text-xs px-3 py-1.5 border border-fonte-border hover:border-fonte-amber transition-colors';
  btnHistory.textContent = 'Historique';

  const btnRemoveExo = document.createElement('button');
  btnRemoveExo.type = 'button';
  btnRemoveExo.className = 'font-mono text-xs px-3 py-1.5 border border-fonte-border text-fonte-muted hover:text-fonte-amber hover:border-fonte-amber transition-colors';
  btnRemoveExo.textContent = 'Retirer';

  btnGroup.appendChild(btnHistory);
  btnGroup.appendChild(btnRemoveExo);
  header.appendChild(btnGroup);
  wrap.appendChild(header);

  const historyPanel = document.createElement('div');
  historyPanel.className = 'hidden bg-fonte-panel2 border border-fonte-border p-3 mb-3 text-xs font-mono text-fonte-muted';
  wrap.appendChild(historyPanel);

  const rowsContainer = document.createElement('div');
  rowsContainer.className = 'space-y-1.5 mb-3';
  wrap.appendChild(rowsContainer);

  function refreshRows() {
    rowsContainer.innerHTML = '';
    exo.series.forEach((serie) => rowsContainer.appendChild(buildSerieRow(exo, serie, refreshRows)));
  }
  refreshRows();

  const btnRow = document.createElement('div');
  btnRow.className = 'flex gap-2';

  const btnAddSerie = document.createElement('button');
  btnAddSerie.type = 'button';
  btnAddSerie.className = 'font-mono text-xs px-3 py-1.5 border border-fonte-border hover:border-fonte-amber transition-colors';
  btnAddSerie.textContent = '+ Série';
  btnAddSerie.addEventListener('click', () => {
    exo.series.push({ localId: makeLocalId(), id: null, type: 'standard', poids_kg: 0, reps: 0 });
    refreshRows();
  });

  const btnAddEchec = document.createElement('button');
  btnAddEchec.type = 'button';
  btnAddEchec.className = 'font-mono text-xs px-3 py-1.5 border border-fonte-border hover:border-fonte-amber transition-colors';
  btnAddEchec.textContent = "+ Série à l'échec";
  btnAddEchec.addEventListener('click', () => {
    exo.series.push({ localId: makeLocalId(), id: null, type: 'echec', poids_kg: 0, reps: 0 });
    refreshRows();
  });

  btnRow.appendChild(btnAddSerie);
  btnRow.appendChild(btnAddEchec);
  wrap.appendChild(btnRow);

  btnHistory.addEventListener('click', async () => {
    const isHidden = historyPanel.classList.contains('hidden');
    historyPanel.classList.toggle('hidden');
    if (isHidden) await loadHistory(exo.exercice_id, historyPanel);
  });

  btnRemoveExo.addEventListener('click', () => {
    currentSeance.exercices = currentSeance.exercices.filter((e) => e !== exo);
    renderExercicesList();
  });

  return wrap;
}

// --- Chargement d'une séance existante pour le jour sélectionné ---
async function loadExistingSeries(seanceId) {
  const { data: series, error } = await supabaseClient
    .from('series')
    .select('*, exercices ( id, nom, unite_charge )')
    .eq('seance_id', seanceId)
    .order('ordre', { ascending: true });
  if (error) {
    console.error('Erreur chargement des séries existantes :', error);
    return;
  }

  const byExercice = new Map();
  (series || []).forEach((s) => {
    const exo = s.exercices;
    if (!exo) return;
    if (!byExercice.has(exo.id)) {
      byExercice.set(exo.id, { exercice_id: exo.id, nom: exo.nom, unite_charge: exo.unite_charge, series: [] });
    }
    byExercice.get(exo.id).series.push({
      localId: makeLocalId(), id: s.id, type: s.type, poids_kg: Number(s.poids_kg), reps: s.reps
    });
  });
  currentSeance.exercices = Array.from(byExercice.values());
}

async function initSeanceView() {
  resetTimerUI();
  seanceSaveStatus.textContent = '';
  const date = window.appState.selectedDate;
  const dateKey = toDateKey(date);
  seanceDateLabel.textContent = `Séance du ${formatDayTitle(date)}`;

  try {
    const { data: existing, error } = await supabaseClient
      .from('seances')
      .select('*')
      .eq('date', dateKey)
      .eq('type', 'muscu')
      .maybeSingle();
    if (error) throw error;

    if (existing) {
      currentSeance = {
        id: existing.id,
        date: dateKey,
        heure_debut: existing.heure_debut,
        heure_fin: existing.heure_fin,
        duree_minutes: existing.duree_minutes,
        exercices: []
      };
      await loadExistingSeries(existing.id);
      // Une séance déjà enregistrée est considérée comme terminée : le chrono
      // ne se relance pas, mais les séries restent modifiables et ré-enregistrables.
      btnTimerStart.disabled = true;
      btnTimerStop.disabled = true;
      manualDurationInput.disabled = true;
      timerElapsed.textContent = existing.duree_minutes ? `${existing.duree_minutes} min (enregistrée)` : 'Enregistrée';
      btnSaveUpdates.classList.remove('hidden');
    } else {
      currentSeance = { id: null, date: dateKey, heure_debut: null, heure_fin: null, duree_minutes: null, exercices: [] };
    }
  } catch (err) {
    console.error('Erreur chargement séance existante :', err);
    currentSeance = { id: null, date: dateKey, heure_debut: null, heure_fin: null, duree_minutes: null, exercices: [] };
  }

  renderExercicesList();
}

// --- Sauvegarde (appelée à la fin de la séance, ou depuis "Enregistrer les modifications") ---
async function saveSeance() {
  seanceSaveStatus.textContent = 'Enregistrement…';
  try {
    const payload = {
      date: currentSeance.date,
      type: 'muscu',
      heure_debut: currentSeance.heure_debut,
      heure_fin: currentSeance.heure_fin,
      duree_minutes: currentSeance.duree_minutes
    };

    let seanceId = currentSeance.id;
    if (seanceId) {
      const { error } = await supabaseClient.from('seances').update(payload).eq('id', seanceId);
      if (error) throw error;
    } else {
      const { data, error } = await supabaseClient.from('seances').insert(payload).select().single();
      if (error) throw error;
      seanceId = data.id;
      currentSeance.id = seanceId;
    }

    // Stratégie simple et robuste : on remplace entièrement les séries de cette
    // séance plutôt que de tenter un diff ligne à ligne avec la base.
    const { error: deleteError } = await supabaseClient.from('series').delete().eq('seance_id', seanceId);
    if (deleteError) throw deleteError;

    const rowsToInsert = [];
    currentSeance.exercices.forEach((exo) => {
      exo.series.forEach((s, index) => {
        rowsToInsert.push({
          seance_id: seanceId,
          exercice_id: exo.exercice_id,
          type: s.type,
          poids_kg: s.poids_kg,
          reps: s.reps,
          ordre: index
        });
      });
    });

    if (rowsToInsert.length > 0) {
      const { error: insertError } = await supabaseClient.from('series').insert(rowsToInsert);
      if (insertError) throw insertError;
    }

    seanceSaveStatus.textContent = `Séance enregistrée (${rowsToInsert.length} série(s) sur ${currentSeance.exercices.length} exercice(s)).`;
    btnSaveUpdates.classList.remove('hidden');
    manualDurationInput.disabled = true;
    // Les badges et le résumé du calendrier doivent refléter la nouvelle séance.
    renderCalendar();
    renderDaySummary();
  } catch (err) {
    console.error('Erreur sauvegarde séance :', err);
    seanceSaveStatus.textContent = "Échec de l'enregistrement (voir console).";
  }
}

document.querySelector('.tab-btn[data-tab="seance"]').addEventListener('click', () => {
  initSeanceView();
});

// ---------------------------------------------------------
// 5. Export JSON
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
// 6. Import JSON
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
