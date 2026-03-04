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

// ── Layout constants ─────────────────────────────────────────────────────────
const COLS       = 5;
const CARD_W     = 136;
const CARD_H     = 68;
const GAP        = 5;
// Grid width  = 5 × 136 + 4 × 5 = 700  (matches UI_W)
// Grid height = 4 ×  68 + 3 × 5 = 287

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
type CardState = "normal" | "available" | "claimed";

// ── Text styles ───────────────────────────────────────────────────────────────
const SUMMARY_STYLE     = new TextStyle({ fontFamily: "monospace", fontSize: 13, fill: 0xcccccc });
const SUMMARY_WIN_STYLE = new TextStyle({ fontFamily: "monospace", fontSize: 13, fill: 0xffcc00, fontWeight: "bold" });
const CARD_NAME_STYLE   = new TextStyle({ fontFamily: "monospace", fontSize: 12, fill: 0xffffff, fontWeight: "bold" });
const CARD_DESC_STYLE   = new TextStyle({ fontFamily: "monospace", fontSize: 10, fill: 0x9999bb });
const CARD_TIER_STYLE   = new TextStyle({ fontFamily: "monospace", fontSize: 10, fontWeight: "bold", fill: 0xffffff });
const CARD_PAYOUT_STYLE = new TextStyle({ fontFamily: "monospace", fontSize: 10, fill: 0xaaffaa });
const AVAILABLE_STYLE   = new TextStyle({ fontFamily: "monospace", fontSize: 11, fill: 0x44ff88, fontWeight: "bold" });
const CLAIMED_STYLE     = new TextStyle({ fontFamily: "monospace", fontSize: 11, fill: 0x666688 });
const FLASH_STYLE       = new TextStyle({ fontFamily: "monospace", fontSize: 11, fill: 0xffffff, fontWeight: "bold" });

// ── Per-card view ─────────────────────────────────────────────────────────────
interface CardView {
  container:  Container;
  bg:         Graphics;
  tierText:   Text;
  stateLabel: Text;
}

export class CardGrid extends Container {
  private cardViews = new Map<string, CardView>();
  private summaryBetText!:     Text;
  private summaryWinText!:     Text;
  private summaryClaimedText!: Text;

  /** Called when an available (green) card is clicked. */
  private onCardClick: (cardId: string) => void;

  // Current state snapshot — updated by updateCards()
  private _availableIds: ReadonlySet<string> = new Set();
  private _claimedIds:   ReadonlySet<string> = new Set();

  /** Width of the full grid in pixels. */
  static readonly GRID_W  = COLS * CARD_W + (COLS - 1) * GAP;
  /** Total height including summary bar. */
  static readonly TOTAL_H = SUMMARY_H + SUMMARY_GAP + 4 * CARD_H + 3 * GAP;

  constructor(onCardClick: (cardId: string) => void) {
    super();
    this.onCardClick = onCardClick;
    this.buildSummary();
    this.buildCards();
  }

  // ── Summary bar ───────────────────────────────────────────────────────────────
  private buildSummary(): void {
    const bg = new Graphics();
    bg.roundRect(0, 0, CardGrid.GRID_W, SUMMARY_H, 4);
    bg.fill({ color: 0x16162c });
    bg.stroke({ color: 0x3a3a5a, width: 1 });
    bg.eventMode = "none"; // decoration only — must not absorb pointer events
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
      const col = idx % COLS;
      const row = Math.floor(idx / COLS);
      const cx  = col * (CARD_W + GAP);
      const cy  = offsetY + row * (CARD_H + GAP);

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
    c.cursor    = "default"; // updated by applyCardState
    // Tight hit area — text children that overflow must not expand the hittable region.
    c.hitArea = new Rectangle(0, 0, CARD_W, CARD_H);

    const bg = new Graphics();
    this.drawCardBg(bg, "normal");
    c.addChild(bg);

    // Tier badge (top-left)
    const tierStyle = new TextStyle({ ...CARD_TIER_STYLE, fill: TIER_COLOR[card.tier] });
    const tierText  = new Text({ text: `T${card.tier}`, style: tierStyle });
    tierText.x = 5; tierText.y = 4;
    c.addChild(tierText);

    // Payout (top-right)
    const payoutText = new Text({ text: `${card.payoutMult.toFixed(2)}x`, style: CARD_PAYOUT_STYLE });
    payoutText.anchor.set(1, 0);
    payoutText.x = CARD_W - 5; payoutText.y = 4;
    c.addChild(payoutText);

    // Card name (centre)
    const nameText = new Text({ text: card.name, style: CARD_NAME_STYLE });
    nameText.anchor.set(0.5, 0);
    nameText.x = CARD_W / 2; nameText.y = 20;
    c.addChild(nameText);

    // Description (below name)
    const descText = new Text({ text: card.description, style: CARD_DESC_STYLE });
    descText.anchor.set(0.5, 0);
    descText.x = CARD_W / 2; descText.y = 37;
    c.addChild(descText);

    // State label (bottom-centre, hidden by default)
    const stateLabel = new Text({ text: "", style: AVAILABLE_STYLE });
    stateLabel.anchor.set(0.5, 0);
    stateLabel.x = CARD_W / 2; stateLabel.y = 52;
    stateLabel.visible = false;
    c.addChild(stateLabel);

    // Only available (green) cards fire clicks — claimed and normal are silent.
    c.on("pointerdown", (e: FederatedPointerEvent) => {
      e.stopPropagation();
      if (!this._availableIds.has(card.id)) return;
      this.onCardClick(card.id);
    });

    return { container: c, bg, tierText, stateLabel };
  }

  // ── State management ──────────────────────────────────────────────────────────

  /**
   * Update the full card state snapshot and repaint every card.
   *
   * @param availableIds  Cards eligible to be claimed this spin (green highlight).
   * @param claimedIds    Cards already paid out (permanently dimmed).
   */
  updateCards(
    availableIds: ReadonlySet<string>,
    claimedIds:   ReadonlySet<string>,
  ): void {
    this._availableIds = availableIds;
    this._claimedIds   = claimedIds;

    for (const card of CARDS) {
      const view = this.cardViews.get(card.id)!;
      this.applyCardState(view, card.id);
    }
  }

  updateSummary(totalWin: number, claimedCount: number, baseBet: number): void {
    this.summaryBetText.text     = `Bet: ${baseBet} FUN`;
    this.summaryWinText.text     = `Win: ${totalWin.toFixed(2)} FUN`;
    this.summaryClaimedText.text = `Claimed: ${claimedCount} / 20`;
  }

  /**
   * Disable all card interaction during reel animation.
   * Cards stay clickable in idle AND ended so the player can claim.
   */
  setSpin(animating: boolean): void {
    for (const [, view] of this.cardViews) {
      view.container.eventMode = animating ? "none" : "static";
    }
  }

  /**
   * Flash the claimed card bright green for ~250 ms then settle into dim style.
   * Call immediately after `updateCards()` has already applied the claimed state,
   * so that the flash overrides it temporarily.
   */
  flashClaimAnimation(cardId: string): void {
    const view = this.cardViews.get(cardId);
    if (!view) return;

    // Override to full-brightness flash
    view.bg.clear();
    view.bg.roundRect(0, 0, CARD_W, CARD_H, 4);
    view.bg.fill({ color: 0x22ee66 });
    view.bg.stroke({ color: 0x88ffaa, width: 3 });
    view.container.alpha    = 1;
    view.stateLabel.text    = "✓ CLAIMED";
    view.stateLabel.style   = FLASH_STYLE;
    view.stateLabel.visible = true;

    // After 250 ms settle into normal claimed appearance
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
        // Green glow — card matches current digits and can be claimed
        bg.fill({ color: 0x0a2218 });
        bg.stroke({ color: 0x44ff88, width: 2 });
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

    if (claimed) {
      this.drawCardBg(view.bg, "claimed");
      view.container.alpha    = 0.35;
      view.container.cursor   = "default";
      view.stateLabel.text    = "CLAIMED";
      view.stateLabel.style   = CLAIMED_STYLE;
      view.stateLabel.visible = true;

    } else if (available) {
      // Pattern satisfied this spin — claimable right now
      this.drawCardBg(view.bg, "available");
      view.container.alpha    = 1;
      view.container.cursor   = "pointer";
      view.stateLabel.text    = "★ READY";
      view.stateLabel.style   = AVAILABLE_STYLE;
      view.stateLabel.visible = true;

    } else {
      // Normal idle state — not yet satisfying its pattern this spin
      this.drawCardBg(view.bg, "normal");
      view.container.alpha    = 1;
      view.container.cursor   = "default"; // non-available cards are not clickable
      view.stateLabel.visible = false;
    }
  }
}
