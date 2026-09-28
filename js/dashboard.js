// Tableau de bord de recherche — charge data/games.json, construit les
// filtres dynamiquement à partir des données présentes, et rend la liste.

const els = {
  cadence: document.getElementById('f-cadence'),
  round: document.getElementById('f-round'),
  leg: document.getElementById('f-leg'),
  date: document.getElementById('f-date'),
  result: document.getElementById('f-result'),
  player1: document.getElementById('f-player1'),
  player2: document.getElementById('f-player2'),
  colorValue: document.getElementById('f-color-value'),
  results: document.getElementById('results'),
  resultsCount: document.getElementById('results-count'),
  reset: document.getElementById('reset-filters'),
};

let games = [];

function uniqueSorted(arr) {
  return [...new Set(arr)].sort();
}

function fillSelect(select, values, formatter = (v) => v, placeholder = 'Tous') {
  select.innerHTML = '';
  const opt0 = document.createElement('option');
  opt0.value = '';
  opt0.textContent = placeholder;
  select.appendChild(opt0);
  for (const v of values) {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = formatter(v);
    select.appendChild(opt);
  }
}

function playersOf(games) {
  const map = new Map();
  for (const g of games) {
    map.set(g.whiteId, g.white);
    map.set(g.blackId, g.black);
  }
  return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
}

function buildFilters() {
  fillSelect(els.cadence, uniqueSorted(games.map((g) => g.cadence)));
  fillSelect(els.round, uniqueSorted(games.map((g) => g.round)), (v) => `Ronde ${v}`);
  fillSelect(els.leg, uniqueSorted(games.map((g) => g.leg)), (v) => (v === 'aller' ? 'Aller' : 'Retour'));
  fillSelect(els.date, uniqueSorted(games.map((g) => g.date)), (v) => formatDate(v));

  const players = playersOf(games);
  const playerOptionsHtml = (select, placeholder) => {
    select.innerHTML = '';
    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = placeholder;
    select.appendChild(opt0);
    for (const [id, name] of players) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = name;
      select.appendChild(opt);
    }
  };
  playerOptionsHtml(els.player1, 'Tous les joueurs');
  playerOptionsHtml(els.player2, 'Adversaire (optionnel)');
}

function formatDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function resultBadge(g) {
  const [w, b] = g.result.split('-').map(Number);
  if (w === b) return { cls: 'draw', label: `${g.result} (nul)` };
  if (w > b) return { cls: 'w-win', label: `${g.result} (Blancs)` };
  return { cls: 'b-win', label: `${g.result} (Noirs)` };
}

function matchesFilters(g) {
  if (els.cadence.value && g.cadence !== els.cadence.value) return false;
  if (els.round.value && String(g.round) !== els.round.value) return false;
  if (els.leg.value && g.leg !== els.leg.value) return false;
  if (els.date.value && g.date !== els.date.value) return false;

  if (els.result.value) {
    const [w, b] = g.result.split('-').map(Number);
    const isDraw = w === b;
    if (els.result.value === 'draw' && !isDraw) return false;
    if (els.result.value === 'w' && !(w > b)) return false;
    if (els.result.value === 'b' && !(b > w)) return false;
  }

  const p1 = els.player1.value;
  const p2 = els.player2.value;
  const colorFilter = els.colorValue.value;

  if (p1) {
    const p1IsWhite = g.whiteId === p1;
    const p1IsBlack = g.blackId === p1;
    if (!p1IsWhite && !p1IsBlack) return false;
    if (colorFilter === 'w' && !p1IsWhite) return false;
    if (colorFilter === 'b' && !p1IsBlack) return false;
  }

  if (p2) {
    const involved = g.whiteId === p2 || g.blackId === p2;
    if (!involved) return false;
    if (p1 && p1 === p2) return false; // duel avec soi-même: aucun sens
    // duel précis: les deux joueurs doivent être les deux camps de la partie
    if (p1) {
      const pair = new Set([g.whiteId, g.blackId]);
      if (!pair.has(p1) || !pair.has(p2)) return false;
    }
  }

  return true;
}

function render() {
  const filtered = games.filter(matchesFilters).sort((a, b) => (a.date < b.date ? 1 : -1));
  els.resultsCount.textContent = `${filtered.length} partie${filtered.length > 1 ? 's' : ''}`;
  els.results.innerHTML = '';

  if (filtered.length === 0) {
    els.results.innerHTML = '<div class="empty-state">Aucune partie ne correspond à ces filtres.</div>';
    return;
  }

  for (const g of filtered) {
    const badge = resultBadge(g);
    const card = document.createElement('a');
    card.className = 'game-card';
    card.href = `game.html?id=${encodeURIComponent(g.id)}`;
    card.innerHTML = `
      <div class="meta-date">
        <span>${formatDate(g.date)}</span>
        <span>Ronde ${g.round} · ${g.leg === 'aller' ? 'aller' : 'retour'}</span>
      </div>
      <div class="players">
        <span><span class="piece-dot w"></span>${g.white}</span>
        <span class="vs">vs</span>
        <span><span class="piece-dot b"></span>${g.black}</span>
      </div>
      <span class="tag">${g.cadence}</span>
      <span class="result-badge ${badge.cls}">${g.result}</span>
      <span class="open-link">Voir la partie →</span>
    `;
    els.results.appendChild(card);
  }
}

function attachHandlers() {
  for (const el of [els.cadence, els.round, els.leg, els.date, els.result, els.player1, els.player2, els.colorValue]) {
    el.addEventListener('change', render);
  }
  els.reset.addEventListener('click', () => {
    for (const el of [els.cadence, els.round, els.leg, els.date, els.result, els.player1, els.player2, els.colorValue]) {
      el.value = '';
    }
    render();
  });
}

async function init() {
  const res = await fetch('data/games.json');
  games = await res.json();
  buildFilters();
  attachHandlers();
  render();
}

init();
