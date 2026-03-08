import { BlurFilter, Container, Sprite, Texture, Ticker } from "pixi.js";
import { TapeSlotModel } from "./TapeSlotModel";
import { SpinResult } from "./SpinController";

// ── Timing ────────────────────────────────────────────────────────────────────
/** Base spin duration for reel 0 (ms). Exported for external reference. */
export const SPIN_DURATION_MS = 1800;

/** Small stagger between reel START times (ms). All reels appear to start together. */
const START_STAGGER_MS = 30;

/**
 * Additional spin time added per reel index, creating sequential stops.
 * Effective stop gap = START_STAGGER_MS + STOP_GAP_MS = 140 ms between each reel.
 *
 *   Wall-clock stop time[i] = i * START_STAGGER_MS + (SPIN_DURATION_MS + i * STOP_GAP_MS)
 *                            = SPIN_DURATION_MS + i * 140 ms
 */
const STOP_GAP_MS = 110;

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

// ── Minimum rotations per reel ────────────────────────────────────────────────
// Each reel completes at least this many full rotations before stopping.
// Combined with per-reel spinDurationMs, produces a realistic wave of stops.
const BASE_ROTATIONS = [2, 2.25, 2.5, 2.75, 3];

// ── Stop bounce ───────────────────────────────────────────────────────────────
// 4-keyframe mechanical drop: 0 → +8 (overshoot) → -3 (rebound) → +1 → 0 (settle)
const BOUNCE_DURATION_MS = 200;
const BOUNCE_O1 = 8; // main downward overshoot (px)
const BOUNCE_R1 = 3; // upward rebound (px)
const BOUNCE_O2 = 1; // secondary micro-bounce (px)

// ── Motion blur ───────────────────────────────────────────────────────────────
const BLUR_FACTOR = 2.0; // strengthY = speedPxMs * BLUR_FACTOR
const MAX_BLUR    = 12;  // cap so symbols remain recognisable at peak speed

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
   *
   * Per-reel phases:
   *   A) Acceleration   — easeOutCubic ramp-up (~12% of spinDuration)
   *   B) Steady spin    — linear, maximum speed (~53%)
   *   C) Deceleration   — easeOutQuart smooth stop (~35%)
   *   D) Bounce/settle  — 4-keyframe mechanical drop (BOUNCE_DURATION_MS)
   *
   * Reels stop left-to-right with a ~140 ms gap between stops.
   *
   * @param onReelStop  Optional hook called when each reel's main spin ends
   *                    (before bounce). Useful for sound cues.
   */
  animate(
    result:      SpinResult,
    onComplete:  () => void,
    onReelStop?: (reelIndex: number) => void,
  ): void {
    const { fromOffsets, toOffsets } = result;
    const reelCount = this.views.length;
    const L = this.model.tapeLength;
    const wrapPos = (n: number): number => ((n % L) + L) % L;

    interface SpriteEntry {
      sprite:    Sprite;
      symbolIdx: number;
    }

    interface ReelState {
      sprites:        SpriteEntry[];
      totalPx:        number;   // total downward pixel travel for this reel
      spinDurationMs: number;   // this reel's spin duration (varies per reel for wave stop)
      prevTotalPx:    number;
      nextTapePos:    number;
      bouncing:       boolean;
      bounceStart:    number;   // performance.now() when bounce began
      blurFilter:     BlurFilter;
    }

    const states: Array<ReelState | null> = [];
    const reelDone = new Array<boolean>(reelCount).fill(false);

    for (let i = 0; i < reelCount; i++) {
      const fromOffset = fromOffsets[i];
      const toOffset   = toOffsets[i];

      // Forward-only delta — always positive (0 for locked reels, 1..L-1 otherwise).
      const forwardDelta = (toOffset - fromOffset + L) % L;

      if (forwardDelta === 0) {
        reelDone[i] = true;
        states.push(null);
        continue;
      }

      const rotBase       = BASE_ROTATIONS[Math.min(i, BASE_ROTATIONS.length - 1)];
      const minSteps      = Math.ceil(rotBase * L);
      const totalSteps    = minSteps + forwardDelta;
      const totalPx       = totalSteps * SLOT_H;
      // Later reels get more time → stop later → sequential wave effect.
      const spinDurationMs = SPIN_DURATION_MS + i * STOP_GAP_MS;

      const view = this.views[i];
      const tape = this.model.reels[i].tape;

      view.aboveSprite.visible  = false;
      view.centerSprite.visible = false;
      view.belowSprite.visible  = false;

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

      // Single BlurFilter instance per reel — updated in-place each frame.
      const blurFilter = new BlurFilter({ strengthX: 0, strengthY: 0, quality: 2 });
      view.symbolsLayer.filters = [blurFilter];

      states.push({
        sprites,
        totalPx,
        spinDurationMs,
        prevTotalPx:  0,
        nextTapePos:  fromOffset + half + 1, // = fromOffset + 3
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

        // ── D) Bounce / settle phase ───────────────────────────────────────────
        if (state.bouncing) {
          const bt     = Math.min((now - state.bounceStart) / BOUNCE_DURATION_MS, 1);
          const offset = bounceCurve(bt);
          view.aboveSprite.y  = Y_ABOVE  + offset;
          view.centerSprite.y = Y_CENTER + offset;
          view.belowSprite.y  = Y_BELOW  + offset;

          if (bt >= 1) {
            view.aboveSprite.y  = Y_ABOVE;
            view.centerSprite.y = Y_CENTER;
            view.belowSprite.y  = Y_BELOW;
            reelDone[i] = true;
          }
          continue;
        }

        // ── A/B/C) Main spin phase ─────────────────────────────────────────────
        const startDelay  = i * START_STAGGER_MS;
        const reelElapsed = elapsed - startDelay;
        if (reelElapsed <= 0) continue;

        const tape = this.model.reels[i].tape;
        const t    = Math.min(reelElapsed / state.spinDurationMs, 1);

        const coveredPx = spinProgress(t) * state.totalPx;
        const movement  = coveredPx - state.prevTotalPx;
        state.prevTotalPx = coveredPx;

        // Blur proportional to instantaneous speed — frame-rate independent.
        const speedPxMs = spinProgressDerivative(t) * state.totalPx / state.spinDurationMs;
        state.blurFilter.strengthY = Math.min(speedPxMs * BLUR_FACTOR, MAX_BLUR);

        for (const entry of state.sprites) {
          entry.sprite.y += movement;

          while (entry.sprite.y > BOTTOM_THRESHOLD) {
            entry.sprite.y -= STRIP_H;
            const pos = wrapPos(state.nextTapePos++);
            entry.symbolIdx = tape[pos];
            entry.sprite.texture = this.indexToTexture(entry.symbolIdx);
          }

          entry.sprite.alpha = spriteAlpha(entry.sprite.y);
        }

        // ── Spin complete → begin bounce ───────────────────────────────────────
        if (t >= 1) {
          // Zero blur — bounce phase uses sharp static sprites.
          state.blurFilter.strengthY = 0;

          // Snap correct final textures; animation sprites go off-screen.
          this.restoreStaticSprites(i, toOffsets[i]);
          for (const entry of state.sprites) {
            entry.sprite.y = -2000;
          }

          // Sound / timing hook.
          onReelStop?.(i);

          state.bouncing    = true;
          state.bounceStart = now;
        }
      }

      // ── All reels settled ─────────────────────────────────────────────────────
      if (reelDone.every(Boolean)) {
        this.ticker.remove(onTick);

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
   * Reversed layout matches downward animation convention:
   *   aboveSprite  → tape[toOffset + 1]  (symbol entering from top)
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
 *   1.0 at centre → 0.4 one slot away → 0.0 two slots away.
 */
function spriteAlpha(y: number): number {
  const dist = Math.abs(y - Y_CENTER);
  if (dist >= SLOT_H * 2) return 0;
  if (dist < SLOT_H)      return 1 - 0.6 * (dist / SLOT_H); // 1.0 → 0.4
  return 0.4 - 0.4 * ((dist - SLOT_H) / SLOT_H);            // 0.4 → 0.0
}

/**
 * 3-phase spin progress mapping t ∈ [0,1] → covered fraction ∈ [0,1].
 *
 *   Phase A (0 → P1):  easeOutCubic ramp-up   (covers W1 of distance)
 *   Phase B (P1 → P2): linear steady           (covers W2 of distance)
 *   Phase C (P2 → 1):  easeOutQuart slow-down  (covers W3 of distance)
 *
 * Strictly monotone — movement is always forward.
 */
function spinProgress(t: number): number {
  const P1 = 0.12, P2 = 0.65;
  const W1 = 0.08, W2 = 0.67;
  const W3 = 1 - W1 - W2; // 0.25

  if (t <= P1) {
    // easeOutCubic: fast start, smooth peak
    const u = t / P1;
    return W1 * (1 - (1 - u) ** 3);
  } else if (t <= P2) {
    return W1 + W2 * ((t - P1) / (P2 - P1));
  } else {
    // easeOutQuart: aggressive slowdown, satisfying catch
    const td = (t - P2) / (1 - P2);
    return W1 + W2 + W3 * (1 - (1 - td) ** 4);
  }
}

/**
 * Derivative of spinProgress (progress-units / normalized-time-unit).
 * Multiply by (totalPx / spinDurationMs) to get px/ms for blur scaling.
 */
function spinProgressDerivative(t: number): number {
  const P1 = 0.12, P2 = 0.65;
  const W1 = 0.08, W2 = 0.67, W3 = 0.25;

  if (t <= P1) {
    const u = t / P1;
    return W1 * 3 * (1 - u) ** 2 / P1;              // easeOutCubic derivative
  } else if (t <= P2) {
    return W2 / (P2 - P1);                           // linear steady (peak)
  } else {
    const td = (t - P2) / (1 - P2);
    return W3 * 4 * (1 - td) ** 3 / (1 - P2);       // easeOutQuart derivative
  }
}

/**
 * Bounce offset (px) for t ∈ [0,1].
 * 4-keyframe mechanical drop: 0 → +8 → -3 → +1 → 0
 *
 *   0–40%:  overshoot downward (eased)
 *  40–65%:  swing back upward past zero to -BOUNCE_R1
 *  65–85%:  micro-bounce back to +BOUNCE_O2
 *  85–100%: settle to 0
 */
function bounceCurve(t: number): number {
  if (t <= 0.40) {
    const u = t / 0.40;
    return BOUNCE_O1 * (1 - (1 - u) ** 2); // ease into overshoot
  } else if (t <= 0.65) {
    const u = (t - 0.40) / 0.25;
    return BOUNCE_O1 * (1 - u) - BOUNCE_R1 * u;
  } else if (t <= 0.85) {
    const u = (t - 0.65) / 0.20;
    return -BOUNCE_R1 * (1 - u) + BOUNCE_O2 * u;
  } else {
    const u = (t - 0.85) / 0.15;
    return BOUNCE_O2 * (1 - u);
  }
}
