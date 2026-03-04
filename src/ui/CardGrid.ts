import {
  Container,
  Graphics,
  Rectangle,
  Text,
  TextStyle,
  FederatedPointerEvent,
  Ticker,
} from "pixi.js";
import { CARDS } from "../config/cards";
import { CardDef } from "../types/CardTypes";
import { fitTextToBox } from "./textFit";

// ── Layout constants ─────────────────────────────────────────────────────────
const COLS       = 5;
const CARD_W     = 136;
const CARD_H     = 68;
const GAP        = 5;

// ── Card inner text zones (all relative to card top-left) ────────────────────
const TEXT_PAD   = 5;                      // horizontal padding each side
const TEXT_W     = CARD_W - TEXT_PAD * 2;  // 126 px inner width
const NAME_Y     = 17;                     // title top
const NAME_H     = 13;                     // title max height  (≤1 line)
const DESC_Y     = 31;                     // description top
const DESC_H     = 22;                     // description max height (≤2 lines)
const STATE_Y    = 54;                     // state badge top

const SUMMARY_H   = 30;
const SUMMARY_GAP = 8;

// ── Tier accent colours ───────────────────────────────────────────────────────
const TIER_COLOR: Record<number, number> = {
  1: 0x888888,
  2: 0x44aaff,
  3: 0xcc44ff,
  4: 0xffcc00,
};

// ── Visual card states ────────────────────────────────────────────────────────
type CardState = "normal" | "available" | "almost" | "claimed";

// ── Text styles ───────────────────────────────────────────────────────────────
const SUMMARY_STYLE     = new TextStyle({ fontFamily: "Arial, sans-serif", fontSize: 13, fill: 0xcccccc });
const SUMMARY_WIN_STYLE = new TextStyle({ fontFamily: "Arial, sans-serif", fontSize: 13, fill: 0xffcc00, fontWeight: "bold" });
const CARD_TIER_STYLE   = new TextStyle({ fontFamily: "Arial, sans-serif", fontSize: 10, fontWeight: "bold", fill: 0xffffff });
const CARD_PAYOUT_STYLE = new TextStyle({ fontFamily: "Arial, sans-serif", fontSize: 10, fill: 0xaaffaa });
const AVAILABLE_STYLE   = new TextStyle({ fontFamily: "Arial, sans-serif", fontSize: 11, fill: 0x44ff88, fontWeight: "bold" });
const ALMOST_STYLE      = new TextStyle({ fontFamily: "Arial, sans-serif", fontSize: 11, fill: 0xffdd44, fontWeight: "bold" });
const CLAIMED_STYLE     = new TextStyle({ fontFamily: "Arial, sans-serif", fontSize: 11, fill: 0x666688 });
const FLASH_STYLE       = new TextStyle({ fontFamily: "Arial, sans-serif", fontSize: 11, fill: 0xffffff, fontWeight: "bold" });

// ── Pulse animation ───────────────────────────────────────────────────────────
const PULSE_MIN    = 1.00;
const PULSE_MAX    = 1.05;
const PULSE_PERIOD = 1000; // ms per full cycle

// ── Per-card view ─────────────────────────────────────────────────────────────
interface CardView {
  container:  Container;
  bg:         Graphics;
  tierText:   Text;
  stateLabel: Text;
  /** Grid slot position — never mutated, used to safely reset pivot offsets. */
  baseX:      number;
  baseY:      number;
}

export class CardGrid extends Container {
  private cardViews = new Map<string, CardView>();
  private summaryBetText!:     Text;
  private summaryWinText!:     Text;
  private summaryClaimedText!: Text;

  private onCardClick: (cardId: string) => void;

  private _availableIds: ReadonlySet<string> = new Set();
  private _claimedIds:   ReadonlySet<string> = new Set();
  private _almostIds:    ReadonlySet<string> = new Set();

  // Pulse state — containers currently being animated
  private _pulsing: Container[] = [];
  private _pulseMs = 0;

  static readonly GRID_W  = COLS * CARD_W + (COLS - 1) * GAP;
  static readonly TOTAL_H = SUMMARY_H + SUMMARY_GAP + 4 * CARD_H + 3 * GAP;

  constructor(onCardClick: (cardId: string) => void, ticker?: Ticker) {
    super();
    this.onCardClick = onCardClick;
    this.buildSummary();
    this.buildCards();
    if (ticker) this._attachTicker(ticker);
  }

  // ── Ticker / pulse ────────────────────────────────────────────────────────────
  private _attachTicker(ticker: Ticker): void {
    ticker.add((t: Ticker) => {
      if (this._pulsing.length === 0) return;
      this._pulseMs = (this._pulseMs + t.deltaMS) % PULSE_PERIOD;
      // sin oscillates -1..1; map to PULSE_MIN..PULSE_MAX
      const sin = Math.sin((this._pulseMs / PULSE_PERIOD) * Math.PI * 2);
      const s   = PULSE_MIN + ((sin + 1) / 2) * (PULSE_MAX - PULSE_MIN);
      for (const c of this._pulsing) {
        c.scale.set(s);
      }
    });
  }

  /** Stop all active pulses and reset scales to 1. */
  private _stopPulse(): void {
    for (const c of this._pulsing) c.scale.set(1);
    this._pulsing = [];
    this._pulseMs = 0;
  }

  // ── Summary bar ───────────────────────────────────────────────────────────────
  private buildSummary(): void {
    const bg = new Graphics();
    bg.roundRect(0, 0, CardGrid.GRID_W, SUMMARY_H, 4);
    bg.fill({ color: 0x16162c });
    bg.stroke({ color: 0x3a3a5a, width: 1 });
    bg.eventMode = "none";
    this.addChild(bg);

    this.summaryBetText = new Text({ text: "Bet: 10 FUN", style: SUMMARY_STYLE });
    this.summaryBetText.x = 8;
    this.summaryBetText.y = Math.round((SUMMARY_H - this.summaryBetText.height) / 2);
    this.addChild(this.summaryBetText);

    this.summaryWinText = new Text({ text: "Win: 0.00 FUN", style: SUMMARY_WIN_STYLE });
    this.summaryWinText.anchor.set(0.5, 0);
    this.summaryWinText.x = Math.round(CardGrid.GRID_W / 2);
    this.summaryWinText.y = Math.round((SUMMARY_H - this.summaryWinText.height) / 2);
    this.addChild(this.summaryWinText);

    this.summaryClaimedText = new Text({ text: "Claimed: 0 / 20", style: SUMMARY_STYLE });
    this.summaryClaimedText.anchor.set(1, 0);
    this.summaryClaimedText.x = CardGrid.GRID_W - 8;
    this.summaryClaimedText.y = Math.round((SUMMARY_H - this.summaryClaimedText.height) / 2);
    this.addChild(this.summaryClaimedText);
  }

  // ── Card grid ─────────────────────────────────────────────────────────────────
  private buildCards(): void {
    const offsetY = SUMMARY_H + SUMMARY_GAP;

    CARDS.forEach((card, idx) => {
      const col  = idx % COLS;
      const row  = Math.floor(idx / COLS);
      const cx   = col * (CARD_W + GAP);
      const cy   = offsetY + row * (CARD_H + GAP);
      const view = this.buildCardView(card, cx, cy);
      this.cardViews.set(card.id, view);
      this.addChild(view.container);
    });
  }

  private buildCardView(card: CardDef, cx: number, cy: number): CardView {
    const c = new Container();
    c.x         = cx;
    c.y         = cy;
    c.eventMode = "static";
    c.cursor    = "default";
    c.hitArea   = new Rectangle(0, 0, CARD_W, CARD_H);

    const bg = new Graphics();
    this.drawCardBg(bg, "normal");
    c.addChild(bg);

    // Header row: tier badge (left) + payout (right)
    const tierStyle = new TextStyle({ ...CARD_TIER_STYLE, fill: TIER_COLOR[card.tier] });
    const tierText  = new Text({ text: `T${card.tier}`, style: tierStyle });
    tierText.x = TEXT_PAD; tierText.y = 4;
    c.addChild(tierText);

    const payoutText = new Text({ text: `${card.payoutMult.toFixed(2)}x`, style: CARD_PAYOUT_STYLE });
    payoutText.anchor.set(1, 0);
    payoutText.x = CARD_W - TEXT_PAD; payoutText.y = 4;
    c.addChild(payoutText);

    // Title — own style so fitTextToBox can mutate fontSize safely
    const nameStyle = new TextStyle({ fontFamily: "Arial, sans-serif", fontSize: 12, fill: 0xffffff, fontWeight: "bold" });
    const nameText  = new Text({ text: card.name, style: nameStyle });
    nameText.anchor.set(0.5, 0);
    nameText.x = CARD_W / 2;
    nameText.y = NAME_Y;
    fitTextToBox(nameText, card.name, TEXT_W, NAME_H, { maxFontSize: 12, minFontSize: 10, ellipsis: true });
    c.addChild(nameText);

    // Description — own style so fitTextToBox can mutate fontSize safely
    const descStyle = new TextStyle({ fontFamily: "Arial, sans-serif", fontSize: 10, fill: 0x9999bb });
    const descText  = new Text({ text: card.description, style: descStyle });
    descText.anchor.set(0.5, 0);
    descText.x = CARD_W / 2;
    descText.y = DESC_Y;
    fitTextToBox(descText, card.description, TEXT_W, DESC_H, { maxFontSize: 10, minFontSize: 10, ellipsis: true });
    c.addChild(descText);

    // State badge (READY / ALMOST / CLAIMED)
    const stateLabel = new Text({ text: "", style: AVAILABLE_STYLE });
    stateLabel.anchor.set(0.5, 0);
    stateLabel.x = CARD_W / 2;
    stateLabel.y = STATE_Y;
    stateLabel.visible = false;
    c.addChild(stateLabel);

    c.on("pointerdown", (e: FederatedPointerEvent) => {
      e.stopPropagation();
      if (!this._availableIds.has(card.id)) return;
      this.onCardClick(card.id);
    });

    return { container: c, bg, tierText, stateLabel, baseX: cx, baseY: cy };
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  /**
   * Repaint all cards from the given state sets.
   *
   * @param availableIds  Green — claimable this spin.
   * @param claimedIds    Dimmed — permanently claimed.
   * @param almostIds     Yellow pulsing — distance=1 from matching.
   */
  updateCards(
    availableIds: ReadonlySet<string>,
    claimedIds:   ReadonlySet<string>,
    almostIds:    ReadonlySet<string> = new Set(),
  ): void {
    this._availableIds = availableIds;
    this._claimedIds   = claimedIds;
    this._almostIds    = almostIds;

    this._stopPulse(); // clear old animations before re-classifying

    for (const card of CARDS) {
      this.applyCardState(this.cardViews.get(card.id)!, card.id);
    }
  }

  updateSummary(totalWin: number, claimedCount: number, baseBet: number): void {
    this.summaryBetText.text     = `Bet: ${baseBet} FUN`;
    this.summaryWinText.text     = `Win: ${totalWin.toFixed(2)} FUN`;
    this.summaryClaimedText.text = `Claimed: ${claimedCount} / 20`;
  }

  setSpin(animating: boolean): void {
    for (const [, view] of this.cardViews) {
      view.container.eventMode = animating ? "none" : "static";
    }
  }

  flashClaimAnimation(cardId: string): void {
    const view = this.cardViews.get(cardId);
    if (!view) return;

    view.bg.clear();
    view.bg.roundRect(0, 0, CARD_W, CARD_H, 4);
    view.bg.fill({ color: 0x22ee66 });
    view.bg.stroke({ color: 0x88ffaa, width: 3 });
    view.container.alpha    = 1;
    view.stateLabel.text    = "✓ CLAIMED";
    view.stateLabel.style   = FLASH_STYLE;
    view.stateLabel.visible = true;

    setTimeout(() => {
      this.drawCardBg(view.bg, "claimed");
      view.container.alpha    = 0.35;
      view.stateLabel.text    = "CLAIMED";
      view.stateLabel.style   = CLAIMED_STYLE;
    }, 250);
  }

  // ── Visuals ───────────────────────────────────────────────────────────────────

  private drawCardBg(bg: Graphics, state: CardState): void {
    bg.clear();
    bg.roundRect(0, 0, CARD_W, CARD_H, 4);
    switch (state) {
      case "claimed":
        bg.fill({ color: 0x0e0e1e });
        bg.stroke({ color: 0x2a2a3a, width: 1 });
        break;
      case "available":
        bg.fill({ color: 0x0a2218 });
        bg.stroke({ color: 0x44ff88, width: 2 });
        break;
      case "almost":
        bg.fill({ color: 0x221e08 });
        bg.stroke({ color: 0xffdd44, width: 2 });
        break;
      case "normal":
      default:
        bg.fill({ color: 0x1a1a30 });
        bg.stroke({ color: 0x38384e, width: 1 });
    }
  }

  private applyCardState(view: CardView, cardId: string): void {
    const available = this._availableIds.has(cardId);
    const claimed   = this._claimedIds.has(cardId);
    const almost    = !available && !claimed && this._almostIds.has(cardId);

    // Always restore base position + neutral scale before applying state.
    // This ensures pivot-based scale from a previous "almost" state is undone.
    view.container.scale.set(1);
    view.container.pivot.set(0, 0);
    view.container.x = view.baseX;
    view.container.y = view.baseY;

    if (claimed) {
      this.drawCardBg(view.bg, "claimed");
      view.container.alpha    = 0.35;
      view.container.cursor   = "default";
      view.stateLabel.text    = "CLAIMED";
      view.stateLabel.style   = CLAIMED_STYLE;
      view.stateLabel.visible = true;

    } else if (available) {
      this.drawCardBg(view.bg, "available");
      view.container.alpha    = 1;
      view.container.cursor   = "pointer";
      view.stateLabel.text    = "★ READY";
      view.stateLabel.style   = AVAILABLE_STYLE;
      view.stateLabel.visible = true;

    } else if (almost) {
      this.drawCardBg(view.bg, "almost");
      view.container.alpha    = 1;
      view.container.cursor   = "default"; // not clickable
      view.stateLabel.text    = "~ CLOSE";
      view.stateLabel.style   = ALMOST_STYLE;
      view.stateLabel.visible = true;

      // Scale from card centre — shift position to compensate for pivot.
      view.container.pivot.set(CARD_W / 2, CARD_H / 2);
      view.container.x = view.baseX + CARD_W / 2;
      view.container.y = view.baseY + CARD_H / 2;
      this._pulsing.push(view.container);

    } else {
      this.drawCardBg(view.bg, "normal");
      view.container.alpha    = 1;
      view.container.cursor   = "default";
      view.stateLabel.visible = false;
    }
  }
}
