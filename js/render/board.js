// DCL_archives — Rendu Canvas du plateau, inspiré du rendu DamikA
// (C:\Users\micka\DamikA\js\render\board.js) : thème bois, pièces en relief,
// animation fluide des déplacements et captures. Réimplémentation simplifiée
// et autonome pour ce projet (pas de sélection/coups joueur, uniquement lecture).
import { squareToRC, rcToSquare } from '../engine/rules.js';

const LABEL_MARGIN = 24;

const THEME = {
  frame1: '#5a3a1a', frame2: '#3a2410', frameBorder: '#2a1808',
  light: '#d4bc8a', dark: '#8B5E1A', darkHL: '#b07820',
  coordText: 'rgba(255,255,255,0.55)',
  arrowColor: '#5bc8ff',
};

export class BoardRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.flipped = false;
    this.size = 0;
    this.cell = 0;
    this.dpr = window.devicePixelRatio || 1;
    this.board = null;
    this.lastMove = null; // { path: [sq,...] }
    this.animation = null;
    this.animSpeedMs = 320;
    this._animFrame = null;

    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(canvas.parentElement);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const parent = this.canvas.parentElement;
    const available = Math.min(parent.clientWidth, parent.clientHeight || parent.clientWidth);
    const px = Math.max(280, Math.floor(available));
    this.size = Math.max(1, px - LABEL_MARGIN * 2);
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = px * this.dpr;
    this.canvas.height = px * this.dpr;
    this.canvas.style.width = px + 'px';
    this.canvas.style.height = px + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.cell = this.size / 10;
    this.render();
  }

  setBoard(board) {
    this.board = board;
    this.render();
  }

  setFlipped(flipped) {
    this.flipped = flipped;
    this.render();
  }

  setLastMove(move) {
    this.lastMove = move;
  }

  // Anime un coup: path = liste de cases [depart, ...étapes, arrivée],
  // capturedPieces = [{square, piece}] pour dessiner les pièces prises tant
  // que l'animation n'a pas atteint leur case.
  animateMove({ path, piece, capturedPieces = [] }) {
    return new Promise((resolve) => {
      if (this.animSpeedMs <= 0 || path.length < 2) { resolve(); return; }
      let settled = false;
      const settle = () => { if (!settled) { settled = true; resolve(); } };
      const duration = capturedPieces.length > 0 ? Math.max(160, this.animSpeedMs * 0.75) : this.animSpeedMs;
      this.animation = { path, piece, capturedPieces, segment: 0, start: performance.now(), duration, resolve: settle };
      const maxWait = (path.length - 1) * duration + 1500;
      setTimeout(() => {
        if (this.animation && this.animation.resolve === settle) this.animation = null;
        settle();
      }, maxWait);
      this._ensureLoop();
    });
  }

  _ensureLoop() {
    if (this._animFrame) return;
    const step = () => {
      this.render();
      if (this.animation) {
        this._animFrame = requestAnimationFrame(step);
      } else {
        this._animFrame = null;
      }
    };
    this._animFrame = requestAnimationFrame(step);
  }

  _screenRC(row, col) {
    if (this.flipped) return [9 - row, 9 - col];
    return [row, col];
  }

  _cellCenter(row, col) {
    const [sr, sc] = this._screenRC(row, col);
    return [LABEL_MARGIN + sc * this.cell + this.cell / 2, LABEL_MARGIN + sr * this.cell + this.cell / 2];
  }

  render() {
    if (!this.board) return;
    this._advanceAnimation();
    const ctx = this.ctx;
    const s = this.size;
    ctx.clearRect(0, 0, s + LABEL_MARGIN * 2, s + LABEL_MARGIN * 2);
    this._drawFrame();
    this._drawSquares();
    this._drawCoords();
    if (this.lastMove) this._drawLastMoveArrow();
    this._drawPieces();
  }

  _advanceAnimation() {
    const anim = this.animation;
    if (!anim) return;
    const now = performance.now();
    let t = (now - anim.start) / anim.duration;
    if (t >= 1) {
      anim.segment += 1;
      if (anim.segment >= anim.path.length - 1) {
        this.animation = null;
        anim.resolve();
        return;
      }
      anim.start = now;
    }
  }

  _drawFrame() {
    const ctx = this.ctx;
    const s = this.size;
    const g = ctx.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, THEME.frame1);
    g.addColorStop(1, THEME.frame2);
    ctx.fillStyle = g;
    roundRect(ctx, LABEL_MARGIN - 8, LABEL_MARGIN - 8, s + 16, s + 16, 6);
    ctx.fill();
    ctx.strokeStyle = THEME.frameBorder;
    ctx.lineWidth = 1;
    roundRect(ctx, LABEL_MARGIN - 8, LABEL_MARGIN - 8, s + 16, s + 16, 6);
    ctx.stroke();
  }

  _drawSquares() {
    const ctx = this.ctx;
    const c = this.cell;
    const lastSquares = this.lastMove?.path ? new Set(this.lastMove.path) : null;
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 10; col++) {
        const dark = (row + col) % 2 === 1;
        const [sr, sc] = this._screenRC(row, col);
        const x = LABEL_MARGIN + sc * c;
        const y = LABEL_MARGIN + sr * c;
        if (dark) {
          const sq = rcToSquare(row, col);
          ctx.fillStyle = lastSquares && lastSquares.has(sq) ? THEME.darkHL : THEME.dark;
        } else {
          ctx.fillStyle = THEME.light;
        }
        ctx.fillRect(x, y, c, c);
      }
    }
  }

  _drawCoords() {
    const ctx = this.ctx;
    const c = this.cell;
    ctx.fillStyle = THEME.coordText;
    ctx.font = `${Math.min(11, Math.max(9, c * 0.2))}px 'Segoe UI', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 10; col++) {
        if ((row + col) % 2 !== 1) continue;
        const sq = rcToSquare(row, col);
        if (col === (this.flipped ? 9 : 0)) {
          const [sr] = this._screenRC(row, col);
          ctx.textAlign = 'right';
          ctx.fillText(String(sq), 13, LABEL_MARGIN + sr * c + c / 2);
        }
        if (row === (this.flipped ? 0 : 9)) {
          const [, sc] = this._screenRC(row, col);
          ctx.textAlign = 'center';
          ctx.fillText(String(sq), LABEL_MARGIN + sc * c + c / 2, LABEL_MARGIN + this.size + 15);
        }
      }
    }
  }

  _drawLastMoveArrow() {
    const squares = this.lastMove.path;
    if (!squares || squares.length < 2) return;
    const points = squares.map((sq) => {
      const [row, col] = squareToRC(sq);
      return this._cellCenter(row, col);
    });
    drawMovePath(this.ctx, points, this.cell, THEME.arrowColor);
  }

  _drawPieces() {
    const ctx = this.ctx;
    const c = this.cell;
    const r = c * 0.4;
    const anim = this.animation;
    const skip = new Set();
    if (anim) {
      skip.add(anim.path[0]);
      for (const cp of anim.capturedPieces) skip.add(cp.square);
    }

    for (let sq = 1; sq <= 50; sq++) {
      if (skip.has(sq)) continue;
      const piece = this.board[sq];
      if (!piece) continue;
      const [row, col] = squareToRC(sq);
      const [cx, cy] = this._cellCenter(row, col);
      drawPieceRelief(ctx, cx, cy, r, piece);
    }

    if (anim) {
      const now = performance.now();
      const t = Math.min(1, (now - anim.start) / anim.duration);
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

      const segmentsDone = anim.segment;
      anim.capturedPieces.forEach(({ square, piece: capturedPiece }, idx) => {
        const [row, col] = squareToRC(square);
        const [cx, cy] = this._cellCenter(row, col);
        let alpha;
        if (idx < segmentsDone) alpha = 0;
        else if (idx === segmentsDone) alpha = eased < 0.5 ? 1 : 0;
        else alpha = 1;
        if (alpha <= 0.01) return;
        drawPieceRelief(ctx, cx, cy, r, capturedPiece, { alpha });
      });

      const fromSq = anim.path[anim.segment];
      const toSq = anim.path[anim.segment + 1];
      const [fr, fc] = squareToRC(fromSq);
      const [tr, tc] = squareToRC(toSq);
      const [x1, y1] = this._cellCenter(fr, fc);
      const [x2, y2] = this._cellCenter(tr, tc);
      const x = x1 + (x2 - x1) * eased;
      const y = y1 + (y2 - y1) * eased;
      const bounce = 1 + Math.sin(eased * Math.PI) * 0.08;
      drawPieceRelief(ctx, x, y, r * bounce, anim.piece);
    }
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawMovePath(ctx, points, cell, color = '#5bc8ff') {
  if (!points || points.length < 2) return;
  const headLen = cell * 0.28;
  const lineWidth = cell * 0.1;
  const pieceRadius = cell * 0.4;
  const tipInset = pieceRadius * 0.92;

  const last = points[points.length - 1];
  const beforeLast = points[points.length - 2];
  const angle = Math.atan2(last[1] - beforeLast[1], last[0] - beforeLast[0]);
  const tipX = last[0] - Math.cos(angle) * tipInset;
  const tipY = last[1] - Math.sin(angle) * tipInset;
  const shorten = headLen * 0.6;
  const ex = tipX - Math.cos(angle) * shorten;
  const ey = tipY - Math.sin(angle) * shorten;

  ctx.save();
  ctx.globalAlpha = 0.72;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length - 1; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.lineTo(ex, ey);
  ctx.stroke();

  for (let i = 1; i < points.length - 1; i++) {
    ctx.beginPath();
    ctx.arc(points[i][0], points[i][1], cell * 0.06, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX - headLen * Math.cos(angle - 0.42), tipY - headLen * Math.sin(angle - 0.42));
  ctx.lineTo(tipX - headLen * Math.cos(angle + 0.42), tipY - headLen * Math.sin(angle + 0.42));
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

// Pièces "Relief" (gradient radial, anneau intérieur, ombre ellipsoïdale) —
// même approche visuelle que DamikA. piece = { color: 'w'|'b', king: bool }.
function drawPieceRelief(ctx, cx, cy, r, piece, opts = {}) {
  const { alpha = 1, scale = 1 } = opts;
  const radius = r * scale;
  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.beginPath();
  ctx.ellipse(cx, cy + radius * 0.22, radius * 0.92, radius * 0.55, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fill();

  const isWhite = piece.color === 'w';
  const base = isWhite ? ['#faf3e2', '#ddc79a'] : ['#3a3430', '#131110'];
  const rim = isWhite ? '#8a7550' : '#000000';

  const grad = ctx.createRadialGradient(cx - radius * 0.35, cy - radius * 0.4, radius * 0.1, cx, cy, radius);
  grad.addColorStop(0, base[0]);
  grad.addColorStop(1, base[1]);

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = radius * 0.09;
  ctx.strokeStyle = rim;
  ctx.globalAlpha = alpha * 0.7;
  ctx.stroke();
  ctx.globalAlpha = alpha;

  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.72, 0, Math.PI * 2);
  ctx.strokeStyle = isWhite ? 'rgba(140,115,75,0.55)' : 'rgba(255,255,255,0.12)';
  ctx.lineWidth = radius * 0.06;
  ctx.stroke();

  if (piece.king) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.42, 0, Math.PI * 2);
    const kg = ctx.createRadialGradient(cx, cy - radius * 0.15, radius * 0.05, cx, cy, radius * 0.42);
    kg.addColorStop(0, '#ffe9a8');
    kg.addColorStop(1, '#c9962e');
    ctx.fillStyle = kg;
    ctx.fill();
    ctx.lineWidth = radius * 0.05;
    ctx.strokeStyle = '#8a6412';
    ctx.stroke();
  }

  ctx.restore();
}
