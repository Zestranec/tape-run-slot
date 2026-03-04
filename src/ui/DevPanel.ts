import { Container, Graphics, Text, TextStyle, FederatedPointerEvent } from "pixi.js";
import { TapeSlotModel } from "../game/TapeSlotModel";
import { GameStateMachine } from "../core/GameStateMachine";
import { RNG } from "../core/RNG";

const LABEL_STYLE = new TextStyle({
  fontFamily: "monospace",
  fontSize: 14,
  fill: 0xcccccc,
});

const VALUE_STYLE = new TextStyle({
  fontFamily: "monospace",
  fontSize: 14,
  fill: 0xffffff,
  fontWeight: "bold",
});

const BTN_STYLE = new TextStyle({
  fontFamily: "monospace",
  fontSize: 13,
  fill: 0xffffff,
});

const HEADING_STYLE = new TextStyle({
  fontFamily: "monospace",
  fontSize: 16,
  fill: 0xffcc00,
  fontWeight: "bold",
});

function makeButton(
  label: string,
  width: number,
  height: number,
  onClick: () => void
): Container {
  const container = new Container();
  container.eventMode = "static";
  container.cursor = "pointer";

  const bg = new Graphics();
  bg.roundRect(0, 0, width, height, 4);
  bg.fill({ color: 0x444466 });
  bg.stroke({ color: 0x6666aa, width: 1 });
  container.addChild(bg);

  const txt = new Text({ text: label, style: BTN_STYLE });
  txt.x = Math.round((width - txt.width) / 2);
  txt.y = Math.round((height - txt.height) / 2);
  container.addChild(txt);

  container.on("pointerdown", (e: FederatedPointerEvent) => {
    e.stopPropagation();
    onClick();
  });

  container.on("pointerover", () => {
    bg.tint = 0xaaaaff;
  });
  container.on("pointerout", () => {
    bg.tint = 0xffffff;
  });

  return container;
}

export class DevPanel extends Container {
  private model: TapeSlotModel;
  private fsm: GameStateMachine;
  private seedValue: number;
  private selectedReel: number = 0;

  private seedText!: Text;
  private offsetsText!: Text;
  private visibleText!: Text;
  private lengthText!: Text;
  private selectedReelText!: Text;
  private onAction: () => void;

  /** Counter used for "Randomize Offsets" — increments to give different results each click. */
  private randomCounter: number = 0;

  constructor(
    model: TapeSlotModel,
    fsm: GameStateMachine,
    onAction: () => void
  ) {
    super();
    this.model = model;
    this.fsm = fsm;
    this.seedValue = model.seed;
    this.onAction = onAction;
    this.build();
  }

  private guardAction(fn: () => void): void {
    if (this.fsm.isLocked) return;
    this.fsm.runInstant();
    fn();
    this.onAction();
  }

  private build(): void {
    const bg = new Graphics();
    bg.roundRect(0, 0, 700, 240, 8);
    bg.fill({ color: 0x1a1a3e, alpha: 0.95 });
    bg.stroke({ color: 0x3a3a6e, width: 2 });
    this.addChild(bg);

    let y = 10;
    const leftX = 14;

    const heading = new Text({ text: "DEV CONTROL PANEL", style: HEADING_STYLE });
    heading.x = leftX;
    heading.y = y;
    this.addChild(heading);
    y += 26;

    // --- Info row ---
    const seedLabel = new Text({ text: "Seed:", style: LABEL_STYLE });
    seedLabel.x = leftX;
    seedLabel.y = y;
    this.addChild(seedLabel);

    this.seedText = new Text({
      text: String(this.seedValue),
      style: VALUE_STYLE,
    });
    this.seedText.x = leftX + 50;
    this.seedText.y = y;
    this.addChild(this.seedText);

    const lLabel = new Text({ text: "L:", style: LABEL_STYLE });
    lLabel.x = leftX + 160;
    lLabel.y = y;
    this.addChild(lLabel);

    this.lengthText = new Text({
      text: String(this.model.tapeLength),
      style: VALUE_STYLE,
    });
    this.lengthText.x = leftX + 180;
    this.lengthText.y = y;
    this.addChild(this.lengthText);
    y += 20;

    const offsetsLabel = new Text({ text: "Offsets:", style: LABEL_STYLE });
    offsetsLabel.x = leftX;
    offsetsLabel.y = y;
    this.addChild(offsetsLabel);

    this.offsetsText = new Text({
      text: this.model.getOffsets().join(", "),
      style: VALUE_STYLE,
    });
    this.offsetsText.x = leftX + 80;
    this.offsetsText.y = y;
    this.addChild(this.offsetsText);
    y += 20;

    const visLabel = new Text({ text: "Visible:", style: LABEL_STYLE });
    visLabel.x = leftX;
    visLabel.y = y;
    this.addChild(visLabel);

    this.visibleText = new Text({
      text: this.model.getVisibleString(),
      style: VALUE_STYLE,
    });
    this.visibleText.x = leftX + 80;
    this.visibleText.y = y;
    this.addChild(this.visibleText);
    y += 28;

    // --- Seed controls row ---
    const seedMinus = makeButton("Seed -1", 70, 26, () => {
      this.guardAction(() => {
        this.seedValue = Math.max(0, this.seedValue - 1);
        this.model.rebuildFromSeed(this.seedValue);
        this.randomCounter = 0;
      });
    });
    seedMinus.x = leftX;
    seedMinus.y = y;
    this.addChild(seedMinus);

    const seedPlus = makeButton("Seed +1", 70, 26, () => {
      this.guardAction(() => {
        this.seedValue += 1;
        this.model.rebuildFromSeed(this.seedValue);
        this.randomCounter = 0;
      });
    });
    seedPlus.x = leftX + 78;
    seedPlus.y = y;
    this.addChild(seedPlus);

    const seedSet10 = makeButton("Seed +10", 76, 26, () => {
      this.guardAction(() => {
        this.seedValue += 10;
        this.model.rebuildFromSeed(this.seedValue);
        this.randomCounter = 0;
      });
    });
    seedSet10.x = leftX + 156;
    seedSet10.y = y;
    this.addChild(seedSet10);

    const applySeed = makeButton("Apply Seed", 96, 26, () => {
      this.guardAction(() => {
        this.model.rebuildFromSeed(this.seedValue);
        this.randomCounter = 0;
      });
    });
    applySeed.x = leftX + 240;
    applySeed.y = y;
    this.addChild(applySeed);

    const seedInputLabel = new Text({
      text: "(use Seed ±1/+10 to change)",
      style: new TextStyle({ fontFamily: "monospace", fontSize: 11, fill: 0x888888 }),
    });
    seedInputLabel.x = leftX + 345;
    seedInputLabel.y = y + 6;
    this.addChild(seedInputLabel);

    y += 36;

    // --- Reel controls row ---
    const reelLabel = new Text({ text: "Reel:", style: LABEL_STYLE });
    reelLabel.x = leftX;
    reelLabel.y = y + 4;
    this.addChild(reelLabel);

    this.selectedReelText = new Text({
      text: String(this.selectedReel + 1),
      style: VALUE_STYLE,
    });
    this.selectedReelText.x = leftX + 50;
    this.selectedReelText.y = y + 4;
    this.addChild(this.selectedReelText);

    const prevReel = makeButton("<", 28, 26, () => {
      this.selectedReel = (this.selectedReel + 6) % 7;
      this.refreshInfo();
    });
    prevReel.x = leftX + 72;
    prevReel.y = y;
    this.addChild(prevReel);

    const nextReel = makeButton(">", 28, 26, () => {
      this.selectedReel = (this.selectedReel + 1) % 7;
      this.refreshInfo();
    });
    nextReel.x = leftX + 106;
    nextReel.y = y;
    this.addChild(nextReel);

    const nudgeUp = makeButton("Nudge Up", 86, 26, () => {
      this.guardAction(() => {
        this.model.reels[this.selectedReel].nudge(-1);
      });
    });
    nudgeUp.x = leftX + 150;
    nudgeUp.y = y;
    this.addChild(nudgeUp);

    const nudgeDown = makeButton("Nudge Down", 100, 26, () => {
      this.guardAction(() => {
        this.model.reels[this.selectedReel].nudge(1);
      });
    });
    nudgeDown.x = leftX + 244;
    nudgeDown.y = y;
    this.addChild(nudgeDown);

    y += 36;

    // --- Utility buttons row ---
    const randomize = makeButton("Randomize Offsets", 156, 26, () => {
      this.guardAction(() => {
        this.randomCounter++;
        const subRng = new RNG(this.seedValue * 9999 + this.randomCounter);
        this.model.randomizeOffsets(subRng);
      });
    });
    randomize.x = leftX;
    randomize.y = y;
    this.addChild(randomize);

    const reset = makeButton("Reset Offsets to 0", 160, 26, () => {
      this.guardAction(() => {
        this.model.resetOffsets();
      });
    });
    reset.x = leftX + 166;
    reset.y = y;
    this.addChild(reset);
  }

  refreshInfo(): void {
    this.seedText.text = String(this.seedValue);
    this.lengthText.text = String(this.model.tapeLength);
    this.offsetsText.text = this.model.getOffsets().join(", ");
    this.visibleText.text = this.model.getVisibleString();
    this.selectedReelText.text = String(this.selectedReel + 1);
  }
}
