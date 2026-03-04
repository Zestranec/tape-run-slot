import {
  Application, Container, Graphics, Rectangle,
  Text, TextStyle, FederatedPointerEvent,
} from "pixi.js";
import { GameStateMachine, GameState } from "./core/GameStateMachine";
import { TapeSlotModel, REEL_COUNT } from "./game/TapeSlotModel";
import { VisibleDigits } from "./game/TapeReel";
import { ReelAnimator, ReelViewRef } from "./game/ReelAnimator";
import { SpinController } from "./game/SpinController";
import { RunController } from "./game/RunController";
import { CardController } from "./game/CardController";
import { EconomyController } from "./game/EconomyController";
import { DevDrawer } from "./ui/DevDrawer";
import { RunPanel } from "./ui/RunPanel";
import { CardGrid } from "./ui/CardGrid";
import { BetPanel } from "./ui/BetPanel";
import { ToastMessage } from "./ui/ToastMessage";

// ─────────────────────────────────────────────────────────────────────────────
// REEL VISUAL CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const REEL_WIDTH      = 72;
const REEL_HEIGHT     = 160;
const REEL_GAP        = 10;
const REEL_AREA_WIDTH = REEL_COUNT * REEL_WIDTH + (REEL_COUNT - 1) * REEL_GAP;

// ── Per-reel control sizes ────────────────────────────────────────────────────
const NUDGE_H   = 18;  // nudge triangle button height
const NUDGE_GAP = 3;   // gap between nudge button and reel box
const LOCK_H    = 16;  // lock button height (below reel)

// Controls above and below each reel box:
const CTRL_ABOVE  = NUDGE_H + NUDGE_GAP;              // 21 px
const CTRL_BELOW  = NUDGE_GAP + NUDGE_H + 3 + LOCK_H; // 40 px  (gap+nudge+gap+lock)
const REEL_SLOT_H = CTRL_ABOVE + REEL_HEIGHT + CTRL_BELOW; // 221 px per slot

// ─────────────────────────────────────────────────────────────────────────────
// LAYOUT CONSTANTS
//
//   gameRoot.y = PAD_TOP = 16
//
//   topBlock (y=0)
//   ├── title              y = 38  (anchor-bottom; text above; 4 px gap to slot top)
//   ├── reelsContainer     y = REEL_SLOT_Y = 42
//   │     └── slot[i]        y = 0 within reelsContainer
//   │           ├── nudgeUp      y = 0
//   │           ├── reelBox      y = CTRL_ABOVE = 21   (animated by ReelAnimator)
//   │           ├── nudgeDown    y = 21 + 160 + 3 = 184
//   │           └── lockBtn      y = 205
//   ├── runPanel           y = PANEL_TOP = 277  (run states)
//   └── betPanelContainer  y = PANEL_TOP = 277  (betting only)
//
//   cardsBlock  y = CARDS_TOP = 381  (= PANEL_TOP + RunPanel.PANEL_H + BLOCK_GAP)
//
// cardsBlock.y is a compile-time constant — overlap is impossible.
// ─────────────────────────────────────────────────────────────────────────────
const UI_W        = 700;
const PAD_TOP     = 16;
const REEL_SLOT_Y = 42;  // reelsContainer.y in topBlock (4 px below title bottom at 38)
const PANEL_GAP   = 14;
const BLOCK_GAP   = 16;
const PANEL_TOP   = REEL_SLOT_Y + REEL_SLOT_H + PANEL_GAP; // 42 + 221 + 14 = 277

// ─────────────────────────────────────────────────────────────────────────────
// TEXT STYLES
// ─────────────────────────────────────────────────────────────────────────────
const CENTER_STYLE     = new TextStyle({ fontFamily: "monospace", fontSize: 54, fill: 0xffffff, fontWeight: "bold" });
const SIDE_STYLE       = new TextStyle({ fontFamily: "monospace", fontSize: 30, fill: 0x888899 });
const LOCK_LABEL_STYLE = new TextStyle({ fontFamily: "monospace", fontSize: 11, fill: 0xffaa00, fontWeight: "bold" });
const END_TITLE_STYLE  = new TextStyle({ fontFamily: "monospace", fontSize: 20, fill: 0xff4444, fontWeight: "bold" });
const END_STAT_STYLE   = new TextStyle({ fontFamily: "monospace", fontSize: 14, fill: 0xffffff });
const END_PROFIT_POS   = new TextStyle({ fontFamily: "monospace", fontSize: 16, fill: 0x44ff88, fontWeight: "bold" });
const END_PROFIT_NEG   = new TextStyle({ fontFamily: "monospace", fontSize: 16, fill: 0xff4444, fontWeight: "bold" });
const END_BTN_STYLE    = new TextStyle({ fontFamily: "monospace", fontSize: 14, fill: 0xffffff, fontWeight: "bold" });

// Lock button text styles (pre-allocated, reused in updateLockOverlay)
const LOCK_BTN_OFF_STYLE = new TextStyle({ fontFamily: "monospace", fontSize: 10, fill: 0x6666aa });
const LOCK_BTN_ON_STYLE  = new TextStyle({ fontFamily: "monospace", fontSize: 10, fill: 0xffaa00, fontWeight: "bold" });

// ─────────────────────────────────────────────────────────────────────────────
// REEL VIEW
//
//   slot        — outer wrapper added to reelsContainer; holds nudge+lock btns
//   container   — reel box at y=CTRL_ABOVE in slot; THIS is what ReelAnimator
//                 touches (text positions, clip mask). Never move it externally.
//   nudgeUp/Down — triangle buttons outside the reel box
//   lockBtn     — small bar below nudgeDown
//   centerHit   — invisible hit-zone inside container for lock-toggle on click
// ─────────────────────────────────────────────────────────────────────────────
interface ReelView extends ReelViewRef {
  slot:         Container;
  container:    Container;
  aboveText:    Text;
  centerText:   Text;
  belowText:    Text;
  lockOverlay:  Graphics;
  lockLabel:    Text;        // kept for interface compat, always hidden
  nudgeUp:      Container;
  nudgeDown:    Container;
  lockBtn:      Container;
  lockBtnBg:    Graphics;
  lockBtnLabel: Text;
  centerHit:    Container;
}

function createReelView(): ReelView {
  const CX = REEL_WIDTH / 2; // 36
  const HW = 14;              // triangle half-width

  // ── Slot (outer wrapper) ────────────────────────────────────────────────────
  const slot = new Container();

  // ── Nudge UP triangle (above reel, y=0 in slot) ─────────────────────────────
  const nudgeUp = new Container();
  nudgeUp.y         = 0;
  nudgeUp.eventMode = "static";
  nudgeUp.cursor    = "pointer";
  nudgeUp.hitArea   = new Rectangle(CX - HW, 0, HW * 2, NUDGE_H);
  const nudgeUpGfx  = new Graphics();
  nudgeUpGfx.poly([CX, 2, CX + HW, NUDGE_H - 2, CX - HW, NUDGE_H - 2]);
  nudgeUpGfx.fill({ color: 0x3366cc });
  nudgeUp.addChild(nudgeUpGfx);
  nudgeUp.on("pointerover", () => { nudgeUpGfx.tint = 0xaaddff; });
  nudgeUp.on("pointerout",  () => { nudgeUpGfx.tint = 0xffffff; });
  slot.addChild(nudgeUp);

  // ── Reel box (animated by ReelAnimator, y=CTRL_ABOVE in slot) ───────────────
  const container = new Container();
  container.y = CTRL_ABOVE; // 21

  const bg = new Graphics();
  bg.roundRect(0, 0, REEL_WIDTH, REEL_HEIGHT, 6);
  bg.fill({ color: 0x22223a });
  bg.stroke({ color: 0x4a4a7a, width: 2 });
  bg.eventMode = "none";
  container.addChild(bg);

  const aboveText = new Text({ text: "0", style: SIDE_STYLE });
  aboveText.anchor.set(0.5);
  aboveText.x = CX; aboveText.y = 30; aboveText.alpha = 0.4;
  container.addChild(aboveText);

  const centerText = new Text({ text: "0", style: CENTER_STYLE });
  centerText.anchor.set(0.5);
  centerText.x = CX; centerText.y = REEL_HEIGHT / 2;
  container.addChild(centerText);

  const belowText = new Text({ text: "0", style: SIDE_STYLE });
  belowText.anchor.set(0.5);
  belowText.x = CX; belowText.y = REEL_HEIGHT - 30; belowText.alpha = 0.4;
  container.addChild(belowText);

  const lockOverlay = new Graphics();
  lockOverlay.roundRect(1, 1, REEL_WIDTH - 2, REEL_HEIGHT - 2, 5);
  lockOverlay.fill({ color: 0xffaa00, alpha: 0.18 });
  lockOverlay.stroke({ color: 0xffaa00, width: 2 });
  lockOverlay.visible   = false;
  lockOverlay.eventMode = "none";
  container.addChild(lockOverlay);

  // lockLabel: kept in interface for compat, always invisible (replaced by lockBtn)
  const lockLabel = new Text({ text: "LOCK", style: LOCK_LABEL_STYLE });
  lockLabel.anchor.set(0.5);
  lockLabel.x = CX; lockLabel.y = REEL_HEIGHT - 12;
  lockLabel.visible = false;
  container.addChild(lockLabel);

  // centerHit: invisible hit zone over center digit for lock-toggle click
  const centerHit  = new Container();
  centerHit.eventMode = "none"; // enabled by syncReelControls when idle
  centerHit.cursor    = "pointer";
  centerHit.hitArea   = new Rectangle(0, REEL_HEIGHT / 2 - 32, REEL_WIDTH, 64);
  container.addChild(centerHit);

  slot.addChild(container);

  // ── Nudge DOWN triangle (below reel box) ────────────────────────────────────
  const nudgeDwnY  = CTRL_ABOVE + REEL_HEIGHT + NUDGE_GAP; // 184
  const nudgeDown  = new Container();
  nudgeDown.y         = nudgeDwnY;
  nudgeDown.eventMode = "static";
  nudgeDown.cursor    = "pointer";
  nudgeDown.hitArea   = new Rectangle(CX - HW, 0, HW * 2, NUDGE_H);
  const nudgeDwnGfx   = new Graphics();
  nudgeDwnGfx.poly([CX, NUDGE_H - 2, CX + HW, 2, CX - HW, 2]);
  nudgeDwnGfx.fill({ color: 0x3366cc });
  nudgeDown.addChild(nudgeDwnGfx);
  nudgeDown.on("pointerover", () => { nudgeDwnGfx.tint = 0xaaddff; });
  nudgeDown.on("pointerout",  () => { nudgeDwnGfx.tint = 0xffffff; });
  slot.addChild(nudgeDown);

  // ── Lock button (below nudgeDown) ───────────────────────────────────────────
  const lockBtnY = nudgeDwnY + NUDGE_H + 3; // 205
  const lockBtn  = new Container();
  lockBtn.y         = lockBtnY;
  lockBtn.eventMode = "static";
  lockBtn.cursor    = "pointer";
  lockBtn.hitArea   = new Rectangle(0, 0, REEL_WIDTH, LOCK_H);

  const lockBtnBg = new Graphics();
  lockBtnBg.roundRect(0, 0, REEL_WIDTH, LOCK_H, 3);
  lockBtnBg.fill({ color: 0x1e1e30 });
  lockBtnBg.stroke({ color: 0x404060, width: 1 });
  lockBtn.addChild(lockBtnBg);

  const lockBtnLabel = new Text({ text: "LOCK", style: LOCK_BTN_OFF_STYLE });
  lockBtnLabel.anchor.set(0.5, 0.5);
  lockBtnLabel.x = CX;
  lockBtnLabel.y = LOCK_H / 2;
  lockBtn.addChild(lockBtnLabel);

  lockBtn.on("pointerover", () => { lockBtnBg.tint = 0xbbbbff; });
  lockBtn.on("pointerout",  () => { lockBtnBg.tint = 0xffffff; });
  slot.addChild(lockBtn);

  return {
    slot, container,
    aboveText, centerText, belowText,
    lockOverlay, lockLabel,
    nudgeUp, nudgeDown,
    lockBtn, lockBtnBg, lockBtnLabel,
    centerHit,
  };
}

function updateReelView(view: ReelView, digits: VisibleDigits): void {
  view.aboveText.text  = String(digits.above);
  view.centerText.text = String(digits.center);
  view.belowText.text  = String(digits.below);
}

function updateLockOverlay(view: ReelView, locked: boolean): void {
  view.lockOverlay.visible = locked;
  // Update lock button appearance
  view.lockBtnBg.clear();
  view.lockBtnBg.roundRect(0, 0, REEL_WIDTH, LOCK_H, 3);
  if (locked) {
    view.lockBtnBg.fill({ color: 0x3a2200 });
    view.lockBtnBg.stroke({ color: 0xffaa00, width: 1 });
    view.lockBtnLabel.text  = "UNLOCK";
    view.lockBtnLabel.style = LOCK_BTN_ON_STYLE;
  } else {
    view.lockBtnBg.fill({ color: 0x1e1e30 });
    view.lockBtnBg.stroke({ color: 0x404060, width: 1 });
    view.lockBtnLabel.text  = "LOCK";
    view.lockBtnLabel.style = LOCK_BTN_OFF_STYLE;
  }
}

// Disable/enable a control button with alpha + eventMode.
function setCtrlDisabled(c: Container, disabled: boolean): void {
  c.alpha     = disabled ? 0.30 : 1.0;
  c.eventMode = disabled ? "none" : "static";
}

// ═════════════════════════════════════════════════════════════════════════════
async function main() {
  const app = new Application();
  await app.init({ background: 0x12122a, resizeTo: window, antialias: true });
  document.body.appendChild(app.canvas);

  const fsm     = new GameStateMachine();
  const model   = new TapeSlotModel(42);
  const run     = new RunController();
  const cards   = new CardController();
  const economy = new EconomyController();

  // ══════════════════════════════════════════════════════════════════════════
  // GAME ROOT
  //
  // Z-ORDER within gameRoot:
  //   index 0 — cardsBlock  (behind — never intercepts topBlock events)
  //   index 1 — topBlock    (in front — hit-tested first by Pixi)
  // ══════════════════════════════════════════════════════════════════════════
  const gameRoot = new Container();
  app.stage.addChild(gameRoot);

  // ── cardsBlock — index 0 (behind) ─────────────────────────────────────────
  const CARDS_TOP = PANEL_TOP + RunPanel.PANEL_H + BLOCK_GAP; // 277 + 88 + 16 = 381

  const cardsBlock = new Container();
  cardsBlock.y         = CARDS_TOP;
  cardsBlock.eventMode = "passive";
  gameRoot.addChild(cardsBlock);

  const cardsMask = new Graphics();
  cardsMask.rect(0, 0, CardGrid.GRID_W, CardGrid.TOTAL_H);
  cardsMask.fill(0xffffff);
  cardsBlock.addChild(cardsMask);
  cardsBlock.mask = cardsMask;

  const cardGrid = new CardGrid((cardId) => handleCardClick(cardId));
  cardsBlock.addChild(cardGrid);

  // ── topBlock — index 1 (in front, hit-tested first) ───────────────────────
  const topBlock = new Container();
  gameRoot.addChild(topBlock);

  // Title — bottom-anchored, sits 4 px above the first nudge button row
  const title = new Text({
    text: "TAPE RUN SLOT",
    style: new TextStyle({ fontFamily: "monospace", fontSize: 28, fill: 0xffcc00, fontWeight: "bold", letterSpacing: 4 }),
  });
  title.anchor.set(0.5, 1);
  title.x = Math.round(UI_W / 2);
  title.y = REEL_SLOT_Y - 4; // 38  — bottom of text, 4 px gap to slot top
  topBlock.addChild(title);

  // Reels container — holds one slot per reel
  const reelsContainer = new Container();
  reelsContainer.x = Math.round((UI_W - REEL_AREA_WIDTH) / 2);
  reelsContainer.y = REEL_SLOT_Y; // 42
  topBlock.addChild(reelsContainer);

  const reelViews: ReelView[] = [];
  for (let i = 0; i < REEL_COUNT; i++) {
    const rv  = createReelView();
    rv.slot.x = i * (REEL_WIDTH + REEL_GAP);
    reelsContainer.addChild(rv.slot); // add the SLOT, not the inner container
    reelViews.push(rv);

    // Capture index for event closures (function declarations are hoisted,
    // so doNudge / doToggleLock are accessible here even though declared later).
    const idx = i;
    rv.nudgeUp.on("pointerdown",   (e: FederatedPointerEvent) => { e.stopPropagation(); doNudge(idx, -1); });
    rv.nudgeDown.on("pointerdown", (e: FederatedPointerEvent) => { e.stopPropagation(); doNudge(idx, +1); });
    rv.lockBtn.on("pointerdown",   (e: FederatedPointerEvent) => { e.stopPropagation(); doToggleLock(idx); });
    rv.centerHit.on("pointerdown", (e: FederatedPointerEvent) => { e.stopPropagation(); doToggleLock(idx); });
  }

  // ── RunPanel + BetPanel ────────────────────────────────────────────────────
  const animator       = new ReelAnimator(reelViews, model, app.ticker);
  const spinController = new SpinController(model, fsm, run, animator);

  function doSpin(): void {
    if (fsm.state !== "idle") return;
    if (!run.canSpend(1)) return;
    spinController.requestSpin(() => {
      // Evaluate ALL unclaimed cards against the new digits.
      const digits = model.getVisibleCenterDigits();
      cards.onSpinResolved(digits);

      refreshAllReels();
      devDrawer.devPanel.refreshInfo();
      if (spinController.lastSpin) devDrawer.devPanel.showLastSpin(spinController.lastSpin.deltas);

      // Gate: if any cards are available the player must claim one before spinning.
      if (cards.hasAvailable()) {
        runPanel.setSpinBlocked(true);
        toast.show("CHOOSE ONE CARD", { duration: 60_000 }); // persistent until replaced
      } else {
        runPanel.setSpinBlocked(false);
      }

      if (run.actions === 0) fsm.transition("ended");
    });
  }

  const runPanel = new RunPanel(run, economy, doSpin);
  runPanel.y = PANEL_TOP;
  topBlock.addChild(runPanel);

  const betPanelContainer = new Container();
  betPanelContainer.y = PANEL_TOP;
  topBlock.addChild(betPanelContainer);

  const betPanel = new BetPanel(economy, run, () => handleStartRun());
  betPanelContainer.addChild(betPanel);

  // ── Toast — non-interactive message layer above the cards grid ────────────
  // Z-index 2 (after cardsBlock=0, topBlock=1): renders on top but never
  // intercepts clicks because container.eventMode = "none".
  const toast = new ToastMessage(app.ticker);
  toast.container.x = Math.round(UI_W / 2); // horizontally centred over the grid
  toast.container.y = CARDS_TOP - 20;        // just above the cards grid
  gameRoot.addChild(toast.container);

  // ── DevDrawer ─────────────────────────────────────────────────────────────
  const devDrawer = new DevDrawer(
    model, fsm, run,
    app.ticker,
    () => { refreshAllReels(); devDrawer.devPanel.refreshInfo(); },
    () => {
      spinController.reset();
      devDrawer.devPanel.clearLastSpin();
      for (let i = 0; i < REEL_COUNT; i++) updateLockOverlay(reelViews[i], false);
    },
    doSpin,
  );
  // Reel selector + per-reel nudge buttons in DevPanel are superseded by the
  // on-reel triangle controls; hide them to avoid duplicates.
  devDrawer.devPanel.hideNudgeSection();

  // ── End overlay ─────────────────────────────────────────────────────────────
  const endOverlayData = buildEndOverlay();
  const endOverlay     = endOverlayData.container;
  endOverlay.visible   = false;
  app.stage.addChild(endOverlay);

  app.stage.addChild(devDrawer.container); // topmost — handle always hittable

  // ── Visibility ──────────────────────────────────────────────────────────────
  function applyVisibility(state: GameState): void {
    const betting = state === "betting";
    const inRun   = !betting;

    title.visible             = inRun;
    runPanel.visible          = inRun;
    betPanelContainer.visible = betting;

    cardsBlock.visible        = inRun;
    if (betting) toast.container.visible = false; // cancel any mid-animation toast
    endOverlay.visible = state === "ended";

    if (state === "ended") refreshEndOverlay();
  }

  // ── Per-reel action handlers ────────────────────────────────────────────────

  function doNudge(reelIdx: number, direction: -1 | 1): void {
    if (fsm.state !== "idle") return;
    const cost = run.getNudgeCost();
    if (!run.canSpend(cost)) return;
    run.spend(cost);
    run.recordNudge();
    model.reels[reelIdx].nudge(direction);
    refreshAllReels();
    devDrawer.devPanel.refreshInfo();
    if (run.actions === 0) fsm.transition("ended");
  }

  function doToggleLock(reelIdx: number): void {
    if (fsm.state !== "idle") return;
    model.toggleLocked(reelIdx);
    updateLockOverlay(reelViews[reelIdx], model.isLocked(reelIdx));
    devDrawer.devPanel.refreshInfo();
    // Re-sync to reflect any state change (e.g. if locking affects UI elsewhere)
    syncReelControls(fsm.state);
  }

  /**
   * Enable or disable per-reel nudge/lock controls based on game state.
   * Called whenever state transitions or actions count changes.
   *
   * Rules:
   *   nudge: only in "idle" AND actions >= nudge cost
   *   lock:  only in "idle"
   */
  function syncReelControls(state: GameState): void {
    const nudgeCost = run.getNudgeCost();
    const canNudge  = state === "idle" && run.canSpend(nudgeCost);
    const canLock   = state === "idle";

    for (const rv of reelViews) {
      setCtrlDisabled(rv.nudgeUp,   !canNudge);
      setCtrlDisabled(rv.nudgeDown, !canNudge);
      setCtrlDisabled(rv.lockBtn,   !canLock);
      rv.centerHit.eventMode = canLock ? "static" : "none";
    }
  }

  // ── Game handlers ───────────────────────────────────────────────────────────

  function handleStartRun(): void {
    if (fsm.state !== "betting") return;

    run.configure(economy.anteEnabled);
    run.resetRun();
    economy.resetRun();
    cards.resetRun();
    runPanel.setSpinBlocked(false); // clear any leftover block from a previous run
    model.resetOffsets();
    model.resetLocks();
    spinController.reset();
    devDrawer.devPanel.clearLastSpin();
    for (let i = 0; i < REEL_COUNT; i++) updateLockOverlay(reelViews[i], false);

    fsm.transition("idle");

    refreshAllReels();
    devDrawer.devPanel.refreshInfo();
    // Auto-spin at run start — first spin happens immediately.
    doSpin();
  }

  function handleReturnToBetting(): void {
    if (fsm.state !== "ended") return;
    fsm.transition("betting");
    betPanel.refresh();
  }

  // ── Card helpers ────────────────────────────────────────────────────────────

  /** Centralised card-grid refresh. Passes current available/claimed sets. */
  function refreshAllCards(): void {
    cardGrid.updateCards(cards.availableIds, cards.claimedIds);
    cardGrid.updateSummary(economy.totalWin, cards.claimedIds.size, economy.baseBet);
    runPanel.refresh(economy.totalWin, cards.claimedIds.size);
  }

  /**
   * Card click handler — claim-only path.
   *
   * Only AVAILABLE (green) cards are actionable; CardGrid already blocks clicks
   * on non-available cards, but we double-check here for safety.
   */
  function handleCardClick(cardId: string): void {
    const s = fsm.state;
    if (s === "running" || s === "resolve" || s === "betting") return;
    if (!cards.canClaim(cardId)) return;

    const { payoutMult, tier } = cards.claimOne(cardId);
    economy.addWin(payoutMult);

    if (tier >= 2) {
      run.addActions(1);
      if (s === "ended" && run.actions > 0) fsm.transition("idle");
    }

    // Update all cards (claimed card will be dim; all others lose "available").
    refreshAllCards();
    // Brief green flash on the just-claimed card.
    cardGrid.flashClaimAnimation(cardId);

    // Clear all reel locks so the next spin starts fresh.
    model.resetLocks();
    for (let i = 0; i < REEL_COUNT; i++) updateLockOverlay(reelViews[i], false);

    // Clear the card-gate and re-enable SPIN.
    runPanel.setSpinBlocked(false);
    toast.show("LOCKS CLEARED  •  SPIN TO CONTINUE", { duration: 1200 });

    devDrawer.devPanel.refreshInfo();
    syncReelControls(fsm.state);

    if (fsm.state === "ended") refreshEndOverlay();
  }

  // ── FSM listener ─────────────────────────────────────────────────────────────
  fsm.onChange((_, next) => {
    devDrawer.devPanel.syncState(next);
    devDrawer.devPanel.refreshInfo();
    runPanel.syncState(next);
    syncReelControls(next);

    const animating = next === "running" || next === "resolve";
    cardGrid.setSpin(animating);
    devDrawer.setSpinLocked(animating);

    applyVisibility(next);
  });

  // ── Refresh helpers ──────────────────────────────────────────────────────────
  function refreshAllReels(): void {
    for (let i = 0; i < REEL_COUNT; i++) {
      updateReelView(reelViews[i], model.reels[i].getVisible());
      updateLockOverlay(reelViews[i], model.isLocked(i));
    }
    // Card availability is computed in doSpin's onSpinResolved callback — not here.
    refreshAllCards();
    syncReelControls(fsm.state); // keeps nudge enable in sync with actions count
  }

  // ── End overlay (function declaration — hoisted, called above) ──────────────
  interface EndOverlay {
    container:  Container;
    winText:    Text;
    betText:    Text;
    profitText: Text;
  }

  function buildEndOverlay(): EndOverlay {
    const c = new Container();
    const OW = 340, OH = 180;

    const bg = new Graphics();
    bg.roundRect(0, 0, OW, OH, 10);
    bg.fill({ color: 0x0a0a20, alpha: 0.95 });
    bg.stroke({ color: 0xff4444, width: 2 });
    bg.eventMode = "none";
    c.addChild(bg);

    const t = new Text({ text: "RUN FINISHED", style: END_TITLE_STYLE });
    t.anchor.set(0.5, 0); t.x = OW / 2; t.y = 14;
    c.addChild(t);

    const winText = new Text({ text: "", style: END_STAT_STYLE });
    winText.anchor.set(0.5, 0); winText.x = OW / 2; winText.y = 50;
    c.addChild(winText);

    const betText = new Text({ text: "", style: END_STAT_STYLE });
    betText.anchor.set(0.5, 0); betText.x = OW / 2; betText.y = 72;
    c.addChild(betText);

    const profitText = new Text({ text: "", style: END_PROFIT_POS });
    profitText.anchor.set(0.5, 0); profitText.x = OW / 2; profitText.y = 98;
    c.addChild(profitText);

    const btnW = 220, btnH = 32;
    const btn  = new Container();
    btn.eventMode = "static"; btn.cursor = "pointer";
    const bBg = new Graphics();
    bBg.roundRect(0, 0, btnW, btnH, 5);
    bBg.fill({ color: 0x333366 }); bBg.stroke({ color: 0x6666cc, width: 2 });
    btn.addChild(bBg);
    const bTxt = new Text({ text: "RETURN TO BETTING", style: END_BTN_STYLE });
    bTxt.x = Math.round((btnW - bTxt.width) / 2);
    bTxt.y = Math.round((btnH - bTxt.height) / 2);
    btn.addChild(bTxt);
    btn.on("pointerdown", (e: FederatedPointerEvent) => { e.stopPropagation(); handleReturnToBetting(); });
    btn.on("pointerover", () => { bBg.tint = 0xaaaaff; });
    btn.on("pointerout",  () => { bBg.tint = 0xffffff; });
    btn.x = Math.round((OW - btnW) / 2);
    btn.y = OH - btnH - 12;
    c.addChild(btn);

    return { container: c, winText, betText, profitText };
  }

  function refreshEndOverlay(): void {
    endOverlayData.winText.text = `Total Win: ${economy.totalWin.toFixed(2)} FUN`;
    endOverlayData.betText.text = `Total Bet: ${economy.totalBet.toFixed(2)} FUN`;
    const p = economy.profit;
    endOverlayData.profitText.text  = `Profit: ${p >= 0 ? "+" : ""}${p.toFixed(2)} FUN`;
    endOverlayData.profitText.style = p >= 0 ? END_PROFIT_POS : END_PROFIT_NEG;
  }

  // ── Layout ──────────────────────────────────────────────────────────────────
  function layout(): void {
    const w = app.screen.width;
    const h = app.screen.height;

    gameRoot.x = Math.round((w - UI_W) / 2);
    gameRoot.y = PAD_TOP;

    // End overlay: centred horizontally, aligned with top of reel box
    endOverlay.x = Math.round((w - 340) / 2);
    endOverlay.y = PAD_TOP + REEL_SLOT_Y + CTRL_ABOVE; // absolute top of reel box

    devDrawer.resize(w, h);
  }

  // ── Boot ────────────────────────────────────────────────────────────────────
  refreshAllReels();
  devDrawer.devPanel.refreshInfo();
  devDrawer.devPanel.syncState(fsm.state);
  runPanel.syncState(fsm.state);

  applyVisibility(fsm.state); // starts in "betting"
  syncReelControls(fsm.state);

  layout();
  window.addEventListener("resize", layout);
}

main();
