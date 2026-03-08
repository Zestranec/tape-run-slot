import { BlurFilter, Container, Sprite, Texture, Ticker } from "pixi.js";
import { TapeSlotModel } from "./TapeSlotModel";
import { SpinResult } from "./SpinController";

/** Per-reel spin duration in ms (excluding stagger delay). */
export const SPIN_DURATION_MS = 2000;

/** Stagger start delay between consecutive reels (ms). */
const STAGGER_MS = 80;

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
const BOTTOM_THRESHOLD = REEL_HEIGHT + SLOT_H; // 256 px — recycle below here

// ── Minimum rotations per reel before stopping ────────────────────────────────
// Guarantees forward-only motion is unambiguous even for small forward deltas.
// Reel i uses BASE_ROTATIONS[i], producing a left-to-right wave stop effect.
const BASE_ROTATIONS = [2, 2.25, 2.5, 2.75, 3];

// ── Stop bounce ───────────────────────────────────────────────────────────────
const BOUNCE_DURATION_MS = 140; // total bounce duration after main spin ends
const BOUNCE_OVERSHOOT   = 6;   // px downward overshoot
const BOUNCE_RETURN      = 3;   // px upward bounce back

// ── Motion blur ───────────────────────────────────────────────────────────────
const BLUR_FACTOR = 2.0; // strengthY = speedPxMs * BLUR_FACTOR
const MAX_BLUR    = 12;  // cap so symbols remain recognisable at high speed

/** Minimal view interface — keeps ReelAnimator decoupled from main.ts internals. */
export interface ReelViewRef {
  container:    Container;
  /** Sub-container for symbol sprites. BlurFilter is applied here during spin. */
  symbolsLayer: Container;
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
   * Animate all reels forward (downward) from fromOffsets to toOffsets.
   * Each reel completes its assigned minimum rotations before stopping.
   * The model is NOT updated here; the caller updates it inside onComplete.
   */
  animate(result: SpinResult, onComplete: () => void): void {
    const { fromOffsets, toOffsets } = result;
    const reelCount = this.views.length;
    const L = this.model.tapeLength;
    const wrapPos = (n: number): number => ((n % L) + L) % L;

    // ── Per-sprite bookkeeping ────────────────────────────────────────────────
    interface SpriteEntry {
      sprite:    Sprite;
      symbolIdx: number;
    }

    // ── Per-reel animation state ──────────────────────────────────────────────
    interface ReelState {
      sprites:     SpriteEntry[];
      totalPx:     number;   // pre-calculated total pixel travel
      prevTotalPx: number;
      nextTapePos: number;
      bouncing:    boolean;
      bounceStart: number;   // timestamp when bounce phase began
      blurFilter:  BlurFilter;
    }

    const states: Array<ReelState | null> = [];
    const reelDone = new Array<boolean>(reelCount).fill(false);

    for (let i = 0; i < reelCount; i++) {
      const fromOffset = fromOffsets[i];
      const toOffset   = toOffsets[i];

      // Forward-only delta: always the positive (downward) distance.
      // Since SpinController guarantees delta = (fromOffset + rawDelta) % L with
      // rawDelta ∈ [1, L-1], forwardDelta is always in [1, L-1] for spinning reels
      // and 0 for locked reels.
      const forwardDelta = (toOffset - fromOffset + L) % L;

      if (forwardDelta === 0) {
        // Locked reel — no animation needed.
        reelDone[i] = true;
        states.push(null);
        continue;
      }

      // Total steps = minimum full rotations + forward delta to target.
      const rotBase    = BASE_ROTATIONS[Math.min(i, BASE_ROTATIONS.length - 1)];
      const minSteps   = Math.ceil(rotBase * L);
      const totalSteps = minSteps + forwardDelta;
      const totalPx    = totalSteps * SLOT_H;

      const view = this.views[i];
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
      //   k=-2  y=-112  tapePos=from+2  (top buffer — incoming symbols)
      //   k=-1  y= -16  tapePos=from+1  (above in reversed static layout)
      //   k= 0  y=  80  tapePos=from    (center)
      //   k=+1  y= 176  tapePos=from-1  (below in reversed static layout)
      //   k=+2  y= 272  tapePos=from-2  (bottom buffer — exits first)
      //
      // nextTapePos starts at from+3 (one past the topmost sprite).
      // Each recycled sprite gets the next upcoming tape symbol.

      const half = Math.floor(NUM_SPRITES / 2); // 2
      const sprites: SpriteEntry[] = [];

      for (let k = -half; k <= half; k++) {
        const y0      = Y_CENTER + k * SLOT_H;
        const tapePos = wrapPos(fromOffset - k);
        const symIdx  = tape[tapePos];

        const sprite = new Sprite(this.indexToTexture(symIdx));
        sprite.anchor.set(0.5);
        sprite.x      = CX;
        sprite.y      = y0;
        sprite.width  = SYMBOL_W;
        sprite.height = SYMBOL_H;
        sprite.alpha  = spriteAlpha(y0);
        view.symbolsLayer.addChild(sprite);
        sprites.push({ sprite, symbolIdx: symIdx });
      }

      // One blur filter per reel, reused every frame — never recreated.
      const blurFilter = new BlurFilter({ strengthX: 0, strengthY: 0, quality: 2 });
      view.symbolsLayer.filters = [blurFilter];

      states.push({
        sprites,
        totalPx,
        prevTotalPx:  0,
        nextTapePos:  fromOffset + half + 1, // = from + 3
        bouncing:     false,
        bounceStart:  0,
        blurFilter,
      });
    }

    const startTime = performance.now();

    const onTick = (): void => {
      const now     = performance.now();
      const elapsed = now - startTime;

      for (let i = 0; i < reelCount; i++) {
        if (reelDone[i]) continue;

        const state = states[i]!;
        const view  = this.views[i];

        // ── Bounce phase ───────────────────────────────────────────────────────
        if (state.bouncing) {
          const bt     = Math.min((now - state.bounceStart) / BOUNCE_DURATION_MS, 1);
          const offset = bounceCurve(bt);
          view.aboveSprite.y  = Y_ABOVE  + offset;
          view.centerSprite.y = Y_CENTER + offset;
          view.belowSprite.y  = Y_BELOW  + offset;

          if (bt >= 1) {
            // Settle to exact final positions.
            view.aboveSprite.y  = Y_ABOVE;
            view.centerSprite.y = Y_CENTER;
            view.belowSprite.y  = Y_BELOW;
            reelDone[i] = true;
          }
          continue;
        }

        // ── Main spin phase ────────────────────────────────────────────────────
        const startDelay  = i * STAGGER_MS;
        const reelElapsed = elapsed - startDelay;
        if (reelElapsed <= 0) continue;

        const tape = this.model.reels[i].tape;
        const t    = Math.min(reelElapsed / SPIN_DURATION_MS, 1);

        const totalPx  = spinProgress(t) * state.totalPx;
        const movement = totalPx - state.prevTotalPx;
        state.prevTotalPx = totalPx;

        // Update blur strength based on instantaneous speed (frame-rate independent).
        const speedPxMs = spinProgressDerivative(t) * state.totalPx / SPIN_DURATION_MS;
        state.blurFilter.strengthY = Math.min(speedPxMs * BLUR_FACTOR, MAX_BLUR);

        for (const entry of state.sprites) {
          entry.sprite.y += movement;

          // Recycle: sprite exits bottom → wrap to top with next tape symbol.
          while (entry.sprite.y > BOTTOM_THRESHOLD) {
            entry.sprite.y -= STRIP_H;
            const pos = wrapPos(state.nextTapePos++);
            entry.symbolIdx = tape[pos];
            entry.sprite.texture = this.indexToTexture(entry.symbolIdx);
          }

          entry.sprite.alpha = spriteAlpha(entry.sprite.y);
        }

        // ── Main spin complete → start bounce ──────────────────────────────────
        if (t >= 1) {
          // Kill blur before bounce — static sprites must be sharp.
          state.blurFilter.strengthY = 0;
          // Snap static sprites to guaranteed-correct final content.
          this.restoreStaticSprites(i, toOffsets[i]);
          // Move animation sprites off-screen so they don't overlap static ones.
          for (const entry of state.sprites) {
            entry.sprite.y = -2000;
          }
          state.bouncing    = true;
          state.bounceStart = now;
        }
      }

      // ── All reels done ─────────────────────────────────────────────────────
      if (reelDone.every(Boolean)) {
        this.ticker.remove(onTick);

        // Destroy animation sprites and remove blur filter.
        for (let i = 0; i < reelCount; i++) {
          const st = states[i];
          if (!st) continue;
          const view = this.views[i];
          view.symbolsLayer.filters = [];
          st.blurFilter.destroy();
          for (const entry of st.sprites) {
            view.symbolsLayer.removeChild(entry.sprite);
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
   *   aboveSprite  → tape[toOffset + 1]  (next symbol entering from top)
   *   centerSprite → tape[toOffset]       (result)
   *   belowSprite  → tape[toOffset - 1]  (symbol just passed center)
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
 * Derivative of spinProgress — instantaneous speed in progress-units per time-unit.
 * Multiply by (totalPx / SPIN_DURATION_MS) to get px/ms.
 */
function spinProgressDerivative(t: number): number {
  const P1 = 0.18, P2 = 0.60;
  const W1 = 0.10, W2 = 0.65, W3 = 0.25;

  if (t <= P1) {
    return (W1 * 2 * t) / (P1 * P1);                       // quadratic accel
  } else if (t <= P2) {
    return W2 / (P2 - P1);                                  // linear steady (peak)
  } else {
    const td = (t - P2) / (1 - P2);
    return W3 * 3 * (1 - td) * (1 - td) / (1 - P2);       // cubic decel
  }
}

/**
 * 3-phase spin progress: quadratic ease-in → linear steady → cubic ease-out.
 * Maps t ∈ [0, 1] → progress ∈ [0, 1]; strictly monotone.
 */
function spinProgress(t: number): number {
  const P1 = 0.18, P2 = 0.60; // phase boundary times
  const W1 = 0.10, W2 = 0.65; // distance weights for accel & steady phases
  const W3 = 1 - W1 - W2;     // = 0.25 for decel phase

  if (t <= P1) {
    return W1 * ((t / P1) ** 2);                             // quadratic ease-in
  } else if (t <= P2) {
    return W1 + W2 * ((t - P1) / (P2 - P1));                // linear steady
  } else {
    const td = (t - P2) / (1 - P2);
    return W1 + W2 + W3 * (1 - (1 - td) ** 3);             // cubic ease-out
  }
}

/**
 * Bounce offset (px) over bounce phase t ∈ [0, 1]:
 *   0 → +OVERSHOOT (downward overshoot) → -RETURN (upward bounce) → 0 (settle)
 */
function bounceCurve(t: number): number {
  if (t <= 0.45) {
    // Overshoot downward: 0 → +BOUNCE_OVERSHOOT
    return BOUNCE_OVERSHOOT * (t / 0.45);
  } else if (t <= 0.75) {
    // Swing back through zero to -BOUNCE_RETURN
    const u = (t - 0.45) / 0.30;
    return BOUNCE_OVERSHOOT * (1 - u) - BOUNCE_RETURN * u;
  } else {
    // Settle: -BOUNCE_RETURN → 0
    const u = (t - 0.75) / 0.25;
    return -BOUNCE_RETURN * (1 - u);
  }
}
