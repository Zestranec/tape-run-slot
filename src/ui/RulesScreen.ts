import { Container, Graphics, Text, TextStyle, FederatedPointerEvent } from "pixi.js";

// ── Layout ─────────────────────────────────────────────────────────────────────
const PANEL_W = 560;
const PANEL_H = 560;
const PAD     =  36;

// ── Colors ─────────────────────────────────────────────────────────────────────
const BG_FILL    = 0x07071a;
const BG_STROKE  = 0x3a3a6a;
const BTN_NORMAL = 0x2a2a6a;
const BTN_HOVER  = 0x4444aa;
const BTN_PRESS  = 0x1a1a4a;
const BTN_BORDER = 0x6666cc;

// ── Text styles ────────────────────────────────────────────────────────────────
const TITLE_STYLE = new TextStyle({
  fontFamily:    "Arial, sans-serif",
  fontSize:      26,
  fill:          0xffffff,
  fontWeight:    "bold",
  letterSpacing: 3,
});
const SUB_STYLE = new TextStyle({
  fontFamily:  "Arial, sans-serif",
  fontSize:    14,
  fill:        0x7777aa,
  fontWeight:  "bold",
  letterSpacing: 2,
});
const RULE_STYLE = new TextStyle({
  fontFamily:  "Arial, sans-serif",
  fontSize:    12,
  fill:        0xccccdd,
  wordWrap:    true,
  wordWrapWidth: PANEL_W - PAD * 2 - 20,
  leading:     4,
});
const RULE_NUM_STYLE = new TextStyle({
  fontFamily:  "Arial, sans-serif",
  fontSize:    12,
  fill:        0x6666ff,
  fontWeight:  "bold",
});
const BTN_STYLE = new TextStyle({
  fontFamily:  "Arial, sans-serif",
  fontSize:    16,
  fill:        0xffffff,
  fontWeight:  "bold",
  letterSpacing: 4,
});
const SKIP_STYLE = new TextStyle({
  fontFamily:  "Arial, sans-serif",
  fontSize:    11,
  fill:        0x555577,
});

const RULES: string[] = [
  "You start a run by placing a Bet (+ optional Ante for bonus Actions).",
  "You have Actions (default: 15). Each SPIN costs 1 Action.",
  "Before spinning you can LOCK reels — locked reels hold their digit.",
  "You can NUDGE a reel ±1 step; cost increases with each nudge (fatigue).",
  "After a spin, cards matching your digits turn green (READY). Claim one.",
  "Claiming pays its multiplier × Bet. Tier 2+ cards also grant +1 Action.",
  "You may skip claiming and SPIN again to chase higher-value cards.",
  "The run ends when Actions reach 0. Aim for the highest total win!",
];

const LS_KEY = "tape_run_rules_seen";

/** Returns true if the rules screen has been seen before (localStorage). */
export function rulesAlreadySeen(): boolean {
  try { return localStorage.getItem(LS_KEY) === "1"; }
  catch { return false; }
}

/** Marks the rules screen as seen so it is skipped on next load. */
function markRulesSeen(): void {
  try { localStorage.setItem(LS_KEY, "1"); }
  catch { /* ignore */ }
}

// ═══════════════════════════════════════════════════════════════════════════════
export class RulesScreen extends Container {
  /** Fired when the player clicks PLAY (or the overlay background). */
  onPlay: (() => void) | null = null;

  private _bg:      Graphics;   // full-screen dim overlay
  private _panel:   Container;  // centred card panel
  private _btnBg:   Graphics;

  constructor() {
    super();
    this.eventMode = "static"; // catch all events — nothing falls through while shown

    // ── Full-screen darkening overlay ─────────────────────────────────────────
    this._bg = new Graphics();
    this._bg.eventMode = "none"; // overlay is decorative — panel button handles click
    this.addChild(this._bg);

    // ── Panel ─────────────────────────────────────────────────────────────────
    this._panel = new Container();
    this.addChild(this._panel);

    // Panel background
    const panelBg = new Graphics();
    panelBg.roundRect(0, 0, PANEL_W, PANEL_H, 12);
    panelBg.fill({ color: BG_FILL, alpha: 0.97 });
    panelBg.stroke({ color: BG_STROKE, width: 2 });
    panelBg.eventMode = "none";
    this._panel.addChild(panelBg);

    // ── Title ─────────────────────────────────────────────────────────────────
    const title = new Text({ text: "TAPE RUN SLOT", style: TITLE_STYLE });
    title.anchor.set(0.5, 0);
    title.x = PANEL_W / 2;
    title.y = PAD;
    this._panel.addChild(title);

    const sub = new Text({ text: "HOW TO PLAY", style: SUB_STYLE });
    sub.anchor.set(0.5, 0);
    sub.x = PANEL_W / 2;
    sub.y = PAD + title.height + 6;
    this._panel.addChild(sub);

    // Divider
    const div = new Graphics();
    div.rect(PAD, PAD + title.height + sub.height + 18, PANEL_W - PAD * 2, 1);
    div.fill({ color: 0x2a2a4a });
    div.eventMode = "none";
    this._panel.addChild(div);

    // ── Rule list ─────────────────────────────────────────────────────────────
    const listTop = PAD + title.height + sub.height + 30;
    let   curY    = listTop;

    for (let i = 0; i < RULES.length; i++) {
      // Number badge
      const num = new Text({ text: `${i + 1}`, style: RULE_NUM_STYLE });
      num.anchor.set(0, 0);
      num.x = PAD;
      num.y = curY;
      this._panel.addChild(num);

      // Rule text (indented)
      const rule = new Text({ text: RULES[i], style: RULE_STYLE });
      rule.anchor.set(0, 0);
      rule.x = PAD + 20;
      rule.y = curY;
      this._panel.addChild(rule);

      curY += rule.height + 8;
    }

    // ── PLAY button ───────────────────────────────────────────────────────────
    const BTN_W = 200;
    const BTN_H = 44;
    const BTN_Y = PANEL_H - PAD - BTN_H;

    const btn        = new Container();
    btn.eventMode    = "static";
    btn.cursor       = "pointer";
    btn.x            = (PANEL_W - BTN_W) / 2;
    btn.y            = BTN_Y;

    this._btnBg = new Graphics();
    this._drawBtn(this._btnBg, BTN_NORMAL);
    btn.addChild(this._btnBg);

    const btnLabel = new Text({ text: "PLAY", style: BTN_STYLE });
    btnLabel.anchor.set(0.5, 0.5);
    btnLabel.x = BTN_W / 2;
    btnLabel.y = BTN_H / 2;
    btn.addChild(btnLabel);

    btn.on("pointerover",  () => this._drawBtn(this._btnBg, BTN_HOVER));
    btn.on("pointerout",   () => this._drawBtn(this._btnBg, BTN_NORMAL));
    btn.on("pointerdown",  () => this._drawBtn(this._btnBg, BTN_PRESS));
    btn.on("pointerup",    (e: FederatedPointerEvent) => {
      e.stopPropagation();
      this._drawBtn(this._btnBg, BTN_HOVER);
      this._firePlay();
    });
    this._panel.addChild(btn);

    // "SKIP" micro-link below button
    const skip = new Text({ text: "already know the rules — skip", style: SKIP_STYLE });
    skip.anchor.set(0.5, 0);
    skip.x           = PANEL_W / 2;
    skip.y           = BTN_Y + BTN_H + 8;
    skip.eventMode   = "static";
    skip.cursor      = "pointer";
    skip.on("pointerup", (e: FederatedPointerEvent) => { e.stopPropagation(); this._firePlay(); });
    this._panel.addChild(skip);
  }

  // ── Public ────────────────────────────────────────────────────────────────────

  /** Call whenever the canvas resizes to recentre everything. */
  layout(canvasW: number, canvasH: number): void {
    // Stretch dark overlay to fill the whole canvas.
    this._bg.clear();
    this._bg.rect(0, 0, canvasW, canvasH);
    this._bg.fill({ color: 0x000000, alpha: 0.72 });

    // Centre the panel.
    this._panel.x = Math.round((canvasW - PANEL_W) / 2);
    this._panel.y = Math.round((canvasH - PANEL_H) / 2);
  }

  // ── Private ───────────────────────────────────────────────────────────────────

  private _drawBtn(g: Graphics, color: number): void {
    const BTN_W = 200, BTN_H = 44;
    g.clear();
    g.roundRect(0, 0, BTN_W, BTN_H, 8);
    g.fill({ color });
    g.stroke({ color: BTN_BORDER, width: 2 });
  }

  private _firePlay(): void {
    markRulesSeen();
    this.onPlay?.();
  }
}
