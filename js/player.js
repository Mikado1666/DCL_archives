// Contrôleur de rejeu: charge un PDN, pilote le BoardRenderer coup par coup,
// gère l'autoplay et le slider de progression.
import { replayGame } from './engine/rules.js';
import { BoardRenderer } from './render/board.js';

export class GamePlayer {
  constructor(canvas) {
    this.renderer = new BoardRenderer(canvas);
    this.steps = [];
    this.index = 0;
    this.playing = false;
    this._timer = null;
    this.speedMs = 700; // délai entre coups en autoplay
    this.onIndexChange = null; // callback(index, total, move)
  }

  async load(pdnPath) {
    const res = await fetch(pdnPath);
    if (!res.ok) throw new Error(`Impossible de charger ${pdnPath}`);
    const text = await res.text();
    const { tags, steps } = replayGame(text);
    this.tags = tags;
    this.steps = steps;
    this.index = 0;
    this.renderer.setBoard(steps[0].board);
    this.renderer.setLastMove(null);
    this._notify();
    return tags;
  }

  _notify() {
    if (this.onIndexChange) this.onIndexChange(this.index, this.steps.length - 1, this.steps[this.index].move);
  }

  get atStart() { return this.index === 0; }
  get atEnd() { return this.index === this.steps.length - 1; }

  async goto(index, animate = false) {
    index = Math.max(0, Math.min(this.steps.length - 1, index));
    if (index === this.index) return;
    if (!animate || Math.abs(index - this.index) > 1) {
      this.index = index;
      this.renderer.setBoard(this.steps[index].board);
      this.renderer.setLastMove(this.steps[index].move ? { path: this.steps[index].move.path } : null);
      this._notify();
      return;
    }
    await this.step(index > this.index ? 1 : -1);
  }

  async step(direction) {
    const target = this.index + direction;
    if (target < 0 || target >= this.steps.length) return;
    if (direction > 0) {
      const { move } = this.steps[target];
      this.index = target;
      if (move) {
        this.renderer.setLastMove({ path: move.path });
        await this.renderer.animateMove({
          path: move.path,
          piece: this.steps[target - 1].board[move.path[0]],
          capturedPieces: move.capturedPieces,
        });
      }
      this.renderer.setBoard(this.steps[target].board);
      this.renderer.render();
    } else {
      this.index = target;
      this.renderer.setBoard(this.steps[target].board);
      this.renderer.setLastMove(this.steps[target].move ? { path: this.steps[target].move.path } : null);
      this.renderer.render();
    }
    this._notify();
  }

  first() { this.stop(); return this.goto(0); }
  last() { this.stop(); return this.goto(this.steps.length - 1); }
  next() { this.stop(); return this.step(1); }
  prev() { this.stop(); return this.step(-1); }

  play() {
    if (this.playing) return;
    this.playing = true;
    const tick = async () => {
      if (!this.playing) return;
      if (this.atEnd) { this.stop(); return; }
      await this.step(1);
      if (this.playing) this._timer = setTimeout(tick, this.speedMs);
    };
    tick();
  }

  stop() {
    this.playing = false;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
  }

  toggle() {
    if (this.playing) this.stop(); else this.play();
  }
}
