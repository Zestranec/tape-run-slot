import { Container, Graphics, Sprite, Text, TextStyle, Assets } from "pixi.js";

// ── Layout ─────────────────────────────────────────────────────────────────────
const BAR_W        = 420;
const BAR_H        = 14;
const BAR_R        = 7;
const LOGO_MAX_W   = 300;
const LOGO_BAR_GAP = 44;  // px from logo bottom-edge to bar top
const BAR_TOP      = 60;  // bar top-y relative to container origin (positive = down)

// ── Colors ─────────────────────────────────────────────────────────────────────
const BAR_TRACK    = 0x1a1a3a;
const BAR_FILL     = 0x6655ff;
const BAR_BORDER   = 0x3a3a6a;
const GLOW_INNER   = 0x6666ff;
const GLOW_OUTER   = 0x3333bb;

// ── Fake easing parameters ─────────────────────────────────────────────────────
// fakeCap drifts from 0 up to 0.92 at this rate (per ms).
// At 1500 ms the cap reaches ~0.42; at 3000 ms it reaches ~0.84.
const FAKE_DRIFT = 0.00028;

// Lerp base: 0.85 means ~15% per frame at 60 fps, frame-rate independent.
const LERP_BASE = 0.85;

// Glow pulse speed (radians per ms)
const PULSE_SPEED = 0.0022;

// ── Text style ─────────────────────────────────────────────────────────────────
const LABEL_STYLE = new TextStyle({
  fontFamily:    "Arial, sans-serif",
  fontSize:      13,
  fill:          0x6666aa,
  fontWeight:    "bold",
  letterSpacing: 3,
});

// ═══════════════════════════════════════════════════════════════════════════════
export class LoadingScreen extends Container {
  // Progress state
  private _realProgress    = 0;   // set by setRealProgress() from Assets callbacks
  private _displayProgress = 0;   // smoothed, drives the rendered bar
  private _fakeCap         = 0;   // slowly drifts to 0.92 while loading
  private _isComplete      = false;

  // Animation state
  private _time            = 0;
  private _baseScale       = 1;   // logo's fit-scale, set once on load

  // Pixi objects
  private _fill:  Graphics;
  private _glow:  Graphics;
  private _label: Text;
  private _logo:  Sprite | null = null;

  /**
   * @param logoSrc  Full logo URL (`${import.meta.env.BASE_URL}assets/z_logo.png`).
   *
   * The fetch starts immediately via Assets.load() — avoids Pixi cache warnings.
   * Bar + label render from frame 1; logo + glow appear once decoded.
   */
  constructor(logoSrc: string) {
    super();
    this.eventMode = "none"; // never intercept clicks

    // ── Glow ring — inserted first (lowest z-order) ───────────────────────────
    this._glow = new Graphics();
    this._glow.alpha     = 0;
    this._glow.eventMode = "none";
    this.addChild(this._glow);

    // ── Bar track (static, drawn once) ────────────────────────────────────────
    const track = new Graphics();
    track.x         = -BAR_W / 2;
    track.y         = BAR_TOP;
    track.eventMode = "none";
    track.roundRect(0, 0, BAR_W, BAR_H, BAR_R);
    track.fill({ color: BAR_TRACK });
    track.stroke({ color: BAR_BORDER, width: 1 });
    this.addChild(track);

    // ── Bar fill (redrawn every tick) ─────────────────────────────────────────
    this._fill         = new Graphics();
    this._fill.x       = -BAR_W / 2;
    this._fill.y       = BAR_TOP;
    this._fill.eventMode = "none";
    this.addChild(this._fill);

    // ── Label ─────────────────────────────────────────────────────────────────
    this._label           = new Text({ text: "LOADING...  0%", style: LABEL_STYLE });
    this._label.anchor.set(0.5, 0);
    this._label.x         = 0;
    this._label.y         = BAR_TOP + BAR_H + 14;
    this._label.eventMode = "none";
    this.addChild(this._label);

    // ── Logo — fetched immediately, inserted when decoded ─────────────────────
    Assets.load<Sprite["texture"]>(logoSrc)
      .then((texture) => {
        const logo = new Sprite(texture);
        logo.anchor.set(0.5, 0.5);
        logo.eventMode = "none";

        if (texture.width > LOGO_MAX_W) {
          this._baseScale = LOGO_MAX_W / texture.width;
          logo.scale.set(this._baseScale);
        }

        // Place logo above the bar with the configured gap.
        logo.x = 0;
        logo.y = BAR_TOP - LOGO_BAR_GAP - logo.height / 2;

        this.addChildAt(logo, 1); // above glow, below bar
        this._logo = logo;
        this._rebuildGlow();
      })
      .catch(() => { /* logo unavailable — bar still works */ });
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  /**
   * Feed real load progress (0..1) from Assets callbacks.
   * Do not call this when there are no real assets; fakeCap will drive the bar.
   */
  setRealProgress(p: number): void {
    this._realProgress = Math.max(0, Math.min(1, p));
  }

  /**
   * Signal that assets AND the minimum display duration have both been satisfied.
   * After this call, the bar animates smoothly to 100% and `isDisplayDone` → true.
   */
  complete(): void {
    this._isComplete = true;
  }

  /**
   * True when the bar has visually reached 100% after `complete()` was called.
   * Poll this each frame (via ticker) to know when to tear down the loader.
   */
  get isDisplayDone(): boolean {
    return this._isComplete && this._displayProgress >= 0.999;
  }

  /**
   * Drive animations.  Call every frame from `app.ticker`.
   * @param dtMs  Delta time in milliseconds (use `ticker.deltaMS`).
   */
  tick(dtMs: number): void {
    this._time += dtMs;

    // ── Fake cap drift ────────────────────────────────────────────────────────
    // While real loading stalls the cap keeps the bar moving forward,
    // never exceeding 0.92 (so 100% only happens after complete()).
    this._fakeCap = Math.min(0.92, this._fakeCap + dtMs * FAKE_DRIFT);

    // ── Target progress ───────────────────────────────────────────────────────
    const target = this._isComplete
      ? 1.0
      : Math.max(this._realProgress, Math.min(this._fakeCap, 0.92));

    // ── Frame-rate-independent lerp ───────────────────────────────────────────
    // factor ≈ 0.15 at 60 fps, scales correctly at other frame rates.
    const factor = 1 - Math.pow(LERP_BASE, dtMs / 16.67);
    this._displayProgress += (target - this._displayProgress) * factor;
    if (this._displayProgress > 0.9995) this._displayProgress = 1;

    // ── Bar fill ──────────────────────────────────────────────────────────────
    this._drawFill();

    // ── Percent label ─────────────────────────────────────────────────────────
    const raw = Math.floor(this._displayProgress * 100);
    const pct = this._isComplete ? raw : Math.min(99, raw);
    this._label.text = `LOADING...  ${pct}%`;

    // ── Logo glow pulse ───────────────────────────────────────────────────────
    if (this._logo) {
      if (!this._isComplete) {
        const pulse = 0.5 + 0.5 * Math.sin(this._time * PULSE_SPEED);
        this._logo.scale.set(this._baseScale * (1 + 0.018 * pulse));
        this._glow.alpha = 0.12 + 0.22 * pulse;
      } else {
        // Freeze on complete: no more pulsing, glow fades out.
        this._logo.scale.set(this._baseScale);
        this._glow.alpha = Math.max(0, this._glow.alpha - dtMs * 0.006);
      }
    }
  }

  /** Centre the screen on the given canvas dimensions. Call on init and resize. */
  layout(canvasW: number, canvasH: number): void {
    this.x = Math.round(canvasW / 2);
    this.y = Math.round(canvasH / 2);
  }

  // ── Private ───────────────────────────────────────────────────────────────────

  private _drawFill(): void {
    this._fill.clear();
    const w = Math.round(BAR_W * this._displayProgress);
    if (w <= 0) return;

    // Main fill
    this._fill.roundRect(0, 0, w, BAR_H, BAR_R);
    this._fill.fill({ color: BAR_FILL });

    // Shine: thin highlight along the top edge
    if (w > BAR_R * 2) {
      this._fill.roundRect(BAR_R, 1, w - BAR_R * 2, 2, 1);
      this._fill.fill({ color: 0xaaaaff, alpha: 0.40 });
    }
  }

  private _rebuildGlow(): void {
    if (!this._logo) return;
    const cx = 0;
    const cy = this._logo.y;
    // Radius is half the largest logo dimension plus a small margin.
    const r  = Math.max(this._logo.width, this._logo.height) / 2 + 14;

    this._glow.clear();

    // Outer soft ring
    this._glow.circle(cx, cy, r + 10);
    this._glow.stroke({ color: GLOW_OUTER, width: 3 });

    // Inner sharper ring
    this._glow.circle(cx, cy, r);
    this._glow.stroke({ color: GLOW_INNER, width: 5 });
  }
}

// ── Helpers exported for main.ts ──────────────────────────────────────────────

/** Returns the logo URL using Vite's BASE_URL (works on GitHub Pages). */
export function logoUrl(): string {
  return `${import.meta.env.BASE_URL}assets/z_logo.png`;
}

/**
 * Load non-logo game assets, reporting progress 0..1 via `onProgress`.
 * Does NOT call `onProgress` when there is nothing to load — let the fake-cap
 * drive the display bar in that case.
 *
 * Add future assets to the `extras` array as the project grows.
 */
export async function loadAssets(
  onProgress: (p: number) => void,
): Promise<void> {
  const extras: { alias: string; src: string }[] = [
    {
      alias: "cards_atlas",
      src:   `${import.meta.env.BASE_URL}assets/cards_atlas/cards_atlas.json`,
    },
  ];

  if (extras.length === 0) return; // nothing to load; fake-cap handles the bar

  for (const a of extras) Assets.add(a);
  await Assets.load(
    extras.map((a) => a.alias),
    (p: number) => onProgress(p),
  );
}
