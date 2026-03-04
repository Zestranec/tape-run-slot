import { Application, Container, Graphics, Text, TextStyle, FederatedPointerEvent } from "pixi.js";
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

// ─────────────────────────────────────────────────────────────────────────────
// REEL VISUAL CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const REEL_WIDTH      = 72;
const REEL_HEIGHT     = 160;
const REEL_GAP        = 10;
const REEL_AREA_WIDTH = REEL_COUNT * REEL_WIDTH + (REEL_COUNT - 1) * REEL_GAP;

// ─────────────────────────────────────────────────────────────────────────────
// LAYOUT CONSTANTS
//
// Everything inside gameRoot uses fixed local y offsets so no element can
// ever overlap another, regardless of screen size.
//
//   gameRoot.y = PAD_TOP                                 (= 16)
//
//   topBlock  (y=0 in gameRoot)
//   ├── title              y = REEL_TOP - 6              (= 38, anchor-bottom)
//   ├── reelsContainer     y = REEL_TOP                  (= 44)
//   ├── runPanel           y = PANEL_TOP  (run states)   (= 218)
//   └── betPanelContainer  y = PANEL_TOP  (betting only) (= 218)
//
//   cardsBlock  y = PANEL_TOP + RunPanel.PANEL_H + BLOCK_GAP  (= 322)
//   └── cardsContainer     y = 0
//
// During betting the cardsBlock is hidden, so betPanel's extra height (160)
// over runPanel's height (88) never causes a visual gap.
// ─────────────────────────────────────────────────────────────────────────────
const UI_W        = 700;
const PAD_TOP     = 16;          // gameRoot top padding
const REEL_TOP    = 44;          // reels y inside topBlock
const PANEL_GAP   = 14;          // between reel bottom and panel top
const BLOCK_GAP   = 16;          // between panel bottom and cardsBlock top

// Derived:
const PANEL_TOP   = REEL_TOP + REEL_HEIGHT + PANEL_GAP; // 218
// cardsBlock.y = PANEL_TOP + RunPanel.PANEL_H + BLOCK_GAP  — computed after RunPanel import

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

// ─────────────────────────────────────────────────────────────────────────────
// REEL VIEW
// ─────────────────────────────────────────────────────────────────────────────
interface ReelView extends ReelViewRef {
  container:   Container;
  aboveText:   Text;
  centerText:  Text;
  belowText:   Text;
  lockOverlay: Graphics;
  lockLabel:   Text;
}

function createReelView(): ReelView {
  const container = new Container();

  const bg = new Graphics();
  bg.roundRect(0, 0, REEL_WIDTH, REEL_HEIGHT, 6);
  bg.fill({ color: 0x22223a });
  bg.stroke({ color: 0x4a4a7a, width: 2 });
  container.addChild(bg);

  const aboveText = new Text({ text: "0", style: SIDE_STYLE });
  aboveText.anchor.set(0.5);
  aboveText.x = REEL_WIDTH / 2; aboveText.y = 30; aboveText.alpha = 0.4;
  container.addChild(aboveText);

  const centerText = new Text({ text: "0", style: CENTER_STYLE });
  centerText.anchor.set(0.5);
  centerText.x = REEL_WIDTH / 2; centerText.y = REEL_HEIGHT / 2;
  container.addChild(centerText);

  const belowText = new Text({ text: "0", style: SIDE_STYLE });
  belowText.anchor.set(0.5);
  belowText.x = REEL_WIDTH / 2; belowText.y = REEL_HEIGHT - 30; belowText.alpha = 0.4;
  container.addChild(belowText);

  const lockOverlay = new Graphics();
  lockOverlay.roundRect(1, 1, REEL_WIDTH - 2, REEL_HEIGHT - 2, 5);
  lockOverlay.fill({ color: 0xffaa00, alpha: 0.18 });
  lockOverlay.stroke({ color: 0xffaa00, width: 2 });
  lockOverlay.visible = false;
  container.addChild(lockOverlay);

  const lockLabel = new Text({ text: "LOCK", style: LOCK_LABEL_STYLE });
  lockLabel.anchor.set(0.5);
  lockLabel.x = REEL_WIDTH / 2; lockLabel.y = REEL_HEIGHT - 12;
  lockLabel.visible = false;
  container.addChild(lockLabel);

  return { container, aboveText, centerText, belowText, lockOverlay, lockLabel };
}

function updateReelView(view: ReelView, digits: VisibleDigits): void {
  view.aboveText.text  = String(digits.above);
  view.centerText.text = String(digits.center);
  view.belowText.text  = String(digits.below);
}

function updateLockOverlay(view: ReelView, locked: boolean): void {
  view.lockOverlay.visible = locked;
  view.lockLabel.visible   = locked;
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
  // Single movable anchor on stage. layout() only adjusts gameRoot.x/y.
  // All children use fixed local coordinates — overlap is structurally
  // impossible without changing the constants above.
  //
  // Z-ORDER within gameRoot:
  //   index 0 — cardsBlock  (behind, must not intercept topBlock events)
  //   index 1 — topBlock    (in front, always receives events first)
  //
  // PixiJS tests hits from highest index (front) to lowest (back), so
  // topBlock always wins before cardsBlock is ever tested.
  // ══════════════════════════════════════════════════════════════════════════
  const gameRoot = new Container();
  app.stage.addChild(gameRoot);

  // ── cardsBlock — added FIRST (index 0 = behind topBlock) ──────────────────
  // CARDS_TOP = PANEL_TOP + RunPanel.PANEL_H + BLOCK_GAP = 218 + 88 + 16 = 322
  const CARDS_TOP = PANEL_TOP + RunPanel.PANEL_H + BLOCK_GAP;

  const cardsBlock = new Container();
  cardsBlock.y = CARDS_TOP;
  // "passive": the container itself has no hit area of its own, only its
  // explicitly interactive children (individual card containers) are tested.
  cardsBlock.eventMode = "passive";
  gameRoot.addChild(cardsBlock); // index 0 — rendered behind topBlock

  // Clip mask — prevents cards from rendering or receiving events outside
  // their designated rectangle.
  const cardsMask = new Graphics();
  cardsMask.rect(0, 0, CardGrid.GRID_W, CardGrid.TOTAL_H);
  cardsMask.fill(0xffffff);
  cardsBlock.addChild(cardsMask);
  cardsBlock.mask = cardsMask;

  const cardGrid = new CardGrid((cardId) => handleClaim(cardId));
  cardsBlock.addChild(cardGrid);

  // ── topBlock — added SECOND (index 1 = in front of cardsBlock) ────────────
  const topBlock = new Container();
  gameRoot.addChild(topBlock); // index 1 — rendered in front, hit-tested first

  // Title — bottom-anchored, text sits above REEL_TOP
  const title = new Text({
    text: "TAPE RUN SLOT",
    style: new TextStyle({ fontFamily: "monospace", fontSize: 28, fill: 0xffcc00, fontWeight: "bold", letterSpacing: 4 }),
  });
  title.anchor.set(0.5, 1);
  title.x = Math.round(UI_W / 2);
  title.y = REEL_TOP - 6; // bottom of text is 6 px above reel box
  topBlock.addChild(title);

  // Reels — centred horizontally within UI_W
  const reelsContainer = new Container();
  reelsContainer.x = Math.round((UI_W - REEL_AREA_WIDTH) / 2);
  reelsContainer.y = REEL_TOP;
  topBlock.addChild(reelsContainer);

  const reelViews: ReelView[] = [];
  for (let i = 0; i < REEL_COUNT; i++) {
    const rv = createReelView();
    rv.container.x = i * (REEL_WIDTH + REEL_GAP);
    reelsContainer.addChild(rv.container);
    reelViews.push(rv);
  }

  // RunPanel — HUD + SPIN button; shown during all run states, hidden in betting
  // y = PANEL_TOP so it always starts immediately below the reel block.
  const animator       = new ReelAnimator(reelViews, model, app.ticker);
  const spinController = new SpinController(model, fsm, run, animator);

  // Shared spin handler — used by both RunPanel and DevPanel (inside DevDrawer)
  function doSpin(): void {
    if (fsm.state !== "idle") return;
    if (!run.canSpend(1)) return;
    spinController.requestSpin(() => {
      refreshAllReels();
      devDrawer.devPanel.refreshInfo();
      if (spinController.lastSpin) devDrawer.devPanel.showLastSpin(spinController.lastSpin.deltas);
      if (run.actions === 0) fsm.transition("ended");
    });
  }

  const runPanel = new RunPanel(run, economy, doSpin);
  runPanel.y = PANEL_TOP;
  topBlock.addChild(runPanel);

  // BetPanel — shown only in betting state, same vertical slot as runPanel
  const betPanelContainer = new Container();
  betPanelContainer.y = PANEL_TOP;
  topBlock.addChild(betPanelContainer);

  const betPanel = new BetPanel(economy, run, () => handleStartRun());
  betPanelContainer.addChild(betPanel);

  // ── DevDrawer — stage-level bottom overlay (not part of layout blocks) ────
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

  // ── End overlay — stage-level, floats above the reel area ─────────────────
  // buildEndOverlay is a function *declaration* (hoisted) so it can be called
  // here even though its source text appears later in main().
  // Declaring endOverlay as a const here (before applyVisibility is ever called)
  // eliminates the TDZ that caused the original ReferenceError.
  const endOverlayData = buildEndOverlay();
  const endOverlay     = endOverlayData.container;
  endOverlay.visible   = false;
  app.stage.addChild(endOverlay);

  // DevDrawer is the topmost stage element so its handle is always hittable
  app.stage.addChild(devDrawer.container);

  // ── Visibility ────────────────────────────────────────────────────────────
  function applyVisibility(state: GameState): void {
    const betting = state === "betting";
    const inRun   = !betting;

    // topBlock children
    title.visible             = inRun;
    runPanel.visible          = inRun;
    betPanelContainer.visible = betting;

    // cardsBlock — visible only during run
    cardsBlock.visible     = inRun;
    endOverlay.visible     = state === "ended";

    if (state === "ended") refreshEndOverlay();
  }

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleStartRun(): void {
    if (fsm.state !== "betting") return;

    run.configure(economy.anteEnabled);
    run.resetRun();
    economy.resetRun();
    cards.resetRun();
    model.resetOffsets();
    model.resetLocks();
    spinController.reset();
    devDrawer.devPanel.clearLastSpin();
    for (let i = 0; i < REEL_COUNT; i++) updateLockOverlay(reelViews[i], false);

    fsm.transition("idle");

    refreshAllReels();
    devDrawer.devPanel.refreshInfo();
  }

  function handleReturnToBetting(): void {
    if (fsm.state !== "ended") return;
    fsm.transition("betting");
    betPanel.refresh();
  }

  function handleClaim(cardId: string): void {
    const s = fsm.state;
    if (s !== "idle" && s !== "ended") return;
    if (!cards.canClaim(cardId)) return;

    const { payoutMult, tier } = cards.claim(cardId);
    economy.addWin(payoutMult);

    if (tier >= 2) {
      run.addActions(1);
      if (s === "ended" && run.actions > 0) fsm.transition("idle");
    }

    const digits = model.getVisibleCenterDigits();
    cards.updateReady(digits);
    cardGrid.updateCards(cards.readyIds, cards.claimedIds);
    cardGrid.updateSummary(economy.totalWin, cards.claimedIds.size, economy.baseBet);
    runPanel.refresh(economy.totalWin, cards.claimedIds.size);
    devDrawer.devPanel.refreshInfo();

    if (fsm.state === "ended") refreshEndOverlay();
  }

  // ── FSM listener ──────────────────────────────────────────────────────────
  fsm.onChange((_, next) => {
    devDrawer.devPanel.syncState(next);
    devDrawer.devPanel.refreshInfo();
    runPanel.syncState(next);

    const animating = next === "running" || next === "resolve";
    cardGrid.setSpin(animating);
    devDrawer.setSpinLocked(animating);

    applyVisibility(next);
  });

  // ── Refresh helpers ────────────────────────────────────────────────────────
  function refreshAllReels(): void {
    for (let i = 0; i < REEL_COUNT; i++) {
      updateReelView(reelViews[i], model.reels[i].getVisible());
      updateLockOverlay(reelViews[i], model.isLocked(i));
    }
    const digits = model.getVisibleCenterDigits();
    cards.updateReady(digits);
    cardGrid.updateCards(cards.readyIds, cards.claimedIds);
    cardGrid.updateSummary(economy.totalWin, cards.claimedIds.size, economy.baseBet);
    runPanel.refresh(economy.totalWin, cards.claimedIds.size);
  }

  // ── End overlay ───────────────────────────────────────────────────────────
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
    const btn = new Container();
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

  // ── Layout ────────────────────────────────────────────────────────────────
  // Only gameRoot.x needs to change on resize — all children use fixed local
  // coordinates, so nothing inside can shift relative to one another.
  function layout(): void {
    const w = app.screen.width;
    const h = app.screen.height;

    // Centre the entire content column on the screen
    gameRoot.x = Math.round((w - UI_W) / 2);
    gameRoot.y = PAD_TOP;

    // End overlay: horizontally centred; vertically aligned with reel top
    endOverlay.x = Math.round((w - 340) / 2);
    endOverlay.y = PAD_TOP + REEL_TOP; // absolute reel top = 16 + 44 = 60

    // DevDrawer: pinned to screen bottom
    devDrawer.resize(w, h);
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  refreshAllReels();
  devDrawer.devPanel.refreshInfo();
  devDrawer.devPanel.syncState(fsm.state);
  runPanel.syncState(fsm.state);
  cardGrid.updateSummary(economy.totalWin, cards.claimedIds.size, economy.baseBet);

  applyVisibility(fsm.state); // starts in "betting"

  layout();
  window.addEventListener("resize", layout);
}

main();
