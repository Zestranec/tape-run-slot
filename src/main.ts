import { Application, Container, Graphics, Text, TextStyle } from "pixi.js";
import { GameStateMachine } from "./core/GameStateMachine";
import { TapeSlotModel, REEL_COUNT } from "./game/TapeSlotModel";
import { VisibleDigits } from "./game/TapeReel";
import { ReelAnimator, ReelViewRef } from "./game/ReelAnimator";
import { SpinController } from "./game/SpinController";
import { RunController } from "./game/RunController";
import { DevPanel } from "./ui/DevPanel";

// ── Reel visual constants (must match ReelAnimator internals) ──────────────────
const REEL_WIDTH      = 72;
const REEL_HEIGHT     = 160;
const REEL_GAP        = 10;
const REEL_AREA_WIDTH = REEL_COUNT * REEL_WIDTH + (REEL_COUNT - 1) * REEL_GAP;

const CENTER_STYLE     = new TextStyle({ fontFamily: "monospace", fontSize: 54, fill: 0xffffff, fontWeight: "bold" });
const SIDE_STYLE       = new TextStyle({ fontFamily: "monospace", fontSize: 30, fill: 0x888899 });
const LOCK_LABEL_STYLE = new TextStyle({ fontFamily: "monospace", fontSize: 11, fill: 0xffaa00, fontWeight: "bold" });

// ReelView satisfies the ReelViewRef interface from ReelAnimator, plus lock-overlay refs.
interface ReelView extends ReelViewRef {
  container: Container;
  aboveText: Text;
  centerText: Text;
  belowText: Text;
  lockOverlay: Graphics;
  lockLabel: Text;
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

  // Lock overlay — amber tinted rect + "LOCK" label, hidden by default.
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

async function main() {
  const app = new Application();
  await app.init({ background: 0x12122a, resizeTo: window, antialias: true });
  document.body.appendChild(app.canvas);

  const fsm   = new GameStateMachine();
  const model = new TapeSlotModel(42);
  const run   = new RunController();

  // ── Reel views ────────────────────────────────────────────────────────────
  const reelsContainer = new Container();
  app.stage.addChild(reelsContainer);

  const reelViews: ReelView[] = [];
  for (let i = 0; i < REEL_COUNT; i++) {
    const rv = createReelView();
    rv.container.x = i * (REEL_WIDTH + REEL_GAP);
    rv.container.y = 0;
    reelsContainer.addChild(rv.container);
    reelViews.push(rv);
  }

  // ── Title ─────────────────────────────────────────────────────────────────
  const title = new Text({
    text: "TAPE RUN SLOT",
    style: new TextStyle({ fontFamily: "monospace", fontSize: 28, fill: 0xffcc00, fontWeight: "bold", letterSpacing: 4 }),
  });
  title.anchor.set(0.5, 1);
  app.stage.addChild(title);

  // ── Spin infrastructure ───────────────────────────────────────────────────
  const animator       = new ReelAnimator(reelViews, model, app.ticker);
  const spinController = new SpinController(model, fsm, run, animator);

  // ── Dev panel ─────────────────────────────────────────────────────────────
  const devPanel = new DevPanel(
    model,
    fsm,
    run,
    // onAction: after any instant action — refresh visuals
    () => {
      refreshAllReels();
      devPanel.refreshInfo();
    },
    // onSeedRebuild: reset spin sequence, clear overlays and last-spin display
    () => {
      spinController.reset();
      devPanel.clearLastSpin();
      for (let i = 0; i < REEL_COUNT; i++) updateLockOverlay(reelViews[i], false);
    },
    // onSpin: kick off a spin (SpinController enforces canSpend guard)
    () => {
      spinController.requestSpin(() => {
        refreshAllReels();
        devPanel.refreshInfo();
        if (spinController.lastSpin) devPanel.showLastSpin(spinController.lastSpin.deltas);

        // If the spin consumed the last action, end the run.
        if (run.actions === 0) {
          fsm.transition("ended");
        }
      });
    },
    // onNewRun: called after DevPanel resets run state — clean up external refs
    () => {
      spinController.reset();
      devPanel.clearLastSpin();
      for (let i = 0; i < REEL_COUNT; i++) updateLockOverlay(reelViews[i], false);
    },
  );
  app.stage.addChild(devPanel);

  // ── FSM state listener — synchronises all button states ───────────────────
  fsm.onChange((_, next) => {
    devPanel.syncState(next);
    devPanel.refreshInfo(); // refresh status text + action counts on every transition
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  function refreshAllReels(): void {
    for (let i = 0; i < REEL_COUNT; i++) {
      updateReelView(reelViews[i], model.reels[i].getVisible());
      updateLockOverlay(reelViews[i], model.isLocked(i));
    }
  }

  function layout(): void {
    const w = app.screen.width;
    const reelBlockTop = 60;

    reelsContainer.x = Math.round((w - REEL_AREA_WIDTH) / 2);
    reelsContainer.y = reelBlockTop;

    title.x = Math.round(w / 2);
    title.y = reelBlockTop - 10;

    devPanel.x = Math.round((w - 700) / 2);
    devPanel.y = reelBlockTop + REEL_HEIGHT + 30;
  }

  refreshAllReels();
  devPanel.refreshInfo();
  devPanel.syncState(fsm.state);
  layout();

  window.addEventListener("resize", layout);
}

main();
