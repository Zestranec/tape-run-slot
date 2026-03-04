import {
  Container,
  Graphics,
  Text,
  TextStyle,
  FederatedPointerEvent,
} from "pixi.js";
import { GameState } from "../core/GameStateMachine";
import { RunController } from "../game/RunController";
import { EconomyController } from "../game/EconomyController";

// ─────────────────────────────────────────────────────────────────────────────
// Layout
// ─────────────────────────────────────────────────────────────────────────────
const PANEL_W     = 700;
const SPIN_BTN_W  = 116;
const SPIN_BTN_H  = 60;
const PANEL_H     = SPIN_BTN_H + 28; // 88 — tall enough to hold 2 HUD rows + spin button

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const HUD_LABEL = new TextStyle({ fontFamily: "monospace", fontSize: 13, fill: 0x9999bb });
const HUD_VAL   = new TextStyle({ fontFamily: "monospace", fontSize: 13, fill: 0xffffff, fontWeight: "bold" });
const WIN_VAL   = new TextStyle({ fontFamily: "monospace", fontSize: 13, fill: 0xffcc00, fontWeight: "bold" });
const ACT_OK    = new TextStyle({ fontFamily: "monospace", fontSize: 13, fill: 0x44ff88, fontWeight: "bold" });
const ACT_LOW   = new TextStyle({ fontFamily: "monospace", fontSize: 13, fill: 0xff9944, fontWeight: "bold" });
const ACT_ZERO  = new TextStyle({ fontFamily: "monospace", fontSize: 13, fill: 0xff2222, fontWeight: "bold" });
const SPIN_TXT  = new TextStyle({ fontFamily: "monospace", fontSize: 22, fill: 0xffffff, fontWeight: "bold" });

// ─────────────────────────────────────────────────────────────────────────────

function setDisabled(c: Container, disabled: boolean): void {
  c.alpha     = disabled ? 0.35 : 1.0;
  c.eventMode = disabled ? "none" : "static";
  c.cursor    = disabled ? "default" : "pointer";
}

// ─────────────────────────────────────────────────────────────────────────────
/**
 * RunPanel — compact HUD + SPIN button shown below the reels during a run.
 *
 * Layout (PANEL_W = 700):
 *   Left column  (x=14):   two info rows (Bet/Win, Claimed/Actions)
 *   Right column (x=572):  tall SPIN button
 *
 * Visibility: hidden during "betting" state, shown otherwise.
 * Managed externally via applyVisibility() in main.ts.
 */
export class RunPanel extends Container {
  static readonly PANEL_H = PANEL_H;

  private run: RunController;
  private economy: EconomyController;
  private onSpin: () => void;

  private betText!:     Text;
  private winText!:     Text;
  private claimedText!: Text;
  private actionsText!: Text;
  private spinBtn!:     Container;
  private spinBg!:      Graphics;

  constructor(
    run: RunController,
    economy: EconomyController,
    onSpin: () => void,
  ) {
    super();
    this.run     = run;
    this.economy = economy;
    this.onSpin  = onSpin;
    this.build();
  }

  // ── Build ──────────────────────────────────────────────────────────────────
  private build(): void {
    const X = 14;

    // Background — decoration only, must not absorb pointer events
    const bg = new Graphics();
    bg.roundRect(0, 0, PANEL_W, PANEL_H, 8);
    bg.fill({ color: 0x16162e, alpha: 0.95 });
    bg.stroke({ color: 0x36365a, width: 1 });
    bg.eventMode = "none";
    this.addChild(bg);

    // ── HUD rows (left of SPIN button) ────────────────────────────────────
    const SPIN_AREA_LEFT = PANEL_W - SPIN_BTN_W - X; // 572
    const ROW1_Y = Math.round((PANEL_H / 2) - 24);
    const ROW2_Y = ROW1_Y + 26;

    // Row 1: Bet / Win
    this.addChild(Object.assign(new Text({ text: "Bet:", style: HUD_LABEL }), { x: X, y: ROW1_Y }));
    this.betText = Object.assign(new Text({ text: "—", style: HUD_VAL }), { x: X + 34, y: ROW1_Y });
    this.addChild(this.betText);

    this.addChild(Object.assign(new Text({ text: "Win:", style: HUD_LABEL }), { x: X + 160, y: ROW1_Y }));
    this.winText = Object.assign(new Text({ text: "—", style: WIN_VAL }), { x: X + 196, y: ROW1_Y });
    this.addChild(this.winText);

    // Row 2: Claimed / Actions
    this.addChild(Object.assign(new Text({ text: "Claimed:", style: HUD_LABEL }), { x: X, y: ROW2_Y }));
    this.claimedText = Object.assign(new Text({ text: "0 / 20", style: HUD_VAL }), { x: X + 70, y: ROW2_Y });
    this.addChild(this.claimedText);

    this.addChild(Object.assign(new Text({ text: "Actions:", style: HUD_LABEL }), { x: X + 160, y: ROW2_Y }));
    this.actionsText = Object.assign(new Text({ text: "—", style: ACT_OK }), { x: X + 232, y: ROW2_Y });
    this.addChild(this.actionsText);

    // Thin vertical divider before spin button
    const div = new Graphics();
    div.moveTo(0, 8); div.lineTo(0, PANEL_H - 8);
    div.stroke({ color: 0x3a3a5a, width: 1 });
    div.x = SPIN_AREA_LEFT - 14;
    this.addChild(div);

    // ── SPIN button ──────────────────────────────────────────────────────
    this.spinBtn = new Container();
    this.spinBtn.x = SPIN_AREA_LEFT;
    this.spinBtn.y = Math.round((PANEL_H - SPIN_BTN_H) / 2);
    this.spinBtn.eventMode = "static";
    this.spinBtn.cursor    = "pointer";

    this.spinBg = new Graphics();
    this.spinBg.roundRect(0, 0, SPIN_BTN_W, SPIN_BTN_H, 8);
    this.spinBg.fill({ color: 0x1a4a1a });
    this.spinBg.stroke({ color: 0x44cc44, width: 2 });
    this.spinBtn.addChild(this.spinBg);

    const spinLabel = new Text({ text: "SPIN", style: SPIN_TXT });
    spinLabel.anchor.set(0.5);
    spinLabel.x = SPIN_BTN_W / 2;
    spinLabel.y = SPIN_BTN_H / 2;
    this.spinBtn.addChild(spinLabel);

    this.spinBtn.on("pointerdown", (e: FederatedPointerEvent) => { e.stopPropagation(); this.onSpin(); });
    this.spinBtn.on("pointerover", () => { this.spinBg.tint = 0x88ff88; });
    this.spinBtn.on("pointerout",  () => { this.spinBg.tint = 0xffffff; });
    this.addChild(this.spinBtn);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Update displayed values. Called after every reel refresh and claim. */
  refresh(totalWin: number, claimedCount: number): void {
    this.betText.text     = `${this.economy.baseBet} FUN`;
    this.winText.text     = `${totalWin.toFixed(2)} FUN`;
    this.claimedText.text = `${claimedCount} / 20`;

    const acts = this.run.actions;
    const max  = this.run.maxActions;
    this.actionsText.text  = `${acts} / ${max}`;
    this.actionsText.style =
      acts === 0 ? ACT_ZERO :
      acts <= 4  ? ACT_LOW  :
                   ACT_OK;
  }

  /** Enable / disable SPIN based on FSM state. Does NOT control panel visibility. */
  syncState(state: GameState): void {
    // SPIN is active only in idle; disabled during animation and ended.
    setDisabled(this.spinBtn, state !== "idle");
  }
}
