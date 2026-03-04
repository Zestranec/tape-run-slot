import {
  Container,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  Assets,
} from "pixi.js";

const BAR_W         = 420;
const BAR_H         = 14;
const BAR_R         = 7;
const BAR_TRACK     = 0x1a1a3a;
const BAR_FILL      = 0x5555ee;
const BAR_BORDER    = 0x3a3a6a;
const LOGO_MAX_W    = 300;
const LOGO_BAR_GAP  = 40;  // px between logo bottom and bar top

const LABEL_STYLE = new TextStyle({
  fontFamily:    "monospace",
  fontSize:      14,
  fill:          0x7777aa,
  fontWeight:    "bold",
  letterSpacing: 2,
});

export class LoadingScreen extends Container {
  private _track:    Graphics;
  private _fill:     Graphics;
  private _progress = 0;

  /**
   * @param logoSrc  Full URL of the logo image.
   *
   * The fetch starts immediately via Assets.load() — no cache warning.
   * The Sprite is added to the container as soon as the texture decodes;
   * bar + label are visible from the very first frame regardless.
   */
  constructor(logoSrc: string) {
    super();

    // ── Loading bar — visible from frame 1 ───────────────────────────────────
    // Bar sits centred at y=40 (logo occupies y < 0 once it loads).
    const barTop = 40;

    this._track = new Graphics();
    this._track.x = -BAR_W / 2;
    this._track.y = barTop;
    this._drawTrack();
    this.addChild(this._track);

    this._fill = new Graphics();
    this._fill.x = -BAR_W / 2;
    this._fill.y = barTop;
    this.addChild(this._fill);

    // ── "LOADING..." label ────────────────────────────────────────────────────
    const label = new Text({ text: "LOADING...", style: LABEL_STYLE });
    label.anchor.set(0.5, 0);
    label.x = 0;
    label.y = barTop + BAR_H + 12;
    this.addChild(label);

    // ── Logo — loaded via Assets pipeline (no cache-miss warning) ────────────
    // Assets.load() starts the browser fetch immediately.  Once the texture is
    // decoded, we build the Sprite and insert it above the bar.
    Assets.load<Sprite["texture"]>(logoSrc).then((texture) => {
      const logo = new Sprite(texture);
      logo.anchor.set(0.5, 0.5);
      logo.eventMode = "none";

      if (logo.texture.width > LOGO_MAX_W) {
        logo.scale.set(LOGO_MAX_W / logo.texture.width);
      }

      // Centre above the bar with LOGO_BAR_GAP between logo bottom and bar top.
      logo.x = 0;
      logo.y = barTop - LOGO_BAR_GAP - logo.height / 2;

      this.addChildAt(logo, 0); // behind bar graphics
    }).catch(() => { /* logo unavailable — bar still works */ });
  }

  /** Update progress bar (0..1). Clamps automatically. */
  setProgress(p: number): void {
    this._progress = Math.max(0, Math.min(1, p));
    this._drawFill();
  }

  /** Centre this container on the canvas. Call on init and resize. */
  layout(canvasW: number, canvasH: number): void {
    this.x = Math.round(canvasW / 2);
    this.y = Math.round(canvasH / 2);
  }

  // ── Private ───────────────────────────────────────────────────────────────────

  private _drawTrack(): void {
    this._track.clear();
    this._track.roundRect(0, 0, BAR_W, BAR_H, BAR_R);
    this._track.fill({ color: BAR_TRACK });
    this._track.stroke({ color: BAR_BORDER, width: 1 });
  }

  private _drawFill(): void {
    this._fill.clear();
    const w = Math.round(BAR_W * this._progress);
    if (w <= 0) return;
    this._fill.roundRect(0, 0, w, BAR_H, BAR_R);
    this._fill.fill({ color: BAR_FILL });
  }
}

// ── Asset loader — bar tracks everything except the logo ──────────────────────

/** URL helper — always uses Vite's BASE_URL for GitHub Pages compat. */
export function logoUrl(): string {
  return `${import.meta.env.BASE_URL}assets/z_logo.png`;
}

/**
 * Load non-logo game assets.  Calls `onProgress(0..1)` as bundles complete.
 *
 * Add future assets here (spritesheets, audio, etc.).
 * When there are no extra assets the promise resolves immediately with p=1
 * and the minimum-duration timer in main.ts fills the wait time.
 */
export async function loadAssets(
  onProgress: (p: number) => void,
): Promise<void> {
  // ── Register additional assets here as the project grows ──────────────────
  const extras: { alias: string; src: string }[] = [
    // e.g. { alias: "spritesheet", src: `${import.meta.env.BASE_URL}assets/sheet.json` },
  ];

  if (extras.length === 0) {
    // Nothing else to load — report full progress straight away.
    onProgress(1);
    return;
  }

  for (const a of extras) Assets.add(a);
  await Assets.load(
    extras.map((a) => a.alias),
    (p: number) => onProgress(p),
  );
}
