import { Container, Sprite, Texture, Ticker } from "pixi.js";
import { TapeSlotModel } from "./TapeSlotModel";
import { SpinResult } from "./SpinController";

/** Total duration of one reel's spin animation (ms). */
export const SPIN_DURATION_MS = 1500;

/** Stagger delay between consecutive reels (ms). */
const STAGGER_MS = 60;

// ── Must match REEL visual constants in main.ts ───────────────────────────────
const REEL_WIDTH  = 120;
const REEL_HEIGHT = 160;
const SLOT_H      = 96;  // one card height; spacing between symbol positions
const Y_ABOVE     = -16; // Y_CENTER - SLOT_H; top 1/3 peeks below mask top
const Y_CENTER    = 80;  // = REEL_HEIGHT / 2
const Y_BELOW     = 176; // Y_CENTER + SLOT_H; bottom 1/3 peeks above mask bottom
const CX          = REEL_WIDTH / 2;

// Symbol sprite dimensions — must match SYMBOL_W / SYMBOL_H in main.ts.
const SYMBOL_W = 96;
const SYMBOL_H = 96;

// ── Endless strip ─────────────────────────────────────────────────────────────
const NUM_SPRITES      = 5;
const STRIP_H          = NUM_SPRITES * SLOT_H; // 480 px — one full loop
const BOTTOM_THRESHOLD = REEL_HEIGHT + SLOT_H;  // 256 px — recycle below here

/** Minimal view interface — keeps ReelAnimator decoupled from main.ts internals. */
export interface ReelViewRef {
  container:    Container;
  aboveSprite:  Sprite;
  centerSprite: Sprite;
  belowSprite:  Sprite;
}

export class ReelAnimator {
  private views:          ReelViewRef[];
  private model:          TapeSlotModel;
  private ticker:         Ticker;
  private indexToTexture: (symbolIdx: number) => Texture;

  constructor(
    views:          ReelViewRef[],
    model:          TapeSlotModel,
    ticker:         Ticker,
    indexToTexture: (symbolIdx: number) => Texture,
  ) {
    this.views          = views;
    this.model          = model;
    this.ticker         = ticker;
    this.indexToTexture = indexToTexture;
  }

  /**
   * Animate all reels downward from fromOffsets to toOffsets.
   * The model is NOT updated here; the caller updates it inside onComplete.
   */
  animate(result: SpinResult, onComplete: () => void): void {
    const { deltas, fromOffsets, toOffsets } = result;
    const reelCount = this.views.length;
    const L = this.model.tapeLength;
    const wrapPos = (n: number): number => ((n % L) + L) % L;

    // ── Per-sprite bookkeeping ────────────────────────────────────────────────
    interface SpriteEntry {
      sprite:    Sprite;
      symbolIdx: number; // current symbol index shown
    }

    // ── Per-reel animation state ──────────────────────────────────────────────
    interface ReelState {
      sprites:     SpriteEntry[];
      /** Next TAPE POSITION (unwrapped integer; apply wrapPos before tape access). */
      nextTapePos: number;
      prevTotalPx: number;
    }

    const states: Array<ReelState | null> = [];
    const reelDone = new Array<boolean>(reelCount).fill(false);

    for (let i = 0; i < reelCount; i++) {
      if (deltas[i] === 0) {
        reelDone[i] = true;
        states.push(null);
        continue;
      }

      const view = this.views[i];
      const from = fromOffsets[i];
      const tape = this.model.reels[i].tape;

      // ── Hide static sprites during animation ──────────────────────────────
      view.aboveSprite.visible  = false;
      view.centerSprite.visible = false;
      view.belowSprite.visible  = false;

      // ── Create 5 animation sprites ────────────────────────────────────────
      //
      // Reversed layout — matches downward motion convention:
      //   k = slot offset from center (negative = above, positive = below)
      //
      //   k=-2  y=-112  tapePos=from+2  (top buffer, next incoming symbols)
      //   k=-1  y=-16   tapePos=from+1  (above in reversed static layout)
      //   k= 0  y= 80   tapePos=from    (center)
      //   k=+1  y=176   tapePos=from-1  (below in reversed static layout)
      //   k=+2  y=272   tapePos=from-2  (bottom buffer, exits first)
      //
      // nextTapePos starts at from+3 (one beyond the topmost sprite's index).
      // When a sprite exits the bottom threshold it is moved to the top and
      // assigned tape[nextTapePos++], carrying the correct upcoming symbol.

      const half = Math.floor(NUM_SPRITES / 2); // 2
      const sprites: SpriteEntry[] = [];

      for (let k = -half; k <= half; k++) {
        const y0      = Y_CENTER + k * SLOT_H;
        const tapePos = wrapPos(from - k);
        const symIdx  = tape[tapePos];

        const sprite = new Sprite(this.indexToTexture(symIdx));
        sprite.anchor.set(0.5);
        sprite.x      = CX;
        sprite.y      = y0;
        sprite.width  = SYMBOL_W;
        sprite.height = SYMBOL_H;
        sprite.alpha  = spriteAlpha(y0);
        view.container.addChild(sprite);
        sprites.push({ sprite, symbolIdx: symIdx });
      }

      states.push({
        sprites,
        nextTapePos: from + half + 1, // from + 3 (unwrapped; wrapPos applied at access)
        prevTotalPx: 0,
      });
    }

    const startTime = performance.now();

    const onTick = (): void => {
      const elapsed = performance.now() - startTime;

      for (let i = 0; i < reelCount; i++) {
        if (reelDone[i]) continue;

        const reelElapsed = elapsed - i * STAGGER_MS;
        if (reelElapsed <= 0) continue;

        const t     = Math.min(reelElapsed / SPIN_DURATION_MS, 1);
        const state = states[i]!;
        const tape  = this.model.reels[i].tape;

        const totalPx  = spinProgress(t) * deltas[i] * SLOT_H;
        const movement = totalPx - state.prevTotalPx;
        state.prevTotalPx = totalPx;

        for (const entry of state.sprites) {
          entry.sprite.y += movement;

          // Recycle: sprite exits bottom → wrap to top with next tape symbol.
          while (entry.sprite.y > BOTTOM_THRESHOLD) {
            entry.sprite.y -= STRIP_H;
            const pos        = wrapPos(state.nextTapePos++);
            entry.symbolIdx  = tape[pos];
            entry.sprite.texture = this.indexToTexture(entry.symbolIdx);
          }

          entry.sprite.alpha = spriteAlpha(entry.sprite.y);
        }

        if (t >= 1) {
          reelDone[i] = true;
          // Restore static sprites with guaranteed correct final content,
          // then move animation sprites off-screen so they don't overlap.
          this.restoreStaticSprites(i, toOffsets[i]);
          for (const entry of state.sprites) {
            entry.sprite.y = -2000;
          }
        }
      }

      if (reelDone.every(Boolean)) {
        this.ticker.remove(onTick);

        // Tear down animation sprites for all animated reels.
        for (let i = 0; i < reelCount; i++) {
          const state = states[i];
          if (!state) continue;
          const view = this.views[i];
          for (const entry of state.sprites) {
            view.container.removeChild(entry.sprite);
            entry.sprite.destroy();
          }
        }

        onComplete();
      }
    };

    this.ticker.add(onTick);
  }

  /**
   * Restore the 3 static sprites with the correct final content.
   * Uses the reversed layout that matches downward animation:
   *   aboveSprite  → tape[toOffset + 1]  (next upcoming symbol)
   *   centerSprite → tape[toOffset]       (result)
   *   belowSprite  → tape[toOffset - 1]  (symbol just passed)
   */
  private restoreStaticSprites(reelIdx: number, toOffset: number): void {
    const L    = this.model.tapeLength;
    const wrap = (n: number) => ((n % L) + L) % L;
    const tape = this.model.reels[reelIdx].tape;
    const view = this.views[reelIdx];

    view.aboveSprite.texture  = this.indexToTexture(tape[wrap(toOffset + 1)]);
    view.centerSprite.texture = this.indexToTexture(tape[wrap(toOffset)]);
    view.belowSprite.texture  = this.indexToTexture(tape[wrap(toOffset - 1)]);

    view.aboveSprite.y     = Y_ABOVE;
    view.centerSprite.y    = Y_CENTER;
    view.belowSprite.y     = Y_BELOW;

    view.aboveSprite.alpha  = 0.4;
    view.centerSprite.alpha = 1.0;
    view.belowSprite.alpha  = 0.4;

    view.aboveSprite.visible  = true;
    view.centerSprite.visible = true;
    view.belowSprite.visible  = true;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Alpha for a sprite at position y:
 *   full brightness at centre → fades to 0 two slots away.
 */
function spriteAlpha(y: number): number {
  const dist = Math.abs(y - Y_CENTER);
  if (dist >= SLOT_H * 2)  return 0;
  if (dist < SLOT_H)       return 1 - 0.6 * (dist / SLOT_H); // 1.0 → 0.4
  return 0.4 - 0.4 * ((dist - SLOT_H) / SLOT_H);             // 0.4 → 0.0
}

/**
 * 3-phase spin progress: quick ease-in → linear steady → cubic ease-out.
 * Maps t ∈ [0, 1] → progress ∈ [0, 1]; monotone, continuous.
 */
function spinProgress(t: number): number {
  const P1 = 0.20, P2 = 0.65;  // phase boundary times
  const W1 = 0.12, W2 = 0.63;  // distance weights for phases 1 & 2
  const W3 = 1 - W1 - W2;      // = 0.25 for decel phase

  if (t <= P1) {
    return W1 * ((t / P1) ** 2);                               // ease-in
  } else if (t <= P2) {
    return W1 + W2 * ((t - P1) / (P2 - P1));                  // linear
  } else {
    const td = (t - P2) / (1 - P2);
    return W1 + W2 + W3 * (1 - (1 - td) ** 3);               // ease-out
  }
}
