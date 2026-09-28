import { GamePlayer } from './player.js';

const params = new URLSearchParams(location.search);
const gameId = params.get('id');

const els = {
  title: document.getElementById('title'),
  subline: document.getElementById('subline'),
  scanTabs: document.getElementById('scan-tabs'),
  scanFrame: document.getElementById('scan-frame'),
  moveCurrent: document.getElementById('move-current'),
  moveTotal: document.getElementById('move-total'),
  moveNotation: document.getElementById('move-notation'),
  slider: document.getElementById('slider'),
  btnFirst: document.getElementById('btn-first'),
  btnPrev: document.getElementById('btn-prev'),
  btnPlay: document.getElementById('btn-play'),
  btnNext: document.getElementById('btn-next'),
  btnLast: document.getElementById('btn-last'),
  btnFlip: document.getElementById('btn-flip'),
  canvas: document.getElementById('board'),
  pdnDownload: document.getElementById('pdn-download'),
  zoomOut: document.getElementById('zoom-out'),
  zoomIn: document.getElementById('zoom-in'),
  zoomFit: document.getElementById('zoom-fit'),
  zoomLevel: document.getElementById('zoom-level'),
  zoomFullscreen: document.getElementById('zoom-fullscreen'),
  fullscreenOverlay: document.getElementById('scan-fullscreen-overlay'),
  fullscreenFrame: document.getElementById('scan-fullscreen-frame'),
  fullscreenClose: document.getElementById('fullscreen-close'),
};

function formatDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// toolbar=0&navpanes=0 désactive la barre d'outils et le panneau de vignettes du
// lecteur PDF natif de Chrome, qui sinon s'affiche à côté du PDF et donne l'impression
// d'un scan dupliqué en miniature à côté de la version grande. scrollbar=1 reste
// nécessaire pour pouvoir se déplacer dans l'image une fois zoomée.
// zoom: undefined/null = vue par défaut du lecteur (identique à avant, lisible sans
// rien faire) ; sinon un pourcentage piloté par les boutons +/-.
let currentScanPath = null;
let zoomPercent = null; // null = zoom par défaut (comportement d'origine)

function pdfSrc(path, zoom) {
  let frag = 'toolbar=0&navpanes=0&scrollbar=1';
  if (zoom) frag += `&zoom=${zoom}`;
  // Un changement de #fragment seul ne recharge pas un <iframe> (navigation "same
  // document"), donc le lecteur PDF de Chrome ignore le nouveau paramètre zoom. Le
  // cache-buster ?t=… force un véritable rechargement du document à chaque appel.
  return `${path}?t=${Date.now()}#${frag}`;
}

function applyZoom() {
  if (!currentScanPath) return;
  els.scanFrame.src = pdfSrc(currentScanPath, zoomPercent);
  els.zoomLevel.textContent = zoomPercent ? `${zoomPercent}%` : '100%';
}

function setupScanTabs(scans) {
  els.scanTabs.innerHTML = '';
  scans.forEach((scan, i) => {
    const btn = document.createElement('button');
    btn.textContent = scan.label;
    btn.className = i === 0 ? 'active' : '';
    btn.addEventListener('click', () => {
      currentScanPath = scan.path;
      zoomPercent = null;
      applyZoom();
      [...els.scanTabs.children].forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
    });
    els.scanTabs.appendChild(btn);
  });
  if (scans.length) {
    currentScanPath = scans[0].path;
    zoomPercent = null;
    applyZoom();
  }
}

function setupZoomControls() {
  els.zoomIn.addEventListener('click', () => {
    zoomPercent = Math.min(400, (zoomPercent || 100) + 25);
    applyZoom();
  });
  els.zoomOut.addEventListener('click', () => {
    zoomPercent = Math.max(50, (zoomPercent || 100) - 25);
    applyZoom();
  });
  els.zoomFit.addEventListener('click', () => {
    zoomPercent = null;
    applyZoom();
  });
  els.zoomFullscreen.addEventListener('click', () => {
    if (!currentScanPath) return;
    els.fullscreenFrame.src = pdfSrc(currentScanPath, zoomPercent);
    els.fullscreenOverlay.classList.add('open');
  });
  const closeFullscreen = () => {
    els.fullscreenOverlay.classList.remove('open');
    els.fullscreenFrame.src = '';
  };
  els.fullscreenClose.addEventListener('click', closeFullscreen);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && els.fullscreenOverlay.classList.contains('open')) closeFullscreen();
  });
}

async function init() {
  const res = await fetch('data/games.json');
  const games = await res.json();
  const game = games.find((g) => g.id === gameId);
  if (!game) {
    els.title.textContent = 'Partie introuvable';
    return;
  }

  els.title.textContent = `${game.white} — ${game.black}`;
  els.subline.textContent =
    `${formatDate(game.date)} · Ronde ${game.round} (${game.leg}) · ${game.cadence} · Résultat ${game.result}`;
  document.title = `DCL Archives — ${game.white} vs ${game.black}`;

  setupScanTabs(game.scans || []);
  setupZoomControls();

  els.pdnDownload.href = game.pdn;
  els.pdnDownload.download = game.pdn.split('/').pop();

  const player = new GamePlayer(els.canvas);
  await player.load(game.pdn);

  els.slider.max = String(player.steps.length - 1);

  player.onIndexChange = (index, total, move) => {
    els.moveCurrent.textContent = index;
    els.moveTotal.textContent = total;
    els.slider.value = String(index);
    if (move) {
      const num = Math.ceil(index / 2);
      const side = move.color === 'w' ? 'Blancs' : 'Noirs';
      els.moveNotation.textContent = `${num}. ${side} : ${move.notation}`;
    } else {
      els.moveNotation.textContent = 'Position de départ';
    }
    els.btnFirst.disabled = player.atStart;
    els.btnPrev.disabled = player.atStart;
    els.btnNext.disabled = player.atEnd;
    els.btnLast.disabled = player.atEnd;
    els.btnPlay.textContent = player.playing ? '⏸' : '▶';
  };
  player.onIndexChange(0, player.steps.length - 1, null);

  els.btnFirst.addEventListener('click', () => player.first());
  els.btnPrev.addEventListener('click', () => player.prev());
  els.btnNext.addEventListener('click', () => player.next());
  els.btnLast.addEventListener('click', () => player.last());
  els.btnPlay.addEventListener('click', () => {
    player.toggle();
    els.btnPlay.textContent = player.playing ? '⏸' : '▶';
  });
  els.btnFlip.addEventListener('click', () => player.renderer.setFlipped(!player.renderer.flipped));
  els.slider.addEventListener('input', () => {
    player.stop();
    player.goto(Number(els.slider.value));
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') player.next();
    if (e.key === 'ArrowLeft') player.prev();
    if (e.key === ' ') { e.preventDefault(); player.toggle(); els.btnPlay.textContent = player.playing ? '⏸' : '▶'; }
  });
}

init();
