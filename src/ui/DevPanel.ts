import { Container, Graphics, Text, TextStyle, FederatedPointerEvent } from "pixi.js";
import { TapeSlotModel } from "../game/TapeSlotModel";
import { GameStateMachine } from "../core/GameStateMachine";
import { RNG } from "../core/RNG";

// ── Shared text styles ─────────────────────────────────────────────────────────
const LABEL_STYLE   = new TextStyle({ fontFamily: "monospace", fontSize: 14, fill: 0xcccccc });
const VALUE_STYLE   = new TextStyle({ fontFamily: "monospace", fontSize: 14, fill: 0xffffff, fontWeight: "bold" });
const BTN_STYLE     = new TextStyle({ fontFamily: "monospace", fontSize: 13, fill: 0xffffff });
const HEADING_STYLE = new TextStyle({ fontFamily: "monospace", fontSize: 16, fill: 0xffcc00, fontWeight: "bold" });
const HINT_STYLE    = new TextStyle({ fontFamily: "monospace", fontSize: 11, fill: 0x888888 });
const SPIN_DELTA_STYLE = new TextStyle({ fontFamily: "monospace", fontSize: 14, fill: 0x88ff88 });
const LOCKS_VALUE_STYLE = new TextStyle({ fontFamily: "monospace", fontSize: 14, fill: 0xffaa00, fontWeight: "bold" });

// ── Generic button factory ─────────────────────────────────────────────────────
interface BtnColors { fill?: number; stroke?: number; hoverTint?: number; }

function makeButton(
  label: string, width: number, height: number,
  onClick: () => void, colors: BtnColors = {}
): Container {
  const { fill = 0x444466, stroke = 0x6666aa, hoverTint = 0xaaaaff } = colors;
  const c = new Container();
  c.eventMode = "static";
  c.cursor = "pointer";
  const bg = new Graphics();
  bg.roundRect(0, 0, width, height, 4);
  bg.fill({ color: fill });
  bg.stroke({ color: stroke, width: 1 });
  c.addChild(bg);
  const txt = new Text({ text: label, style: BTN_STYLE });
  txt.x = Math.round((width - txt.width) / 2);
  txt.y = Math.round((height - txt.height) / 2);
  c.addChild(txt);
  c.on("pointerdown", (e: FederatedPointerEvent) => { e.stopPropagation(); onClick(); });
  c.on("pointerover",  () => { bg.tint = hoverTint; });
  c.on("pointerout",   () => { bg.tint = 0xffffff;  });
  return c;
}

// ── Lock toggle button ─────────────────────────────────────────────────────────
// Returns a container with a setActive(bool) method to redraw the visual state.
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
  txt.x = LOCK_BTN_W / 2;
  txt.y = LOCK_BTN_H / 2;
  c.addChild(txt);

  const redraw = (locked: boolean) => {
    bg.clear();
    bg.roundRect(0, 0, LOCK_BTN_W, LOCK_BTN_H, 4);
    if (locked) {
      bg.fill({ color: 0x3a2200 });
      bg.stroke({ color: 0xffaa00, width: 1 });
    } else {
      bg.fill({ color: 0x222233 });
      bg.stroke({ color: 0x555566, width: 1 });
    }
  };

  redraw(false);

  c.on("pointerdown", (e: FederatedPointerEvent) => { e.stopPropagation(); onClick(); });
  c.on("pointerover",  () => { bg.tint = 0xddddff; });
  c.on("pointerout",   () => { bg.tint = 0xffffff; });

  return { container: c, setActive: redraw };
}

// ── DevPanel ───────────────────────────────────────────────────────────────────
export class DevPanel extends Container {
  private model: TapeSlotModel;
  private fsm: GameStateMachine;
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

  // ── Callbacks ──
  private onAction: () => void;
  private onSeedRebuild?: () => void;
  private onSpin?: () => void;

  private randomCounter = 0;

  /**
   * Buttons disabled (alpha + eventMode) while the FSM is not idle.
   * Populated during build(). main.ts calls setLocked() via fsm.onChange.
   */
  private lockableButtons: Container[] = [];

  /** Stateful lock-toggle buttons — one per reel. */
  private lockBtns: LockToggleBtn[] = [];

  constructor(
    model: TapeSlotModel,
    fsm: GameStateMachine,
    onAction: () => void,
    onSeedRebuild?: () => void,
    onSpin?: () => void
  ) {
    super();
    this.model = model;
    this.fsm = fsm;
    this.seedValue = model.seed;
    this.onAction = onAction;
    this.onSeedRebuild = onSeedRebuild;
    this.onSpin = onSpin;
    this.build();
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  /** Run fn() as a non-animating instant action (idempotent FSM cycle). */
  private guardAction(fn: () => void): void {
    if (this.fsm.isLocked) return;
    this.fsm.runInstant();
    fn();
    this.onAction();
  }

  /** Register btn as lockable, add to display list. */
  private reg(btn: Container): Container {
    this.lockableButtons.push(btn);
    this.addChild(btn);
    return btn;
  }

  // ── Build ──────────────────────────────────────────────────────────────────
  private build(): void {
    const PANEL_W = 700;
    const PANEL_H = 270;
    const X = 14; // left margin

    const bg = new Graphics();
    bg.roundRect(0, 0, PANEL_W, PANEL_H, 8);
    bg.fill({ color: 0x1a1a3e, alpha: 0.95 });
    bg.stroke({ color: 0x3a3a6e, width: 2 });
    this.addChild(bg);

    let y = 10;

    // ── Heading ────────────────────────────────────────────────────────────────
    this.addChild(Object.assign(new Text({ text: "DEV CONTROL PANEL", style: HEADING_STYLE }), { x: X, y }));
    y += 26;

    // ── Info: seed + tape length ───────────────────────────────────────────────
    this.addChild(Object.assign(new Text({ text: "Seed:", style: LABEL_STYLE }),    { x: X,       y }));
    this.seedText   = Object.assign(new Text({ text: String(this.seedValue), style: VALUE_STYLE }), { x: X + 50,  y });
    this.addChild(this.seedText);
    this.addChild(Object.assign(new Text({ text: "L:",   style: LABEL_STYLE }),    { x: X + 160, y }));
    this.lengthText = Object.assign(new Text({ text: String(this.model.tapeLength), style: VALUE_STYLE }), { x: X + 180, y });
    this.addChild(this.lengthText);
    y += 20;

    // ── Info: offsets ──────────────────────────────────────────────────────────
    this.addChild(Object.assign(new Text({ text: "Offsets:", style: LABEL_STYLE }), { x: X,      y }));
    this.offsetsText = Object.assign(new Text({ text: this.model.getOffsets().join(", "), style: VALUE_STYLE }), { x: X + 80, y });
    this.addChild(this.offsetsText);
    y += 20;

    // ── Info: visible digits ───────────────────────────────────────────────────
    this.addChild(Object.assign(new Text({ text: "Visible:", style: LABEL_STYLE }), { x: X,      y }));
    this.visibleText = Object.assign(new Text({ text: this.model.getVisibleString(), style: VALUE_STYLE }), { x: X + 80, y });
    this.addChild(this.visibleText);
    y += 20;

    // ── Info: last spin deltas + locks state (shared row) ────────────────────
    this.addChild(Object.assign(new Text({ text: "Last spin:", style: LABEL_STYLE }), { x: X,       y }));
    this.lastSpinText = Object.assign(new Text({ text: "—", style: SPIN_DELTA_STYLE }), { x: X + 90,  y });
    this.addChild(this.lastSpinText);

    this.addChild(Object.assign(new Text({ text: "Locks:", style: LABEL_STYLE }), { x: X + 340, y }));
    this.locksText = Object.assign(
      new Text({ text: this.model.getLockStates().map(l => l ? "1" : "0").join(" "), style: LOCKS_VALUE_STYLE }),
      { x: X + 395, y }
    );
    this.addChild(this.locksText);
    y += 22;

    // ── Lock toggle buttons row ────────────────────────────────────────────────
    for (let i = 0; i < 7; i++) {
      const reelIdx = i;
      const lb = makeLockToggleButton(String(i + 1), () => {
        // Lock toggles are pure pre-spin configuration — no FSM cycle needed.
        // They ARE blocked by setLocked() during animation (eventMode = "none").
        if (this.fsm.isLocked) return;
        this.model.toggleLocked(reelIdx);
        lb.setActive(this.model.isLocked(reelIdx));
        this.locksText.text = this.model.getLockStates().map(l => l ? "1" : "0").join(" ");
        this.onAction(); // updates reel overlays + refreshes info in main.ts
      });
      lb.container.x = X + i * (LOCK_BTN_W + 4);
      lb.container.y = y;
      this.lockableButtons.push(lb.container);
      this.addChild(lb.container);
      this.lockBtns.push(lb);
    }

    // Reset Locks button — also pre-spin config, no FSM cycle
    const bResetLocks = makeButton("Reset Locks", 96, LOCK_BTN_H, () => {
      if (this.fsm.isLocked) return;
      this.model.resetLocks();
      this.onAction(); // refreshes overlays + info
    }, { fill: 0x2a1a00, stroke: 0x996600, hoverTint: 0xffcc88 });
    bResetLocks.x = X + 7 * (LOCK_BTN_W + 4) + 8;
    bResetLocks.y = y;
    this.lockableButtons.push(bResetLocks);
    this.addChild(bResetLocks);
    y += 34;

    // ── Seed controls ──────────────────────────────────────────────────────────
    const seedAction = (delta: number) => () => {
      this.seedValue = Math.max(0, this.seedValue + delta);
      this.model.rebuildFromSeed(this.seedValue);
      this.randomCounter = 0;
      this.onSeedRebuild?.();
    };

    this.reg(makeButton("Seed -1",   70, 26, () => this.guardAction(seedAction(-1)))).x  = X;
    this.reg(makeButton("Seed +1",   70, 26, () => this.guardAction(seedAction(+1)))).x  = X + 78;
    this.reg(makeButton("Seed +10",  76, 26, () => this.guardAction(seedAction(+10)))).x = X + 156;
    this.reg(makeButton("Apply Seed", 96, 26, () => this.guardAction(() => {
      this.model.rebuildFromSeed(this.seedValue);
      this.randomCounter = 0;
      this.onSeedRebuild?.();
    }))).x = X + 240;

    for (const btn of this.lockableButtons.slice(-4)) btn.y = y;  // assign y to the 4 seed btns

    this.addChild(Object.assign(new Text({ text: "(use Seed ±1/+10 to change)", style: HINT_STYLE }), { x: X + 345, y: y + 6 }));
    y += 36;

    // ── Reel controls ──────────────────────────────────────────────────────────
    this.addChild(Object.assign(new Text({ text: "Reel:", style: LABEL_STYLE }), { x: X, y: y + 4 }));
    this.selectedReelText = Object.assign(new Text({ text: "1", style: VALUE_STYLE }), { x: X + 50, y: y + 4 });
    this.addChild(this.selectedReelText);

    const bPrev = this.reg(makeButton("<", 28, 26, () => { this.selectedReel = (this.selectedReel + 6) % 7; this.refreshInfo(); }));
    bPrev.x = X + 72; bPrev.y = y;
    const bNext = this.reg(makeButton(">", 28, 26, () => { this.selectedReel = (this.selectedReel + 1) % 7; this.refreshInfo(); }));
    bNext.x = X + 106; bNext.y = y;

    const bNudgeUp   = this.reg(makeButton("Nudge Up",   86,  26, () => this.guardAction(() => this.model.reels[this.selectedReel].nudge(-1))));
    bNudgeUp.x = X + 150; bNudgeUp.y = y;
    const bNudgeDown = this.reg(makeButton("Nudge Down", 100, 26, () => this.guardAction(() => this.model.reels[this.selectedReel].nudge(1))));
    bNudgeDown.x = X + 244; bNudgeDown.y = y;
    y += 36;

    // ── Utility buttons ────────────────────────────────────────────────────────
    const bRand = this.reg(makeButton("Randomize Offsets", 156, 26, () => this.guardAction(() => {
      this.randomCounter++;
      this.model.randomizeOffsets(new RNG(this.seedValue * 9999 + this.randomCounter));
    })));
    bRand.x = X; bRand.y = y;

    const bReset = this.reg(makeButton("Reset Offsets to 0", 160, 26, () => this.guardAction(() => this.model.resetOffsets())));
    bReset.x = X + 166; bReset.y = y;

    // ── SPIN button ─────────────────────────────────────────────────────────────
    const bSpin = this.reg(makeButton("SPIN", 100, 32, () => {
      if (this.fsm.isLocked) return;
      this.onSpin?.();
    }, { fill: 0x1a3a1a, stroke: 0x44cc44, hoverTint: 0x88ff88 }));
    bSpin.x = PANEL_W - X - 100; bSpin.y = y - 3;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Disable/enable all interactive buttons. Called via fsm.onChange in main.ts. */
  setLocked(locked: boolean): void {
    for (const btn of this.lockableButtons) {
      btn.alpha     = locked ? 0.35 : 1.0;
      btn.eventMode = locked ? "none" : "static";
      btn.cursor    = locked ? "default" : "pointer";
    }
  }

  /** Update the "Last spin" deltas readout after a completed spin. */
  showLastSpin(deltas: number[]): void {
    this.lastSpinText.text = deltas.length ? deltas.join("  ") : "—";
  }

  /** Clear the last spin readout (e.g. after seed rebuild). */
  clearLastSpin(): void {
    this.lastSpinText.text = "—";
  }

  /** Sync all text readouts and lock button visuals with current model state. */
  refreshInfo(): void {
    this.seedText.text         = String(this.seedValue);
    this.lengthText.text       = String(this.model.tapeLength);
    this.offsetsText.text      = this.model.getOffsets().join(", ");
    this.visibleText.text      = this.model.getVisibleString();
    this.selectedReelText.text = String(this.selectedReel + 1);
    this.locksText.text        = this.model.getLockStates().map(l => l ? "1" : "0").join(" ");
    for (let i = 0; i < 7; i++) {
      this.lockBtns[i].setActive(this.model.isLocked(i));
    }
  }
}
