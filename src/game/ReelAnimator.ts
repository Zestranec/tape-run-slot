import { Container, Graphics, Text, Ticker } from "pixi.js";
import { TapeSlotModel } from "./TapeSlotModel";
import { SpinResult } from "./SpinController";

/** Total duration of a single reel's scroll animation, in milliseconds. */
export const SPIN_DURATION_MS = 1200;

/** Delay between each consecutive reel's start, creating a staggered wave. */
const STAGGER_MS = 40;

// These constants must match the reel layout defined in main.ts.
const REEL_WIDTH = 72;
const REEL_HEIGHT = 160;
const ROW_HEIGHT = 50; // vertical gap between Y_ABOVE/Y_CENTER/Y_BELOW
const Y_ABOVE = 30;
const Y_CENTER = 80;
const Y_BELOW = 130;

/** Minimal view interface — keeps ReelAnimator decoupled from main.ts internals. */
export interface ReelViewRef {
  container: Container;
  aboveText: Text;
  centerText: Text;
  belowText: Text;
}

export class ReelAnimator {
  private views: ReelViewRef[];
  private model: TapeSlotModel;
  private ticker: Ticker;
  private indexToText: (idx: number) => string;

  constructor(
    views:       ReelViewRef[],
    model:       TapeSlotModel,
    ticker:      Ticker,
    indexToText: (idx: number) => string = (i) => String(i),
  ) {
    this.views       = views;
    this.model       = model;
    this.ticker      = ticker;
    this.indexToText = indexToText;
  }

  /**
   * Animate all reels from their current (fromOffsets) positions to toOffsets.
   * The animation is purely visual; the model is NOT updated here.
   * onComplete fires after every reel finishes, at which point the caller should
   * apply the final offsets to the model and refresh views.
   */
  animate(result: SpinResult, onComplete: () => void): void {
    const { deltas, fromOffsets, toOffsets } = result;
    const reelCount = this.views.length;
    const L = this.model.tapeLength;
    const wrap = (n: number): number => ((n % L) + L) % L;

    // Per-reel "entry" text (the 4th digit scrolling in from below the window).
    // null for reels with delta=0 (locked) — they need no animation resources.
    const entryTexts: (Text | null)[] = [];
    // Clip masks prevent digits from overflowing the reel window during scroll.
    const clipMasks: (Graphics | null)[] = [];

    // Mark locked (delta=0) reels as immediately done — no animation setup needed.
    const reelDone = new Array<boolean>(reelCount).fill(false);

    for (let i = 0; i < reelCount; i++) {
      if (deltas[i] === 0) {
        // Reel is locked: skip all setup, treat as already finished.
        reelDone[i] = true;
        entryTexts.push(null);
        clipMasks.push(null);
        continue;
      }

      const view = this.views[i];

      const entryText = new Text({ text: "0", style: view.belowText.style });
      entryText.anchor.set(0.5);
      entryText.x = REEL_WIDTH / 2;
      entryText.y = Y_BELOW + ROW_HEIGHT;
      entryText.alpha = 0.4;
      view.container.addChild(entryText);
      entryTexts.push(entryText);

      const mask = new Graphics();
      mask.rect(0, 0, REEL_WIDTH, REEL_HEIGHT);
      mask.fill({ color: 0xffffff });
      view.container.addChild(mask);
      view.container.mask = mask;
      clipMasks.push(mask);
    }
    const startTime = performance.now();

    const onTick = (): void => {
      const elapsed = performance.now() - startTime;

      for (let i = 0; i < reelCount; i++) {
        if (reelDone[i]) continue;

        // Each reel starts STAGGER_MS later than the previous one.
        const reelElapsed = elapsed - i * STAGGER_MS;
        if (reelElapsed <= 0) continue;

        const t = Math.min(reelElapsed / SPIN_DURATION_MS, 1);
        const eased = easeOutCubic(t);

        // scrollProgress in [0, delta] — how many tape steps we've visually scrolled.
        const scrollProgress = eased * deltas[i];
        const step = Math.floor(scrollProgress);
        const frac = scrollProgress - step; // fractional part drives sub-step Y shift

        const from = fromOffsets[i];
        const view = this.views[i];

        // Four digit positions during scroll (tape scrolls upward = offset increases).
        // entryTexts[i] is non-null here: delta=0 reels are marked done before the loop.
        const entry = entryTexts[i]!;
        view.aboveText.text = this.indexToText(this.model.reels[i].tape[wrap(from + step - 1)]);
        view.centerText.text = this.indexToText(this.model.reels[i].tape[wrap(from + step)]);
        view.belowText.text = this.indexToText(this.model.reels[i].tape[wrap(from + step + 1)]);
        entry.text = this.indexToText(this.model.reels[i].tape[wrap(from + step + 2)]);

        // Shift all four items upward by the fractional amount, creating smooth scroll.
        const shift = frac * ROW_HEIGHT;
        view.aboveText.y = Y_ABOVE - shift;
        view.centerText.y = Y_CENTER - shift;
        view.belowText.y = Y_BELOW - shift;
        entry.y = Y_BELOW + ROW_HEIGHT - shift;

        if (t >= 1) {
          reelDone[i] = true;
          // Show final digits directly from the precomputed toOffset so the
          // visual state matches what the model will hold after onComplete snaps it.
          const to = toOffsets[i];
          view.aboveText.text = this.indexToText(this.model.reels[i].tape[wrap(to - 1)]);
          view.centerText.text = this.indexToText(this.model.reels[i].tape[wrap(to)]);
          view.belowText.text = this.indexToText(this.model.reels[i].tape[wrap(to + 1)]);
          view.aboveText.y = Y_ABOVE;
          view.centerText.y = Y_CENTER;
          view.belowText.y = Y_BELOW;
        }
      }

      if (reelDone.every(Boolean)) {
        this.ticker.remove(onTick);

        // Tear down temporary clip masks and entry texts (only for animated reels).
        for (let i = 0; i < reelCount; i++) {
          const mask  = clipMasks[i];
          const entry = entryTexts[i];
          if (mask && entry) {
            const view = this.views[i];
            view.container.mask = null;
            view.container.removeChild(mask);
            view.container.removeChild(entry);
            mask.destroy();
            entry.destroy();
          }
        }

        onComplete();
      }
    };

    this.ticker.add(onTick);
  }
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
