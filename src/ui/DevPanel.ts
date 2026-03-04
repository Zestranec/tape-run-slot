import { Container, Graphics, Text, TextStyle, FederatedPointerEvent } from "pixi.js";
import { TapeSlotModel } from "../game/TapeSlotModel";
import { GameStateMachine, GameState } from "../core/GameStateMachine";
import { RunController } from "../game/RunController";
import { RNG } from "../core/RNG";

// ── Shared text styles ─────────────────────────────────────────────────────────
const LABEL_STYLE        = new TextStyle({ fontFamily: "monospace", fontSize: 14, fill: 0xcccccc });
const VALUE_STYLE        = new TextStyle({ fontFamily: "monospace", fontSize: 14, fill: 0xffffff, fontWeight: "bold" });
const BTN_STYLE          = new TextStyle({ fontFamily: "monospace", fontSize: 13, fill: 0xffffff });
const HEADING_STYLE      = new TextStyle({ fontFamily: "monospace", fontSize: 16, fill: 0xffcc00, fontWeight: "bold" });
const HINT_STYLE         = new TextStyle({ fontFamily: "monospace", fontSize: 11, fill: 0x888888 });
const SPIN_DELTA_STYLE   = new TextStyle({ fontFamily: "monospace", fontSize: 14, fill: 0x88ff88 });
const LOCKS_VALUE_STYLE  = new TextStyle({ fontFamily: "monospace", fontSize: 14, fill: 0xffaa00, fontWeight: "bold" });
const ACTIONS_OK_STYLE   = new TextStyle({ fontFamily: "monospace", fontSize: 14, fill: 0xffffff, fontWeight: "bold" });
const ACTIONS_LOW_STYLE  = new TextStyle({ fontFamily: "monospace", fontSize: 14, fill: 0xff6644, fontWeight: "bold" });
const ACTIONS_ZERO_STYLE = new TextStyle({ fontFamily: "monospace", fontSize: 14, fill: 0xff2222, fontWeight: "bold" });
const STATUS_OK_STYLE    = new TextStyle({ fontFamily: "monospace", fontSize: 13, fill: 0x44ff88 });
const STATUS_END_STYLE   = new TextStyle({ fontFamily: "monospace", fontSize: 13, fill: 0xff3333 });

// ── Generic button factory ─────────────────────────────────────────────────────
interface BtnColors { fill?: number; stroke?: number; hoverTint?: number; }

function makeButton(
  label: string, w: number, h: number,
  onClick: () => void, colors: BtnColors = {}
): Container {
  const { fill = 0x444466, stroke = 0x6666aa, hoverTint = 0xaaaaff } = colors;
  const c = new Container();
  c.eventMode = "static";
  c.cursor = "pointer";
  const bg = new Graphics();
  bg.roundRect(0, 0, w, h, 4); bg.fill({ color: fill }); bg.stroke({ color: stroke, width: 1 });
  c.addChild(bg);
  const txt = new Text({ text: label, style: BTN_STYLE });
  txt.x = Math.round((w - txt.width) / 2);
  txt.y = Math.round((h - txt.height) / 2);
  c.addChild(txt);
  c.on("pointerdown", (e: FederatedPointerEvent) => { e.stopPropagation(); onClick(); });
  c.on("pointerover",  () => { bg.tint = hoverTint; });
  c.on("pointerout",   () => { bg.tint = 0xffffff;  });
  return c;
}

// ── Lock-toggle button ─────────────────────────────────────────────────────────
interface LockToggleBtn { container: Container; setActive: (locked: boolean) => void; }
const LOCK_BTN_W = 36, LOCK_BTN_H = 26;

function makeLockToggleButton(label: string, onClick: () => void): LockToggleBtn {
  const c = new Container();
  c.eventMode = "static";
  c.cursor = "pointer";
  const bg = new Graphics();
  c.addChild(bg);
  const txt = new Text({ text: label, style: BTN_STYLE });
  txt.anchor.set(0.5);
  txt.x = LOCK_BTN_W / 2; txt.y = LOCK_BTN_H / 2;
  c.addChild(txt);
  const redraw = (locked: boolean) => {
    bg.clear();
    bg.roundRect(0, 0, LOCK_BTN_W, LOCK_BTN_H, 4);
    if (locked) { bg.fill({ color: 0x3a2200 }); bg.stroke({ color: 0xffaa00, width: 1 }); }
    else        { bg.fill({ color: 0x222233 }); bg.stroke({ color: 0x555566, width: 1 }); }
  };
  redraw(false);
  c.on("pointerdown", (e: FederatedPointerEvent) => { e.stopPropagation(); onClick(); });
  c.on("pointerover",  () => { bg.tint = 0xddddff; });
  c.on("pointerout",   () => { bg.tint = 0xffffff; });
  return { container: c, setActive: redraw };
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function setDisabled(btn: Container, disabled: boolean): void {
  btn.alpha     = disabled ? 0.35 : 1.0;
  btn.eventMode = disabled ? "none" : "static";
  btn.cursor    = disabled ? "default" : "pointer";
}

// ── DevPanel ───────────────────────────────────────────────────────────────────
export class DevPanel extends Container {
  private model: TapeSlotModel;
  private fsm: GameStateMachine;
  private run: RunController;
  private seedValue: number;
  private selectedReel = 0;

  // ── Text readouts ──
  private seedText!: Text;
  private offsetsText!: Text;
  private visibleText!: Text;
  private lengthText!: Text;
  private selectedReelText!: Text;
  private lastSpinText!: Text;
  private locksText!: Text;
  private actionsText!: Text;
  private nudgeCostText!: Text;
  private runStatusText!: Text;

  // ── Callbacks ──
  private onAction: () => void;
  private onSeedRebuild?: () => void;
  private onSpin?: () => void;
  private onNewRun?: () => void;

  private randomCounter = 0;

  /**
   * Game buttons — disabled during animation (running/resolve) AND when run is ended.
   * SPIN, nudge up/down, lock toggles, Reset Locks, reel <>, Randomize/Reset offsets.
   */
  private lockableButtons: Container[] = [];

  /**
   * Seed/meta buttons — disabled ONLY during animation.
   * Seed ±1/+10, Apply Seed, New Run.
   */
  private seedButtons: Container[] = [];

  /** Stateful lock-toggle buttons — one per reel. */
  private lockBtns: LockToggleBtn[] = [];

  constructor(
    model: TapeSlotModel,
    fsm: GameStateMachine,
    run: RunController,
    onAction: () => void,
    onSeedRebuild?: () => void,
    onSpin?: () => void,
    onNewRun?: () => void,
  ) {
    super();
    this.model = model;
    this.fsm = fsm;
    this.run = run;
    this.seedValue = model.seed;
    this.onAction = onAction;
    this.onSeedRebuild = onSeedRebuild;
    this.onSpin = onSpin;
    this.onNewRun = onNewRun;
    this.build();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Register as game button (locked during animation + ended). */
  private regGame(btn: Container): Container {
    this.lockableButtons.push(btn);
    this.addChild(btn);
    return btn;
  }

  /** Register as seed/meta button (locked during animation only). */
  private regSeed(btn: Container): Container {
    this.seedButtons.push(btn);
    this.addChild(btn);
    return btn;
  }

  /**
   * Guard for instant game actions that require idle state.
   * Seeds/meta actions skip this and use their own guard.
   */
  private guardAction(fn: () => void): void {
    if (this.fsm.state !== "idle") return;
    this.fsm.runInstant();
    fn();
    this.onAction();
  }

  /**
   * Guard for seed/meta actions — allowed in idle or ended, blocked during animation.
   */
  private guardSeedAction(fn: () => void): void {
    if (this.fsm.state === "running" || this.fsm.state === "resolve") return;
    fn();
    this.onAction();
  }

  /** Apply a nudge: check actions economy, spend, update model, check for run end. */
  private doNudge(direction: -1 | 1): void {
    if (this.fsm.state !== "idle") return;  // blocked during animation or ended state

    const cost = this.run.getNudgeCost();
    if (!this.run.canSpend(cost)) return;

    // Commit: spend → record (increments nudgeCount) → apply model change
    this.run.spend(cost);
    this.run.recordNudge();
    this.model.reels[this.selectedReel].nudge(direction);

    this.refreshInfo();
    this.onAction(); // refreshes reel views + overlays in main.ts

    // Transition to "ended" if the nudge consumed the last action.
    if (this.run.actions === 0) {
      this.fsm.transition("ended");
    }
  }

  // ── Build ──────────────────────────────────────────────────────────────────
  private build(): void {
    const PANEL_W = 700;
    const PANEL_H = 290;
    const X = 14;

    const bg = new Graphics();
    bg.roundRect(0, 0, PANEL_W, PANEL_H, 8);
    bg.fill({ color: 0x1a1a3e, alpha: 0.95 });
    bg.stroke({ color: 0x3a3a6e, width: 2 });
    this.addChild(bg);

    let y = 10;

    // ── Heading ────────────────────────────────────────────────────────────────
    this.addChild(Object.assign(new Text({ text: "DEV CONTROL PANEL", style: HEADING_STYLE }), { x: X, y }));
    y += 26;

    // ── Row: actions + nudge cost + run status ─────────────────────────────────
    this.addChild(Object.assign(new Text({ text: "Actions:", style: LABEL_STYLE }), { x: X, y }));
    this.actionsText = Object.assign(
      new Text({ text: `${this.run.actions} / ${RunController.MAX_ACTIONS}`, style: ACTIONS_OK_STYLE }),
      { x: X + 72, y }
    );
    this.addChild(this.actionsText);

    this.addChild(Object.assign(new Text({ text: "Next nudge:", style: LABEL_STYLE }), { x: X + 180, y }));
    this.nudgeCostText = Object.assign(
      new Text({ text: `${this.run.getNudgeCost()} ⚡`, style: VALUE_STYLE }),
      { x: X + 280, y }
    );
    this.addChild(this.nudgeCostText);

    this.runStatusText = Object.assign(
      new Text({ text: "ACTIVE", style: STATUS_OK_STYLE }),
      { x: X + 370, y }
    );
    this.addChild(this.runStatusText);
    y += 20;

    // ── Row: seed + tape length ────────────────────────────────────────────────
    this.addChild(Object.assign(new Text({ text: "Seed:",     style: LABEL_STYLE }), { x: X,       y }));
    this.seedText   = Object.assign(new Text({ text: String(this.seedValue), style: VALUE_STYLE }), { x: X + 50,  y });
    this.addChild(this.seedText);
    this.addChild(Object.assign(new Text({ text: "L:",        style: LABEL_STYLE }), { x: X + 160, y }));
    this.lengthText = Object.assign(new Text({ text: String(this.model.tapeLength), style: VALUE_STYLE }), { x: X + 180, y });
    this.addChild(this.lengthText);
    y += 20;

    // ── Row: offsets ───────────────────────────────────────────────────────────
    this.addChild(Object.assign(new Text({ text: "Offsets:",  style: LABEL_STYLE }), { x: X, y }));
    this.offsetsText = Object.assign(new Text({ text: this.model.getOffsets().join(", "), style: VALUE_STYLE }), { x: X + 80, y });
    this.addChild(this.offsetsText);
    y += 20;

    // ── Row: visible digits ────────────────────────────────────────────────────
    this.addChild(Object.assign(new Text({ text: "Visible:",  style: LABEL_STYLE }), { x: X, y }));
    this.visibleText = Object.assign(new Text({ text: this.model.getVisibleString(), style: VALUE_STYLE }), { x: X + 80, y });
    this.addChild(this.visibleText);
    y += 20;

    // ── Row: last spin deltas + locks state ────────────────────────────────────
    this.addChild(Object.assign(new Text({ text: "Last spin:", style: LABEL_STYLE }), { x: X, y }));
    this.lastSpinText = Object.assign(new Text({ text: "—", style: SPIN_DELTA_STYLE }), { x: X + 90, y });
    this.addChild(this.lastSpinText);

    this.addChild(Object.assign(new Text({ text: "Locks:", style: LABEL_STYLE }), { x: X + 340, y }));
    this.locksText = Object.assign(
      new Text({ text: this.model.getLockStates().map(l => l ? "1" : "0").join(" "), style: LOCKS_VALUE_STYLE }),
      { x: X + 395, y }
    );
    this.addChild(this.locksText);
    y += 22;

    // ── Row: lock toggle buttons ───────────────────────────────────────────────
    for (let i = 0; i < 7; i++) {
      const reelIdx = i;
      const lb = makeLockToggleButton(String(i + 1), () => {
        if (this.fsm.state !== "idle") return;
        this.model.toggleLocked(reelIdx);
        lb.setActive(this.model.isLocked(reelIdx));
        this.locksText.text = this.model.getLockStates().map(l => l ? "1" : "0").join(" ");
        this.onAction();
      });
      lb.container.x = X + i * (LOCK_BTN_W + 4);
      lb.container.y = y;
      this.lockableButtons.push(lb.container);
      this.addChild(lb.container);
      this.lockBtns.push(lb);
    }

    const bResetLocks = makeButton("Reset Locks", 96, LOCK_BTN_H, () => {
      if (this.fsm.state !== "idle") return;
      this.model.resetLocks();
      this.onAction();
    }, { fill: 0x2a1a00, stroke: 0x996600, hoverTint: 0xffcc88 });
    bResetLocks.x = X + 7 * (LOCK_BTN_W + 4) + 8; bResetLocks.y = y;
    this.lockableButtons.push(bResetLocks);
    this.addChild(bResetLocks);
    y += 34;

    // ── Row: seed controls ─────────────────────────────────────────────────────
    const seedAction = (delta: number) => () => {
      this.seedValue = Math.max(0, this.seedValue + delta);
      this.model.rebuildFromSeed(this.seedValue);
      this.randomCounter = 0;
      this.onSeedRebuild?.();
    };

    const addSeedBtn = (label: string, w: number, fn: () => void, dx: number) => {
      const btn = this.regSeed(makeButton(label, w, 26, () => this.guardSeedAction(fn)));
      btn.x = X + dx; btn.y = y;
    };
    addSeedBtn("Seed -1",    70, seedAction(-1),  0);
    addSeedBtn("Seed +1",    70, seedAction(+1),  78);
    addSeedBtn("Seed +10",   76, seedAction(+10), 156);
    addSeedBtn("Apply Seed", 96, () => {
      this.model.rebuildFromSeed(this.seedValue);
      this.randomCounter = 0;
      this.onSeedRebuild?.();
    }, 240);

    this.addChild(Object.assign(new Text({ text: "(Seed ±1/+10 to change)", style: HINT_STYLE }), { x: X + 345, y: y + 6 }));
    y += 36;

    // ── Row: reel controls ─────────────────────────────────────────────────────
    this.addChild(Object.assign(new Text({ text: "Reel:", style: LABEL_STYLE }), { x: X, y: y + 4 }));
    this.selectedReelText = Object.assign(new Text({ text: "1", style: VALUE_STYLE }), { x: X + 50, y: y + 4 });
    this.addChild(this.selectedReelText);

    const bPrev = this.regGame(makeButton("<", 28, 26, () => { this.selectedReel = (this.selectedReel + 6) % 7; this.refreshInfo(); }));
    bPrev.x = X + 72; bPrev.y = y;
    const bNext = this.regGame(makeButton(">", 28, 26, () => { this.selectedReel = (this.selectedReel + 1) % 7; this.refreshInfo(); }));
    bNext.x = X + 106; bNext.y = y;

    // Nudge buttons: use doNudge which handles RunController economy.
    const bNudgeUp   = this.regGame(makeButton("Nudge Up",   86, 26, () => this.doNudge(-1)));
    bNudgeUp.x = X + 150; bNudgeUp.y = y;
    const bNudgeDown = this.regGame(makeButton("Nudge Down", 100, 26, () => this.doNudge(+1)));
    bNudgeDown.x = X + 244; bNudgeDown.y = y;
    y += 36;

    // ── Row: utility + SPIN + New Run ──────────────────────────────────────────
    const bRand = this.regGame(makeButton("Randomize Offsets", 156, 26, () => this.guardAction(() => {
      this.randomCounter++;
      this.model.randomizeOffsets(new RNG(this.seedValue * 9999 + this.randomCounter));
    })));
    bRand.x = X; bRand.y = y;

    const bReset = this.regGame(makeButton("Reset Offsets to 0", 160, 26, () => this.guardAction(() => this.model.resetOffsets())));
    bReset.x = X + 166; bReset.y = y;

    // New Run — available in idle AND ended (only blocked during animation).
    const bNewRun = this.regSeed(makeButton("New Run", 88, 26, () => {
      if (this.fsm.state === "running" || this.fsm.state === "resolve") return;
      // Reset economy and model state.
      this.run.resetRun();
      this.model.resetOffsets();
      this.model.resetLocks();
      // If run was ended, transition back to idle.
      if (this.fsm.state === "ended") {
        this.fsm.transition("idle");
      }
      this.refreshInfo();
      this.onAction();
      this.onNewRun?.();
    }, { fill: 0x1a3000, stroke: 0x336600, hoverTint: 0x88cc44 }));
    bNewRun.x = X + 340; bNewRun.y = y;

    // SPIN — game button (disabled during animation and ended).
    const bSpin = this.regGame(makeButton("SPIN", 100, 32, () => {
      if (this.fsm.state !== "idle") return;
      if (!this.run.canSpend(1)) return;
      this.onSpin?.();
    }, { fill: 0x1a3a1a, stroke: 0x44cc44, hoverTint: 0x88ff88 }));
    bSpin.x = PANEL_W - X - 100; bSpin.y = y - 3;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Synchronise button enable/disable state with the FSM state.
   * Called via fsm.onChange in main.ts.
   *
   *   animating (running/resolve): disable ALL buttons.
   *   ended:                       disable game buttons; keep seed/meta buttons enabled.
   *   idle:                        enable ALL buttons.
   */
  syncState(state: GameState): void {
    const animating = state === "running" || state === "resolve";
    const ended     = state === "ended";
    for (const btn of this.lockableButtons) setDisabled(btn, animating || ended);
    for (const btn of this.seedButtons)     setDisabled(btn, animating);
  }

  /** Backward-compat wrapper (used until callers are updated). */
  setLocked(locked: boolean): void {
    this.syncState(locked ? "running" : "idle");
  }

  showLastSpin(deltas: number[]): void {
    this.lastSpinText.text = deltas.length ? deltas.join("  ") : "—";
  }

  clearLastSpin(): void {
    this.lastSpinText.text = "—";
  }

  refreshInfo(): void {
    this.seedText.text         = String(this.seedValue);
    this.lengthText.text       = String(this.model.tapeLength);
    this.offsetsText.text      = this.model.getOffsets().join(", ");
    this.visibleText.text      = this.model.getVisibleString();
    this.selectedReelText.text = String(this.selectedReel + 1);
    this.locksText.text        = this.model.getLockStates().map(l => l ? "1" : "0").join(" ");
    for (let i = 0; i < 7; i++) this.lockBtns[i].setActive(this.model.isLocked(i));

    // Actions + nudge cost
    const acts = this.run.actions;
    this.actionsText.text  = `${acts} / ${RunController.MAX_ACTIONS}`;
    this.actionsText.style = acts === 0 ? ACTIONS_ZERO_STYLE : acts <= 4 ? ACTIONS_LOW_STYLE : ACTIONS_OK_STYLE;
    this.nudgeCostText.text = `${this.run.getNudgeCost()} ⚡`;

    // Run status
    const ended = this.fsm.state === "ended";
    this.runStatusText.text  = ended ? "RUN ENDED" : "ACTIVE";
    this.runStatusText.style = ended ? STATUS_END_STYLE : STATUS_OK_STYLE;
  }
}
