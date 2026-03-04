import {
  Container,
  Graphics,
  Text,
  TextStyle,
  Ticker,
  FederatedPointerEvent,
  Rectangle,
} from "pixi.js";
import { DevPanel } from "./DevPanel";
import { TapeSlotModel } from "../game/TapeSlotModel";
import { GameStateMachine } from "../core/GameStateMachine";
import { RunController } from "../game/RunController";

// ── Constants ─────────────────────────────────────────────────────────────────
const DRAWER_W    = 700;
const HANDLE_H    = 44;
const DEVPANEL_H  = 290; // must match DevPanel's PANEL_H
const ANIM_MS     = 220;

// ── Styles ────────────────────────────────────────────────────────────────────
const HANDLE_LABEL_STYLE = new TextStyle({
  fontFamily: "Arial, sans-serif",
  fontSize: 13,
  fill: 0xffcc00,
  fontWeight: "bold",
});

// ═════════════════════════════════════════════════════════════════════════════
/**
 * DevDrawer — a bottom-screen slide-up drawer that wraps DevPanel.
 *
 * Structure (y within container):
 *   handleContainer  y=0           — tab, always visible and interactive
 *   panelContainer   y=HANDLE_H    — DevPanel content, hidden when collapsed
 *
 * Collapsed:  container.y = screenH - HANDLE_H
 *             → handle sits at the very bottom; panel is off-screen below.
 * Expanded:   container.y = screenH - HANDLE_H - DEVPANEL_H
 *             → full panel visible above the handle tab.
 */
export class DevDrawer {
  /** Root container — add this to app.stage. */
  readonly container: Container;

  /** Expose so main.ts can call devPanel.refreshInfo() etc. */
  readonly devPanel: DevPanel;

  private readonly handleContainer: Container;
  private readonly panelContainer: Container;
  private readonly ticker: Ticker;

  private handleLabel!: Text;
  private handleBg!: Graphics;

  private expanded   = false;
  private animating  = false;
  private spinLocked = false; // true while reels are spinning

  private screenW = 800;
  private screenH = 600;

  // ── Constructor ─────────────────────────────────────────────────────────────
  constructor(
    model: TapeSlotModel,
    fsm: GameStateMachine,
    run: RunController,
    ticker: Ticker,
    onAction: () => void,
    onSeedRebuild?: () => void,
    onSpin?: () => void,
  ) {
    this.ticker    = ticker;
    this.container = new Container();

    // ── Handle tab (always rendered at top of drawer) ─────────────────────
    this.handleContainer = new Container();
    this.handleContainer.y = 0;
    this.container.addChild(this.handleContainer);
    this.buildHandle();

    // ── Panel content (below handle, hidden when collapsed) ───────────────
    this.panelContainer = new Container();
    this.panelContainer.y = HANDLE_H;
    this.container.addChild(this.panelContainer);

    this.devPanel = new DevPanel(model, fsm, run, onAction, onSeedRebuild, onSpin);
    this.panelContainer.addChild(this.devPanel);

    // Start collapsed — resize() will set the correct y once screen size is known.
    this.applyCollapsedState();
  }

  // ── Handle construction ──────────────────────────────────────────────────────
  private buildHandle(): void {
    const c = this.handleContainer;

    // Background bar
    this.handleBg = new Graphics();
    this.handleBg.roundRect(0, 0, DRAWER_W, HANDLE_H, 6);
    this.handleBg.fill({ color: 0x12122e, alpha: 0.97 });
    this.handleBg.stroke({ color: 0x4a4a8a, width: 1 });
    c.addChild(this.handleBg);

    // Grip pill
    const grip = new Graphics();
    grip.roundRect(DRAWER_W / 2 - 28, 8, 56, 5, 3);
    grip.fill({ color: 0x44446a });
    c.addChild(grip);

    // Label
    this.handleLabel = new Text({ text: "DEV  ▴", style: HANDLE_LABEL_STYLE });
    this.handleLabel.anchor.set(0.5, 0.5);
    this.handleLabel.x = DRAWER_W / 2;
    this.handleLabel.y = HANDLE_H - 13;
    c.addChild(this.handleLabel);

    // Interaction
    c.eventMode = "static";
    c.cursor    = "pointer";
    c.hitArea   = new Rectangle(0, 0, DRAWER_W, HANDLE_H);

    c.on("pointerdown", (e: FederatedPointerEvent) => {
      e.stopPropagation();
      this.toggle();
    });
    c.on("pointerover", () => { this.handleBg.tint = 0xbbbbff; });
    c.on("pointerout",  () => { this.handleBg.tint = 0xffffff; });
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  /**
   * Toggle expand / collapse.
   * Ignored during drawer animation or while reels are spinning.
   */
  toggle(): void {
    if (this.animating || this.spinLocked) return;
    if (this.expanded) {
      this.collapse();
    } else {
      this.expand();
    }
  }

  /**
   * Called from FSM onChange when reels start/stop animating.
   * Prevents handle clicks while the game is running an animation.
   */
  setSpinLocked(locked: boolean): void {
    this.spinLocked = locked;
  }

  /**
   * Called from layout() on every resize.
   * Snaps drawer to the correct y for its current state without animating.
   */
  resize(screenW: number, screenH: number): void {
    this.screenW = screenW;
    this.screenH = screenH;
    this.container.x = Math.round((screenW - DRAWER_W) / 2);
    this.container.y = this.expanded ? this.expandedY() : this.collapsedY();
  }

  // ── State transitions ────────────────────────────────────────────────────────

  private expand(): void {
    this.expanded = true;
    this.handleLabel.text = "DEV  ▾";
    // Show content before animation so it appears to slide in from below
    this.panelContainer.visible   = true;
    this.panelContainer.eventMode = "passive";
    this.animateTo(this.expandedY());
  }

  private collapse(): void {
    this.expanded = false;
    this.handleLabel.text = "DEV  ▴";
    // Animate first, hide content only after animation completes
    this.animateTo(this.collapsedY(), () => {
      this.applyCollapsedState();
    });
  }

  /** Immediately apply collapsed visual + interaction state (no animation). */
  private applyCollapsedState(): void {
    this.panelContainer.visible   = false;
    this.panelContainer.eventMode = "none"; // children do not intercept pointer events
  }

  // ── Animation ────────────────────────────────────────────────────────────────

  private collapsedY(): number {
    return this.screenH - HANDLE_H;
  }

  private expandedY(): number {
    return this.screenH - HANDLE_H - DEVPANEL_H;
  }

  private animateTo(targetY: number, onDone?: () => void): void {
    if (this.animating) return;
    this.animating = true;

    const startTime = performance.now();
    const startY    = this.container.y;
    const dist      = targetY - startY;

    const onTick = (): void => {
      const elapsed = performance.now() - startTime;
      const t       = Math.min(elapsed / ANIM_MS, 1);
      const eased   = 1 - Math.pow(1 - t, 3); // ease-out cubic

      this.container.y = Math.round(startY + dist * eased);

      if (t >= 1) {
        this.container.y = targetY; // exact snap, no drift
        this.ticker.remove(onTick);
        this.animating = false;
        onDone?.();
      }
    };

    this.ticker.add(onTick);
  }
}
