import {
  Container,
  Graphics,
  Text,
  TextStyle,
  FederatedPointerEvent,
} from "pixi.js";
import { EconomyController } from "../game/EconomyController";
import { RunController } from "../game/RunController";

// ── Layout ────────────────────────────────────────────────────────────────────
const PANEL_W = 700;
const PANEL_H = 160;
const X = 14;

// ── Text styles ──────────────────────────────────────────────────────────────
const HEADING_STYLE = new TextStyle({ fontFamily: "monospace", fontSize: 18, fill: 0xffcc00, fontWeight: "bold" });
const LABEL_STYLE   = new TextStyle({ fontFamily: "monospace", fontSize: 13, fill: 0xcccccc });
const VALUE_STYLE   = new TextStyle({ fontFamily: "monospace", fontSize: 13, fill: 0xffffff, fontWeight: "bold" });
const BTN_STYLE     = new TextStyle({ fontFamily: "monospace", fontSize: 13, fill: 0xffffff });
const ANTE_ON_STYLE = new TextStyle({ fontFamily: "monospace", fontSize: 13, fill: 0xffaa00, fontWeight: "bold" });
const START_STYLE   = new TextStyle({ fontFamily: "monospace", fontSize: 15, fill: 0xffffff, fontWeight: "bold" });

// ── Bet button data ──────────────────────────────────────────────────────────
interface BetBtn {
  container: Container;
  bg: Graphics;
  value: number;
}

export class BetPanel extends Container {
  static readonly PANEL_W = PANEL_W;
  static readonly PANEL_H = PANEL_H;

  private economy: EconomyController;
  private run: RunController;
  private onStartRun: () => void;

  private betBtns: BetBtn[] = [];
  private anteBg!: Graphics;
  private anteLabel!: Text;
  private infoText!: Text;

  constructor(
    economy: EconomyController,
    run: RunController,
    onStartRun: () => void,
  ) {
    super();
    this.economy    = economy;
    this.run        = run;
    this.onStartRun = onStartRun;
    this.build();
    this.refresh();
  }

  // ── Build ──────────────────────────────────────────────────────────────────
  private build(): void {
    // Background
    const bg = new Graphics();
    bg.roundRect(0, 0, PANEL_W, PANEL_H, 8);
    bg.fill({ color: 0x1a1a3e, alpha: 0.95 });
    bg.stroke({ color: 0x3a3a6e, width: 2 });
    this.addChild(bg);

    let y = 12;

    // ── Heading ──────────────────────────────────────────────────────────────
    this.addChild(Object.assign(new Text({ text: "PLACE YOUR BET", style: HEADING_STYLE }), { x: X, y }));
    y += 30;

    // ── Bet buttons row ──────────────────────────────────────────────────────
    this.addChild(Object.assign(new Text({ text: "Bet:", style: LABEL_STYLE }), { x: X, y: y + 4 }));
    const BET_BTN_W = 72;
    const BET_BTN_H = 28;
    let bx = X + 40;
    for (const val of EconomyController.BET_OPTIONS) {
      const btn = this.makeBetButton(val, BET_BTN_W, BET_BTN_H);
      btn.container.x = bx;
      btn.container.y = y;
      this.addChild(btn.container);
      this.betBtns.push(btn);
      bx += BET_BTN_W + 6;
    }

    // ── Ante toggle ──────────────────────────────────────────────────────────
    const anteCont = new Container();
    anteCont.x = bx + 24;
    anteCont.y = y;
    anteCont.eventMode = "static";
    anteCont.cursor = "pointer";

    this.anteBg = new Graphics();
    anteCont.addChild(this.anteBg);

    this.anteLabel = new Text({ text: "ANTE BET: OFF", style: LABEL_STYLE });
    this.anteLabel.x = 10;
    this.anteLabel.y = Math.round((BET_BTN_H - 16) / 2);
    anteCont.addChild(this.anteLabel);

    anteCont.on("pointerdown", (e: FederatedPointerEvent) => {
      e.stopPropagation();
      this.economy.setAnteEnabled(!this.economy.anteEnabled);
      this.run.configure(this.economy.anteEnabled);
      this.refresh();
    });
    anteCont.on("pointerover", () => { this.anteBg.tint = 0xddddff; });
    anteCont.on("pointerout",  () => { this.anteBg.tint = 0xffffff; });
    this.addChild(anteCont);
    y += 38;

    // ── Info readout ─────────────────────────────────────────────────────────
    this.infoText = new Text({ text: "", style: VALUE_STYLE });
    this.infoText.x = X;
    this.infoText.y = y;
    this.addChild(this.infoText);
    y += 26;

    // ── START RUN button ─────────────────────────────────────────────────────
    const startW = 160;
    const startH = 34;
    const startBtn = new Container();
    startBtn.eventMode = "static";
    startBtn.cursor = "pointer";
    const sBg = new Graphics();
    sBg.roundRect(0, 0, startW, startH, 6);
    sBg.fill({ color: 0x1a4a1a });
    sBg.stroke({ color: 0x44cc44, width: 2 });
    startBtn.addChild(sBg);
    const sTxt = new Text({ text: "START RUN", style: START_STYLE });
    sTxt.x = Math.round((startW - sTxt.width) / 2);
    sTxt.y = Math.round((startH - sTxt.height) / 2);
    startBtn.addChild(sTxt);
    startBtn.on("pointerdown", (e: FederatedPointerEvent) => {
      e.stopPropagation();
      this.onStartRun();
    });
    startBtn.on("pointerover", () => { sBg.tint = 0xaaffaa; });
    startBtn.on("pointerout",  () => { sBg.tint = 0xffffff; });
    startBtn.x = Math.round((PANEL_W - startW) / 2);
    startBtn.y = y;
    this.addChild(startBtn);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private makeBetButton(value: number, w: number, h: number): BetBtn {
    const c = new Container();
    c.eventMode = "static";
    c.cursor = "pointer";
    const bg = new Graphics();
    c.addChild(bg);
    const txt = new Text({ text: `${value} FUN`, style: BTN_STYLE });
    txt.x = Math.round((w - txt.width) / 2);
    txt.y = Math.round((h - txt.height) / 2);
    c.addChild(txt);
    c.on("pointerdown", (e: FederatedPointerEvent) => {
      e.stopPropagation();
      this.economy.setBaseBet(value);
      this.refresh();
    });
    c.on("pointerover", () => { bg.tint = 0xccccff; });
    c.on("pointerout",  () => { bg.tint = 0xffffff; });
    return { container: c, bg, value };
  }

  private drawBetBtn(btn: BetBtn, selected: boolean): void {
    const w = 72, h = 28;
    btn.bg.clear();
    btn.bg.roundRect(0, 0, w, h, 4);
    if (selected) {
      btn.bg.fill({ color: 0x1a4a1a });
      btn.bg.stroke({ color: 0x44cc44, width: 2 });
    } else {
      btn.bg.fill({ color: 0x333355 });
      btn.bg.stroke({ color: 0x555577, width: 1 });
    }
  }

  private drawAnte(): void {
    const on = this.economy.anteEnabled;
    const w = 220, h = 28;
    this.anteBg.clear();
    this.anteBg.roundRect(0, 0, w, h, 4);
    if (on) {
      this.anteBg.fill({ color: 0x3a2200 });
      this.anteBg.stroke({ color: 0xffaa00, width: 2 });
    } else {
      this.anteBg.fill({ color: 0x333355 });
      this.anteBg.stroke({ color: 0x555577, width: 1 });
    }
    this.anteLabel.text  = on ? "ANTE BET: ON  (+25%, +3 act)" : "ANTE BET: OFF";
    this.anteLabel.style = on ? ANTE_ON_STYLE : LABEL_STYLE;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  refresh(): void {
    for (const btn of this.betBtns) {
      this.drawBetBtn(btn, btn.value === this.economy.baseBet);
    }
    this.drawAnte();

    const startAct = this.economy.anteEnabled ? RunController.ANTE_ACTIONS : RunController.DEFAULT_ACTIONS;
    this.infoText.text =
      `Bet: ${this.economy.baseBet} FUN` +
      `    Total Bet: ${this.economy.totalBet.toFixed(2)} FUN` +
      `    Start Actions: ${startAct}`;
  }
}
