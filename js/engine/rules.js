// DCL_archives — Moteur de règles Dames Internationales 10x10 (FMJD)
// Numérotation standard: cases jouables 1..50, rangée 1 en haut, Blancs en bas.
// Port simplifié du moteur DamikA (js/engine/rules.js), adapté aux seuls besoins
// de ce projet: rejouer un PDN existant (déjà validé légal), pas de génération
// de coups pour un joueur humain.

export const WHITE = 'w';
export const BLACK = 'b';

const SQUARE_TO_RC = new Array(51);
const RC_TO_SQUARE = {};
(function buildTables() {
  let n = 1;
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 10; col++) {
      if ((row + col) % 2 === 1) {
        SQUARE_TO_RC[n] = [row, col];
        RC_TO_SQUARE[row * 10 + col] = n;
        n++;
      }
    }
  }
})();

export function squareToRC(sq) {
  return SQUARE_TO_RC[sq];
}
export function rcToSquare(row, col) {
  if (row < 0 || row > 9 || col < 0 || col > 9) return null;
  return RC_TO_SQUARE[row * 10 + col] ?? null;
}

export function initialBoard() {
  const board = new Array(51).fill(null);
  for (let sq = 1; sq <= 20; sq++) board[sq] = { color: BLACK, king: false };
  for (let sq = 31; sq <= 50; sq++) board[sq] = { color: WHITE, king: false };
  return board;
}

function cloneBoard(board) {
  const out = new Array(51).fill(null);
  for (let i = 1; i <= 50; i++) out[i] = board[i] ? { ...board[i] } : null;
  return out;
}

function manJumpTargets(board, sq, color) {
  const [row, col] = SQUARE_TO_RC[sq];
  const res = [];
  for (const dr of [-1, 1]) {
    for (const dc of [-1, 1]) {
      const mid = rcToSquare(row + dr, col + dc);
      const land = rcToSquare(row + 2 * dr, col + 2 * dc);
      if (mid && land && board[mid] && board[mid].color !== color && !board[land]) {
        res.push([mid, land]);
      }
    }
  }
  return res;
}

function kingJumpTargets(board, sq, color) {
  const [row, col] = SQUARE_TO_RC[sq];
  const res = [];
  for (const dr of [-1, 1]) {
    for (const dc of [-1, 1]) {
      let r = row + dr, c = col + dc;
      let foundEnemy = null;
      while (true) {
        const s = rcToSquare(r, c);
        if (!s) break;
        if (board[s]) {
          if (board[s].color === color || foundEnemy !== null) break;
          foundEnemy = s;
        } else if (foundEnemy !== null) {
          res.push([foundEnemy, s]);
        }
        r += dr; c += dc;
      }
    }
  }
  return res;
}

// Recherche une séquence de prise reliant `start` à la suite de cases `targets`
// (issues de la notation PDN, qui peut omettre les étapes intermédiaires: on
// cherche alors n'importe quel chemin légal menant à la case finale).
function searchCapturePath(board, color, isKing, start, targets) {
  const end = targets[targets.length - 1];
  const explicit = targets.length > 1 ? targets : null;

  function dfs(cur, remaining, captured, path) {
    const jumps = isKing ? kingJumpTargets(board, cur, color) : manJumpTargets(board, cur, color);
    if (!remaining) {
      for (const [mid, land] of jumps) {
        if (captured.includes(mid)) continue;
        if (land === end) return { captured: [...captured, mid], path: [...path, land] };
        const r = dfs(land, null, [...captured, mid], [...path, land]);
        if (r) return r;
      }
      return null;
    } else {
      const nxt = remaining[0];
      for (const [mid, land] of jumps) {
        if (land === nxt && !captured.includes(mid)) {
          const rest = remaining.length > 1 ? remaining.slice(1) : null;
          const r = dfs(land, rest, [...captured, mid], [...path, land]);
          if (r) return r;
        }
      }
      return null;
    }
  }

  return dfs(start, explicit, [], [start]);
}

// Applique un coup en notation FMJD ("32-28" ou "17x28x39") sur une copie du
// plateau. Retourne { board, path, capturedSquares, capturedPieces } ou lève
// une erreur si le coup est illégal (ne devrait pas arriver sur un PDN déjà
// validé par tools/validate_pdn.py, mais on ne veut pas planter silencieusement).
export function applyMove(board, color, notation) {
  const isCapture = notation.includes('x');
  const squares = notation.split(isCapture ? 'x' : '-').map(Number);
  const start = squares[0];
  const piece = board[start];
  if (!piece || piece.color !== color) {
    throw new Error(`Coup illégal "${notation}": pas de pièce ${color} en ${start}`);
  }
  const isKing = piece.king;
  const next = cloneBoard(board);

  if (!isCapture) {
    const end = squares[1];
    if (board[end]) throw new Error(`Coup illégal "${notation}": case ${end} occupée`);
    next[start] = null;
    const [r1] = SQUARE_TO_RC[end];
    const crowned = isKing || (color === WHITE && r1 === 0) || (color === BLACK && r1 === 9);
    next[end] = { color, king: crowned };
    return { board: next, path: [start, end], capturedSquares: [], capturedPieces: [] };
  }

  const result = searchCapturePath(board, color, isKing, start, squares.slice(1));
  if (!result) throw new Error(`Coup illégal "${notation}": aucune séquence de prise valide`);
  const end = squares[squares.length - 1];
  const capturedPieces = result.captured.map((sq) => ({ square: sq, piece: { ...board[sq] } }));
  for (const sq of result.captured) next[sq] = null;
  next[start] = null;
  const [r1] = SQUARE_TO_RC[end];
  const crowned = isKing || (color === WHITE && r1 === 0) || (color === BLACK && r1 === 9);
  next[end] = { color, king: crowned };
  return { board: next, path: result.path, capturedSquares: result.captured, capturedPieces };
}

// --- Lecture PDN ------------------------------------------------------------

export function parsePdn(text) {
  const tags = {};
  const bodyLines = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^\[(\w+)\s+"(.*)"\]\s*$/);
    if (m) tags[m[1]] = m[2];
    else if (line.trim()) bodyLines.push(line);
  }
  const body = bodyLines.join(' ');
  const tokens = body.match(/\d+[x-]\d+(?:[x-]\d+)*|1-0|0-1|1-1|0-2|2-0/g) || [];
  const moves = [];
  let color = WHITE;
  for (const tok of tokens) {
    if (/^(1-0|0-1|1-1|0-2|2-0)$/.test(tok)) continue;
    moves.push({ color, notation: tok });
    color = color === WHITE ? BLACK : WHITE;
  }
  return { tags, moves };
}

// Rejoue l'intégralité d'une partie et retourne la liste des positions
// successives (board après chaque coup) + les métadonnées de coup (path,
// captures) utilisées pour l'animation.
export function replayGame(pdnText) {
  const { tags, moves } = parsePdn(pdnText);
  let board = initialBoard();
  const steps = [{ board: cloneBoard(board), move: null }];
  for (const { color, notation } of moves) {
    const { board: next, path, capturedSquares, capturedPieces } = applyMove(board, color, notation);
    board = next;
    steps.push({ board: cloneBoard(board), move: { color, notation, path, capturedSquares, capturedPieces } });
  }
  return { tags, steps };
}
