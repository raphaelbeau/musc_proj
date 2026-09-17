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
    const dayDate = new Date(cursor); // valeur figée pour cette itération, utilisée dans la closure du clic
    const dateKey = toDateKey(dayDate);
    const dayEntry = indicators.get(dateKey);
    const isOutside = window.appState.viewMode === 'month' && dayDate.getMonth() !== currentMonth;

    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cal-day' + (isOutside ? ' outside' : '') + (isSameDay(dayDate, today) ? ' today' : '') + (isSameDay(dayDate, window.appState.selectedDate) ? ' selected' : '');
    cell.dataset.date = dateKey;

    const num = document.createElement('span');
    num.className = 'cal-day-num font-mono text-sm';
    num.textContent = dayDate.getDate();
    cell.appendChild(num);

    if (window.appState.viewMode === 'week') {
      const label = document.createElement('span');
      label.className = 'text-[0.65rem] font-mono text-fonte-muted uppercase';
      label.textContent = JOURS_SEMAINE[(dayDate.getDay() + 6) % 7];
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
      window.appState.selectedDate = dayDate;
      // Si on clique un jour "hors mois", on recentre la vue sur son mois.
      if (isOutside) {
        window.appState.viewDate = new Date(dayDate);
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
const seanceListBar = document.getElementById('seance-list-bar');
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

  const actionsWrap = document.createElement('div');
  actionsWrap.className = 'ml-auto flex items-center gap-1.5';

  const btnRest = document.createElement('button');
  btnRest.type = 'button';
  btnRest.className = 'font-mono text-xs px-2 py-1 border border-fonte-border text-fonte-muted hover:text-fonte-amber hover:border-fonte-amber transition-colors';
  btnRest.title = 'Lancer le timer de repos';
  btnRest.textContent = '⏱';
  btnRest.addEventListener('click', () => {
    startRestTimer(currentSeance.reposDefaultSecondes || 90);
  });
  actionsWrap.appendChild(btnRest);

  const btnRemove = document.createElement('button');
  btnRemove.type = 'button';
  btnRemove.className = 'text-fonte-muted hover:text-fonte-amber transition-colors text-lg leading-none';
  btnRemove.setAttribute('aria-label', 'Supprimer la série');
  btnRemove.textContent = '×';
  btnRemove.addEventListener('click', () => {
    exo.series = exo.series.filter((s) => s !== serie);
    refreshRows();
  });
  actionsWrap.appendChild(btnRemove);
  row.appendChild(actionsWrap);

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

// --- Gestion de plusieurs séances de muscu possibles sur un même jour ---
let currentDateKey = null;
let seancesOfDay = [];

function seanceChipLabel(seance, index) {
  if (seance.heure_debut) {
    const t = new Date(seance.heure_debut);
    const hh = String(t.getHours()).padStart(2, '0');
    const mm = String(t.getMinutes()).padStart(2, '0');
    return `${hh}:${mm} · ${seance.duree_minutes ?? '?'} min`;
  }
  return `Séance ${index + 1} · ${seance.duree_minutes ?? '?'} min`;
}

function renderSeanceListBar() {
  seanceListBar.innerHTML = '';

  seancesOfDay.forEach((s, index) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    const isActive = currentSeance && currentSeance.id === s.id;
    chip.className = 'font-mono text-xs px-3 py-1.5 border transition-colors ' +
      (isActive ? 'border-fonte-amber text-fonte-amber' : 'border-fonte-border text-fonte-muted hover:border-fonte-amber');
    chip.textContent = seanceChipLabel(s, index);
    chip.addEventListener('click', () => loadSeanceById(s.id));
    seanceListBar.appendChild(chip);
  });

  const btnNew = document.createElement('button');
  btnNew.type = 'button';
  const isNewActive = currentSeance && currentSeance.id === null;
  btnNew.className = 'font-mono text-xs px-3 py-1.5 border transition-colors ' +
    (isNewActive
      ? 'border-fonte-amber bg-fonte-amber text-fonte-bg font-medium'
      : 'border-fonte-border text-fonte-text hover:border-fonte-amber');
  btnNew.textContent = '+ Nouvelle séance';
  btnNew.addEventListener('click', () => startNewSeance());
  seanceListBar.appendChild(btnNew);
}

async function refreshSeancesOfDay() {
  try {
    const { data, error } = await supabaseClient
      .from('seances')
      .select('*')
      .eq('date', currentDateKey)
      .eq('type', 'muscu')
      .order('heure_debut', { ascending: true });
    if (error) throw error;
    seancesOfDay = data || [];
  } catch (err) {
    console.error('Erreur chargement des séances du jour :', err);
    seancesOfDay = [];
  }
  renderSeanceListBar();
}

function startNewSeance() {
  currentSeance = { id: null, date: currentDateKey, heure_debut: null, heure_fin: null, duree_minutes: null, exercices: [], reposDefaultSecondes: 90 };
  resetTimerUI();
  seanceSaveStatus.textContent = '';
  updateSeanceReposLabel();
  renderExercicesList();
  renderSeanceListBar();
  maybeAutoLoadFetiche();
}

async function loadSeanceById(seanceId) {
  const existing = seancesOfDay.find((s) => s.id === seanceId);
  if (!existing) return;

  resetTimerUI();
  seanceSaveStatus.textContent = '';
  currentSeance = {
    id: existing.id,
    date: currentDateKey,
    heure_debut: existing.heure_debut,
    heure_fin: existing.heure_fin,
    duree_minutes: existing.duree_minutes,
    exercices: [],
    reposDefaultSecondes: 90
  };
  await loadExistingSeries(existing.id);
  updateSeanceReposLabel();

  // Une séance déjà enregistrée est considérée comme terminée : le chrono
  // ne se relance pas, mais les séries restent modifiables et ré-enregistrables.
  btnTimerStart.disabled = true;
  btnTimerStop.disabled = true;
  manualDurationInput.disabled = true;
  timerElapsed.textContent = existing.duree_minutes ? `${existing.duree_minutes} min (enregistrée)` : 'Enregistrée';
  btnSaveUpdates.classList.remove('hidden');

  renderExercicesList();
  renderSeanceListBar();
}

async function initSeanceView() {
  const date = window.appState.selectedDate;
  currentDateKey = toDateKey(date);
  seanceDateLabel.textContent = `Séance du ${formatDayTitle(date)}`;

  await refreshSeancesOfDay();
  // On repart toujours sur une séance neuve en arrivant sur l'onglet : les séances
  // déjà enregistrées restent accessibles via les puces ci-dessus, sans bloquer
  // la possibilité d'en démarrer une nouvelle le même jour.
  startNewSeance();
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
    // Les badges, le résumé du calendrier et la liste des séances du jour doivent
    // refléter cette sauvegarde (nouvelle séance ou mise à jour d'une existante).
    renderCalendar();
    renderDaySummary();
    await refreshSeancesOfDay();
  } catch (err) {
    console.error('Erreur sauvegarde séance :', err);
    seanceSaveStatus.textContent = "Échec de l'enregistrement (voir console).";
  }
}

document.querySelector('.tab-btn[data-tab="seance"]').addEventListener('click', () => {
  initSeanceView();
});

// ---------------------------------------------------------
// 5. Séances fétiches (modèles de séances)
// ---------------------------------------------------------
const WEEKDAY_KEYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']; // indexé sur Date.getDay()
const JOUR_LABELS = {
  Monday: 'Lundi', Tuesday: 'Mardi', Wednesday: 'Mercredi', Thursday: 'Jeudi',
  Friday: 'Vendredi', Saturday: 'Samedi', Sunday: 'Dimanche'
};

function weekdayKeyForDate(date) {
  return WEEKDAY_KEYS[date.getDay()];
}

let fetichesCache = [];
let exercicesLookup = new Map(); // id -> { id, nom, unite_charge }, alimenté à la demande
let editingFeticheId = null;
let modalFeticheExos = []; // [{ id, nom, unite_charge }], dans l'ordre choisi

const fetichesListEl = document.getElementById('fetiches-list');
const fetichesEmptyHint = document.getElementById('fetiches-empty-hint');
const feticheModal = document.getElementById('fetiche-modal');
const feticheModalTitle = document.getElementById('fetiche-modal-title');
const feticheModalNom = document.getElementById('fetiche-modal-nom');
const feticheModalRepos = document.getElementById('fetiche-modal-repos');
const feticheModalJour = document.getElementById('fetiche-modal-jour');
const feticheExoSearchInput = document.getElementById('fetiche-exo-search-input');
const feticheExoSearchResults = document.getElementById('fetiche-exo-search-results');
const feticheModalExosList = document.getElementById('fetiche-modal-exos-list');
const feticheModalExosEmpty = document.getElementById('fetiche-modal-exos-empty');
const feticheModalStatus = document.getElementById('fetiche-modal-status');
const btnDeleteFetiche = document.getElementById('btn-delete-fetiche');
const feticheQuickSelect = document.getElementById('fetiche-quick-select');
const btnLoadFetiche = document.getElementById('btn-load-fetiche');
const seanceReposLabel = document.getElementById('seance-repos-label');

async function ensureExercicesLookup(ids) {
  const missing = [...new Set(ids)].filter((id) => id && !exercicesLookup.has(id));
  if (missing.length === 0) return;
  try {
    const { data, error } = await supabaseClient.from('exercices').select('*').in('id', missing);
    if (error) throw error;
    (data || []).forEach((exo) => exercicesLookup.set(exo.id, exo));
  } catch (err) {
    console.error('Erreur résolution des exercices :', err);
  }
}

async function loadFetichesCache() {
  try {
    const { data, error } = await supabaseClient.from('fetiches').select('*').order('nom');
    if (error) throw error;
    fetichesCache = data || [];
    const allIds = fetichesCache.flatMap((f) => f.exercices_ids_json || []);
    await ensureExercicesLookup(allIds);
  } catch (err) {
    console.error('Erreur chargement des fétiches :', err);
    fetichesCache = [];
  }
  renderFetichesList();
  renderFeticheQuickSelect();
}

function renderFeticheQuickSelect() {
  const previousValue = feticheQuickSelect.value;
  feticheQuickSelect.innerHTML = '<option value="">Charger une fétiche…</option>';
  fetichesCache.forEach((f) => {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.nom;
    feticheQuickSelect.appendChild(opt);
  });
  feticheQuickSelect.value = fetichesCache.some((f) => f.id === previousValue) ? previousValue : '';
}

function updateSeanceReposLabel() {
  seanceReposLabel.textContent = `Repos par défaut : ${currentSeance?.reposDefaultSecondes ?? 90}s`;
}

function renderFetichesList() {
  fetichesListEl.innerHTML = '';
  if (fetichesCache.length === 0) {
    fetichesListEl.appendChild(fetichesEmptyHint);
    return;
  }

  fetichesCache.forEach((f) => {
    const ids = f.exercices_ids_json || [];
    const noms = ids.map((id) => exercicesLookup.get(id)?.nom || '?');
    const jourLabel = f.jour_defaut ? JOUR_LABELS[f.jour_defaut] : 'Aucun jour par défaut';

    const card = document.createElement('div');
    card.className = 'bg-fonte-panel border border-fonte-border p-4';
    card.innerHTML = `
      <div class="flex items-start justify-between gap-3 mb-2">
        <div>
          <h3 class="font-display text-base uppercase tracking-wide">${escapeHtml(f.nom)}</h3>
          <p class="text-xs font-mono text-fonte-muted mt-1">${jourLabel} · repos ${f.repos_default_secondes ?? '—'}s · ${ids.length} exercice(s)</p>
        </div>
        <div class="flex gap-2 shrink-0">
          <button type="button" data-role="edit" class="font-mono text-xs px-3 py-1.5 border border-fonte-border hover:border-fonte-amber transition-colors">Modifier</button>
          <button type="button" data-role="delete" class="font-mono text-xs px-3 py-1.5 border border-fonte-border text-fonte-muted hover:text-fonte-amber hover:border-fonte-amber transition-colors">Supprimer</button>
        </div>
      </div>
      <p class="text-xs font-mono text-fonte-muted">${noms.length ? escapeHtml(noms.join(' · ')) : 'Aucun exercice dans ce modèle.'}</p>
    `;
    card.querySelector('[data-role="edit"]').addEventListener('click', () => openFeticheModal(f));
    card.querySelector('[data-role="delete"]').addEventListener('click', () => deleteFetiche(f));
    fetichesListEl.appendChild(card);
  });
}

// --- Modale de création / édition ---
function renderFeticheModalExosList() {
  feticheModalExosList.innerHTML = '';
  if (modalFeticheExos.length === 0) {
    feticheModalExosList.appendChild(feticheModalExosEmpty);
    return;
  }

  modalFeticheExos.forEach((exo, index) => {
    const row = document.createElement('div');
    row.className = 'flex items-center gap-2 bg-fonte-panel2 border border-fonte-border px-3 py-1.5';

    const label = document.createElement('span');
    label.className = 'text-sm flex-1';
    label.textContent = exo.nom;
    row.appendChild(label);

    const unitTag = document.createElement('span');
    unitTag.className = 'text-xs font-mono text-fonte-muted';
    unitTag.textContent = exo.unite_charge === 'par_cote' ? 'par côté' : 'total';
    row.appendChild(unitTag);

    const btnUp = document.createElement('button');
    btnUp.type = 'button';
    btnUp.className = 'text-fonte-muted hover:text-fonte-amber transition-colors disabled:opacity-30 disabled:cursor-not-allowed px-1';
    btnUp.textContent = '↑';
    btnUp.disabled = index === 0;
    btnUp.addEventListener('click', () => {
      [modalFeticheExos[index - 1], modalFeticheExos[index]] = [modalFeticheExos[index], modalFeticheExos[index - 1]];
      renderFeticheModalExosList();
    });
    row.appendChild(btnUp);

    const btnDown = document.createElement('button');
    btnDown.type = 'button';
    btnDown.className = 'text-fonte-muted hover:text-fonte-amber transition-colors disabled:opacity-30 disabled:cursor-not-allowed px-1';
    btnDown.textContent = '↓';
    btnDown.disabled = index === modalFeticheExos.length - 1;
    btnDown.addEventListener('click', () => {
      [modalFeticheExos[index + 1], modalFeticheExos[index]] = [modalFeticheExos[index], modalFeticheExos[index + 1]];
      renderFeticheModalExosList();
    });
    row.appendChild(btnDown);

    const btnRemove = document.createElement('button');
    btnRemove.type = 'button';
    btnRemove.className = 'text-fonte-muted hover:text-fonte-amber transition-colors text-lg leading-none px-1';
    btnRemove.textContent = '×';
    btnRemove.addEventListener('click', () => {
      modalFeticheExos.splice(index, 1);
      renderFeticheModalExosList();
    });
    row.appendChild(btnRemove);

    feticheModalExosList.appendChild(row);
  });
}

function hideFeticheSearchResults() {
  feticheExoSearchResults.classList.add('hidden');
  feticheExoSearchResults.innerHTML = '';
}

let feticheSearchDebounce = null;
feticheExoSearchInput.addEventListener('input', () => {
  clearTimeout(feticheSearchDebounce);
  const query = feticheExoSearchInput.value.trim();
  if (!query) {
    hideFeticheSearchResults();
    return;
  }
  feticheSearchDebounce = setTimeout(() => runFeticheExoSearch(query), 250);
});

document.addEventListener('click', (event) => {
  if (!feticheExoSearchResults.contains(event.target) && event.target !== feticheExoSearchInput) {
    hideFeticheSearchResults();
  }
});

async function runFeticheExoSearch(query) {
  try {
    const { data, error } = await supabaseClient
      .from('exercices')
      .select('*')
      .ilike('nom', `%${query}%`)
      .order('nom')
      .limit(8);
    if (error) throw error;
    renderFeticheExoSearchResults(query, data || []);
  } catch (err) {
    console.error('Erreur recherche exercice (fétiche) :', err);
  }
}

function renderFeticheExoSearchResults(query, matches) {
  feticheExoSearchResults.innerHTML = '';

  matches.forEach((exo) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'w-full text-left px-3 py-2 text-sm hover:bg-fonte-panel border-b border-fonte-border last:border-b-0 flex items-center justify-between';
    item.innerHTML = `<span>${escapeHtml(exo.nom)}</span><span class="text-xs font-mono text-fonte-muted">${exo.unite_charge === 'par_cote' ? 'par côté' : 'total'}</span>`;
    item.addEventListener('click', () => {
      addExoToFeticheModal(exo);
      feticheExoSearchInput.value = '';
      hideFeticheSearchResults();
    });
    feticheExoSearchResults.appendChild(item);
  });

  const exactMatch = matches.some((e) => e.nom.trim().toLowerCase() === query.trim().toLowerCase());
  if (!exactMatch && query.trim().length > 0) {
    const createWrap = document.createElement('div');
    createWrap.className = 'p-3 border-t border-fonte-border';
    createWrap.innerHTML = `
      <p class="text-xs font-mono text-fonte-muted mb-2">Créer « ${escapeHtml(query.trim())} » comme nouvel exercice :</p>
      <div class="flex items-center gap-4 mb-2 text-xs font-mono">
        <label class="flex items-center gap-1.5"><input type="radio" name="new-exo-unit-fetiche" value="total" checked class="accent-fonte-amber"> Poids total</label>
        <label class="flex items-center gap-1.5"><input type="radio" name="new-exo-unit-fetiche" value="par_cote" class="accent-fonte-amber"> Par côté</label>
      </div>
      <button type="button" data-role="confirm-create"
        class="font-display uppercase tracking-wide text-xs px-3 py-1.5 bg-fonte-amber text-fonte-bg font-medium hover:bg-fonte-amberDark transition-colors">
        Créer et ajouter
      </button>
    `;
    createWrap.querySelector('[data-role="confirm-create"]').addEventListener('click', () => {
      const unit = createWrap.querySelector('input[name="new-exo-unit-fetiche"]:checked').value;
      createExerciseAndAddToFetiche(query.trim(), unit);
    });
    feticheExoSearchResults.appendChild(createWrap);
  }

  feticheExoSearchResults.classList.remove('hidden');
}

async function createExerciseAndAddToFetiche(nom, uniteCharge) {
  try {
    const { data, error } = await supabaseClient
      .from('exercices')
      .insert({ nom, unite_charge: uniteCharge })
      .select()
      .single();
    if (error) throw error;
    exercicesLookup.set(data.id, data);
    addExoToFeticheModal(data);
    feticheExoSearchInput.value = '';
    hideFeticheSearchResults();
  } catch (err) {
    console.error('Erreur création exercice (fétiche) :', err);
    if (err.code === '23505') {
      feticheModalStatus.textContent = `Un exercice nommé « ${nom} » existe déjà : recherchez-le plutôt que de le recréer.`;
    } else {
      feticheModalStatus.textContent = "Échec de la création de l'exercice (voir console).";
    }
  }
}

function addExoToFeticheModal(exo) {
  if (modalFeticheExos.some((e) => e.id === exo.id)) return;
  modalFeticheExos.push({ id: exo.id, nom: exo.nom, unite_charge: exo.unite_charge });
  renderFeticheModalExosList();
}

function openFeticheModal(fetiche) {
  editingFeticheId = fetiche ? fetiche.id : null;
  feticheModalTitle.textContent = fetiche ? 'Modifier la fétiche' : 'Nouvelle fétiche';
  feticheModalNom.value = fetiche ? fetiche.nom : '';
  feticheModalRepos.value = fetiche ? (fetiche.repos_default_secondes ?? 90) : 90;
  feticheModalJour.value = fetiche ? (fetiche.jour_defaut || '') : '';
  feticheModalStatus.textContent = '';
  btnDeleteFetiche.classList.toggle('hidden', !fetiche);

  const ids = fetiche ? (fetiche.exercices_ids_json || []) : [];
  modalFeticheExos = ids.map((id) => {
    const exo = exercicesLookup.get(id);
    return exo ? { id: exo.id, nom: exo.nom, unite_charge: exo.unite_charge } : { id, nom: '(exercice introuvable)', unite_charge: 'total' };
  });
  renderFeticheModalExosList();

  feticheModal.classList.remove('hidden');
  feticheModalNom.focus();
}

function closeFeticheModal() {
  feticheModal.classList.add('hidden');
  editingFeticheId = null;
  modalFeticheExos = [];
  hideFeticheSearchResults();
}

document.getElementById('btn-new-fetiche').addEventListener('click', () => openFeticheModal(null));
document.getElementById('btn-close-fetiche-modal').addEventListener('click', closeFeticheModal);
document.getElementById('btn-cancel-fetiche').addEventListener('click', closeFeticheModal);
feticheModal.addEventListener('click', (event) => {
  if (event.target === feticheModal) closeFeticheModal();
});

document.getElementById('btn-save-fetiche').addEventListener('click', async () => {
  const nom = feticheModalNom.value.trim();
  if (!nom) {
    feticheModalStatus.textContent = 'Le nom est obligatoire.';
    return;
  }

  const payload = {
    nom,
    jour_defaut: feticheModalJour.value || null,
    exercices_ids_json: modalFeticheExos.map((e) => e.id),
    repos_default_secondes: parseInt(feticheModalRepos.value, 10) || null
  };

  feticheModalStatus.textContent = 'Enregistrement…';
  try {
    if (editingFeticheId) {
      const { error } = await supabaseClient.from('fetiches').update(payload).eq('id', editingFeticheId);
      if (error) throw error;
    } else {
      const { error } = await supabaseClient.from('fetiches').insert(payload);
      if (error) throw error;
    }
    closeFeticheModal();
    await loadFetichesCache();
  } catch (err) {
    console.error('Erreur enregistrement fétiche :', err);
    feticheModalStatus.textContent = "Échec de l'enregistrement (voir console).";
  }
});

btnDeleteFetiche.addEventListener('click', async () => {
  if (!editingFeticheId) return;
  if (!window.confirm('Supprimer définitivement cette séance fétiche ? Les séances déjà enregistrées ne sont pas affectées.')) return;
  try {
    const { error } = await supabaseClient.from('fetiches').delete().eq('id', editingFeticheId);
    if (error) throw error;
    closeFeticheModal();
    await loadFetichesCache();
  } catch (err) {
    console.error('Erreur suppression fétiche :', err);
    feticheModalStatus.textContent = 'Échec de la suppression (voir console).';
  }
});

async function deleteFetiche(fetiche) {
  if (!window.confirm(`Supprimer « ${fetiche.nom} » ? Les séances déjà enregistrées ne sont pas affectées.`)) return;
  try {
    const { error } = await supabaseClient.from('fetiches').delete().eq('id', fetiche.id);
    if (error) throw error;
    await loadFetichesCache();
  } catch (err) {
    console.error('Erreur suppression fétiche :', err);
  }
}

document.querySelector('.tab-btn[data-tab="fetiches"]').addEventListener('click', () => {
  loadFetichesCache();
});

// --- Application d'une fétiche à la séance du jour (sans jamais modifier le modèle) ---
async function applyFeticheToSession(fetiche, isAuto) {
  const ids = fetiche.exercices_ids_json || [];
  await ensureExercicesLookup(ids);

  let addedCount = 0;
  ids.forEach((id) => {
    const exo = exercicesLookup.get(id);
    if (!exo) return;
    const already = currentSeance.exercices.some((e) => e.exercice_id === exo.id);
    if (!already) {
      currentSeance.exercices.push({
        exercice_id: exo.id,
        nom: exo.nom,
        unite_charge: exo.unite_charge,
        series: defaultSeriesSet()
      });
      addedCount += 1;
    }
  });

  if (fetiche.repos_default_secondes) {
    currentSeance.reposDefaultSecondes = fetiche.repos_default_secondes;
    updateSeanceReposLabel();
  }

  renderExercicesList();
  seanceSaveStatus.textContent = isAuto
    ? `Fétiche « ${fetiche.nom} » chargée automatiquement (jour par défaut) — ${addedCount} exercice(s) ajouté(s).`
    : `Fétiche « ${fetiche.nom} » chargée — ${addedCount} exercice(s) ajouté(s).`;
}

function maybeAutoLoadFetiche() {
  if (!currentSeance || currentSeance.exercices.length > 0) return;
  const weekday = weekdayKeyForDate(window.appState.selectedDate);
  const match = fetichesCache.find((f) => f.jour_defaut === weekday);
  if (match) applyFeticheToSession(match, true);
}

btnLoadFetiche.addEventListener('click', () => {
  const id = feticheQuickSelect.value;
  if (!id) return;
  const fetiche = fetichesCache.find((f) => f.id === id);
  if (fetiche) applyFeticheToSession(fetiche, false);
});

// ---------------------------------------------------------
// 6. Timer de repos
// ---------------------------------------------------------
let restTimerInterval = null;
let restTimerRemaining = 0;
let restTimerTotal = 0;
let restTimerRunning = false;

const restTimerBar = document.getElementById('rest-timer-bar');
const restTimerDisplay = document.getElementById('rest-timer-display');
const restTimerProgress = document.getElementById('rest-timer-progress');
const btnRestMinus = document.getElementById('btn-rest-minus');
const btnRestPlus = document.getElementById('btn-rest-plus');
const btnRestPause = document.getElementById('btn-rest-pause');
const btnRestReset = document.getElementById('btn-rest-reset');
const btnRestClose = document.getElementById('btn-rest-close');

function formatMMSS(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function updateRestTimerDisplay() {
  restTimerDisplay.textContent = formatMMSS(restTimerRemaining);
  const pct = restTimerTotal > 0 ? Math.max(0, Math.min(1, restTimerRemaining / restTimerTotal)) : 0;
  restTimerProgress.style.width = `${pct * 100}%`;
}

function playRestEndAlert() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.5);
    oscillator.onended = () => ctx.close();
  } catch (err) {
    console.error('Bip indisponible sur cet appareil :', err);
  }
  if (navigator.vibrate) {
    try { navigator.vibrate([200, 100, 200]); } catch (err) { /* vibration indisponible, sans conséquence */ }
  }
}

function tickRestTimer() {
  restTimerRemaining -= 1;
  if (restTimerRemaining <= 0) {
    restTimerRemaining = 0;
    updateRestTimerDisplay();
    clearInterval(restTimerInterval);
    restTimerInterval = null;
    restTimerRunning = false;
    btnRestPause.textContent = 'Relancer';
    restTimerBar.classList.add('rest-done');
    playRestEndAlert();
    return;
  }
  updateRestTimerDisplay();
}

function startRestTimer(seconds) {
  restTimerTotal = seconds;
  restTimerRemaining = seconds;
  restTimerRunning = true;
  restTimerBar.classList.remove('rest-done', 'hidden');
  btnRestPause.textContent = 'Pause';
  updateRestTimerDisplay();
  clearInterval(restTimerInterval);
  restTimerInterval = setInterval(tickRestTimer, 1000);
}

btnRestPause.addEventListener('click', () => {
  if (restTimerRunning) {
    clearInterval(restTimerInterval);
    restTimerInterval = null;
    restTimerRunning = false;
    btnRestPause.textContent = 'Reprendre';
  } else {
    if (restTimerRemaining <= 0) restTimerRemaining = restTimerTotal;
    restTimerRunning = true;
    restTimerBar.classList.remove('rest-done');
    restTimerInterval = setInterval(tickRestTimer, 1000);
    btnRestPause.textContent = 'Pause';
  }
});

btnRestReset.addEventListener('click', () => startRestTimer(restTimerTotal || 90));
btnRestPlus.addEventListener('click', () => {
  restTimerRemaining += 15;
  restTimerTotal = Math.max(restTimerTotal, restTimerRemaining);
  updateRestTimerDisplay();
});
btnRestMinus.addEventListener('click', () => {
  restTimerRemaining = Math.max(0, restTimerRemaining - 15);
  updateRestTimerDisplay();
});
btnRestClose.addEventListener('click', () => {
  clearInterval(restTimerInterval);
  restTimerInterval = null;
  restTimerBar.classList.add('hidden');
});

// Chargement initial des fétiches (nécessaire pour l'auto-application au jour par défaut).
loadFetichesCache();

// ---------------------------------------------------------
// 7. Export JSON
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
// 8. Import JSON
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
