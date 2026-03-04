import { Application, Container, Graphics, Text, TextStyle } from "pixi.js";
import { GameStateMachine } from "./core/GameStateMachine";
import { TapeSlotModel, REEL_COUNT } from "./game/TapeSlotModel";
import { VisibleDigits } from "./game/TapeReel";
import { DevPanel } from "./ui/DevPanel";

const REEL_WIDTH = 72;
const REEL_HEIGHT = 160;
const REEL_GAP = 10;
const REEL_AREA_WIDTH = REEL_COUNT * REEL_WIDTH + (REEL_COUNT - 1) * REEL_GAP;

const CENTER_STYLE = new TextStyle({
  fontFamily: "monospace",
  fontSize: 54,
  fill: 0xffffff,
  fontWeight: "bold",
});

const SIDE_STYLE = new TextStyle({
  fontFamily: "monospace",
  fontSize: 30,
  fill: 0x888899,
});

interface ReelView {
  container: Container;
  aboveText: Text;
  centerText: Text;
  belowText: Text;
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
  aboveText.x = REEL_WIDTH / 2;
  aboveText.y = 30;
  aboveText.alpha = 0.4;
  container.addChild(aboveText);

  const centerText = new Text({ text: "0", style: CENTER_STYLE });
  centerText.anchor.set(0.5);
  centerText.x = REEL_WIDTH / 2;
  centerText.y = REEL_HEIGHT / 2;
  container.addChild(centerText);

  const belowText = new Text({ text: "0", style: SIDE_STYLE });
  belowText.anchor.set(0.5);
  belowText.x = REEL_WIDTH / 2;
  belowText.y = REEL_HEIGHT - 30;
  belowText.alpha = 0.4;
  container.addChild(belowText);

  return { container, aboveText, centerText, belowText };
}

function updateReelView(view: ReelView, digits: VisibleDigits): void {
  view.aboveText.text = String(digits.above);
  view.centerText.text = String(digits.center);
  view.belowText.text = String(digits.below);
}

async function main() {
  const app = new Application();
  await app.init({
    background: 0x12122a,
    resizeTo: window,
    antialias: true,
  });
  document.body.appendChild(app.canvas);

  const fsm = new GameStateMachine();
  const model = new TapeSlotModel(42);

  // --- Reels container ---
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

  // --- Title ---
  const title = new Text({
    text: "TAPE RUN SLOT",
    style: new TextStyle({
      fontFamily: "monospace",
      fontSize: 28,
      fill: 0xffcc00,
      fontWeight: "bold",
      letterSpacing: 4,
    }),
  });
  title.anchor.set(0.5, 1);
  app.stage.addChild(title);

  // --- Dev Panel ---
  const devPanel = new DevPanel(model, fsm, () => {
    refreshAllReels();
    devPanel.refreshInfo();
  });
  app.stage.addChild(devPanel);

  function refreshAllReels(): void {
    for (let i = 0; i < REEL_COUNT; i++) {
      updateReelView(reelViews[i], model.reels[i].getVisible());
    }
  }

  function layout(): void {
    const w = app.screen.width;
    const h = app.screen.height;

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
  layout();

  // Expose for verification/testing (dev only)
  (window as unknown as { __TAPE_SLOT_DEBUG__?: { visible: () => string; offsets: () => string; seed: () => number } }).__TAPE_SLOT_DEBUG__ = {
    visible: () => model.getVisibleString(),
    offsets: () => model.getOffsets().join(", "),
    seed: () => model.seed,
  };

  window.addEventListener("resize", layout);
}

main();
