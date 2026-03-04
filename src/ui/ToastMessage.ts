import { Container, Graphics, Text, TextStyle, Ticker } from "pixi.js";

// ── Animation timing ─────────────────────────────────────────────────────────
const FADE_IN_MS  = 120;
const FADE_OUT_MS = 200;

// ── Visual style ─────────────────────────────────────────────────────────────
const TOAST_STYLE = new TextStyle({
  fontFamily: "Arial, sans-serif",
  fontSize: 15,
  fill: 0xffffff,
  fontWeight: "bold",
});

export interface ToastOptions {
  /** Total visible time in ms (fade-in + hold + fade-out). Min 320. */
  duration?: number;
}

/**
 * Single-instance toast widget.
 *
 * Place `container` in the scene once; call `show()` whenever needed.
 * Calling `show()` while a previous toast is still animating will immediately
 * replace it with the new message (no queuing).
 *
 * The container is ALWAYS non-interactive — it never absorbs pointer events.
 */
export class ToastMessage {
  /** Add this to your scene. Position it and set x/y once. */
  readonly container: Container;

  private readonly label:    Text;
  private readonly bg:       Graphics;
  private readonly ticker:   Ticker;
  private          tickerFn: (() => void) | null = null;

  constructor(ticker: Ticker) {
    this.ticker = ticker;

    this.container           = new Container();
    this.container.eventMode = "none";  // never absorbs pointer events
    this.container.alpha     = 0;
    this.container.visible   = false;

    this.bg           = new Graphics();
    this.bg.eventMode = "none";
    this.container.addChild(this.bg);

    this.label = new Text({ text: "", style: TOAST_STYLE });
    this.label.anchor.set(0.5, 0.5);  // centred on container origin
    this.container.addChild(this.label);
  }

  /**
   * Display `text` with a fade-in (+ scale-pop) → hold → fade-out sequence.
   * Any ongoing animation is cancelled and replaced immediately.
   */
  show(text: string, opts: ToastOptions = {}): void {
    const duration = Math.max(320, opts.duration ?? 1000);
    const safeHold = Math.max(0, duration - FADE_IN_MS - FADE_OUT_MS);

    // Cancel any previous tick listener
    if (this.tickerFn !== null) {
      this.ticker.remove(this.tickerFn);
      this.tickerFn = null;
    }

    // Update text content
    this.label.text = text;

    // Refit background pill to the current text dimensions
    const PAD_X = 18, PAD_Y = 8;
    const tw = this.label.width;
    const th = this.label.height;
    this.bg.clear();
    this.bg.roundRect(
      Math.round(-tw / 2) - PAD_X,
      Math.round(-th / 2) - PAD_Y,
      Math.round(tw) + PAD_X * 2,
      Math.round(th) + PAD_Y * 2,
      8,
    );
    this.bg.fill({ color: 0x08081e, alpha: 0.86 });
    this.bg.stroke({ color: 0x5555cc, width: 1 });

    // Reset state and reveal
    this.container.alpha     = 0;
    this.container.scale.set(1.15); // starting scale for pop
    this.container.visible   = true;

    const startTime = performance.now();

    const onTick = (): void => {
      const elapsed = performance.now() - startTime;

      if (elapsed < FADE_IN_MS) {
        // Fade in + scale pop: 1.15 → 1.0
        const t = elapsed / FADE_IN_MS;
        this.container.alpha = t;
        this.container.scale.set(1.15 - 0.15 * t);

      } else if (elapsed < FADE_IN_MS + safeHold) {
        // Hold at full opacity
        this.container.alpha = 1;
        this.container.scale.set(1);

      } else if (elapsed < FADE_IN_MS + safeHold + FADE_OUT_MS) {
        // Fade out
        const t = (elapsed - FADE_IN_MS - safeHold) / FADE_OUT_MS;
        this.container.alpha = 1 - t;

      } else {
        // Finished — hide and clean up
        this.container.alpha   = 0;
        this.container.visible = false;
        this.container.scale.set(1);
        this.ticker.remove(onTick);
        this.tickerFn = null;
      }
    };

    this.tickerFn = onTick;
    this.ticker.add(onTick);
  }
}
