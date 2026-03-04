import {
  Container,
  Graphics,
  Rectangle,
  Text,
  TextStyle,
  FederatedPointerEvent,
} from "pixi.js";
import { CARDS } from "../config/cards";
import { CardDef } from "../types/CardTypes";

// ── Layout constants ────────────────────────────────────────────────────────
const COLS       = 5;
const CARD_W     = 136;
const CARD_H     = 68;
const GAP        = 5;
// Grid width  = 5 * 136 + 4 * 5 = 700  (matches DevPanel width)
// Grid height = 4 *  68 + 3 * 5 = 287

const SUMMARY_H  = 30;
const SUMMARY_GAP = 8;

// ── Tier accent colours ──────────────────────────────────────────────────────
const TIER_COLOR: Record<number, number> = {
  1: 0x888888,
  2: 0x44aaff,
  3: 0xcc44ff,
  4: 0xffcc00,
};

// ── Text styles ─────────────────────────────────────────────────────────────
const SUMMARY_STYLE  = new TextStyle({ fontFamily: "monospace", fontSize: 13, fill: 0xcccccc });
const SUMMARY_WIN_STYLE = new TextStyle({ fontFamily: "monospace", fontSize: 13, fill: 0xffcc00, fontWeight: "bold" });
const CARD_NAME_STYLE  = new TextStyle({ fontFamily: "monospace", fontSize: 12, fill: 0xffffff, fontWeight: "bold" });
const CARD_DESC_STYLE  = new TextStyle({ fontFamily: "monospace", fontSize: 10, fill: 0x9999bb });
const CARD_TIER_STYLE  = new TextStyle({ fontFamily: "monospace", fontSize: 10, fontWeight: "bold", fill: 0xffffff });
const CARD_PAYOUT_STYLE = new TextStyle({ fontFamily: "monospace", fontSize: 10, fill: 0xaaffaa });
const READY_STYLE    = new TextStyle({ fontFamily: "monospace", fontSize: 11, fill: 0x44ff88, fontWeight: "bold" });
const CLAIMED_STYLE  = new TextStyle({ fontFamily: "monospace", fontSize: 11, fill: 0x666688 });

// ── Per-card view ────────────────────────────────────────────────────────────
interface CardView {
  container: Container;
  bg: Graphics;
  tierText: Text;
  stateLabel: Text;
}

export class CardGrid extends Container {
  private cardViews = new Map<string, CardView>();
  private summaryBetText!: Text;
  private summaryWinText!: Text;
  private summaryClaimedText!: Text;

  private onClaim: (cardId: string) => void;
  private _readyIds: ReadonlySet<string>   = new Set();
  private _claimedIds: ReadonlySet<string> = new Set();

  /** Width of the full grid in pixels (useful for external layout). */
  static readonly GRID_W = COLS * CARD_W + (COLS - 1) * GAP;
  /** Total height including summary bar. */
  static readonly TOTAL_H = SUMMARY_H + SUMMARY_GAP + 4 * CARD_H + 3 * GAP;

  constructor(onClaim: (cardId: string) => void) {
    super();
    this.onClaim = onClaim;
    this.buildSummary();
    this.buildCards();
  }

  // ── Summary bar ─────────────────────────────────────────────────────────────
  private buildSummary(): void {
    const bg = new Graphics();
    bg.roundRect(0, 0, CardGrid.GRID_W, SUMMARY_H, 4);
    bg.fill({ color: 0x16162c });
    bg.stroke({ color: 0x3a3a5a, width: 1 });
    bg.eventMode = "none"; // background decoration only — must not absorb pointer events
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

  // ── Card grid ────────────────────────────────────────────────────────────────
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
    c.x = cx;
    c.y = cy;
    c.eventMode = "static";
    c.cursor = "pointer";
    // Explicit hit area so text children that overflow their visual bounds
    // never expand the hittable region beyond the card rectangle.
    c.hitArea = new Rectangle(0, 0, CARD_W, CARD_H);

    // Background
    const bg = new Graphics();
    this.drawCardBg(bg, false, false);
    c.addChild(bg);

    // Tier badge (top-left)
    const tierStyle = new TextStyle({ ...CARD_TIER_STYLE, fill: TIER_COLOR[card.tier] });
    const tierText = new Text({ text: `T${card.tier}`, style: tierStyle });
    tierText.x = 5;
    tierText.y = 4;
    c.addChild(tierText);

    // Payout (top-right)
    const payoutText = new Text({
      text: `${card.payoutMult.toFixed(2)}x`,
      style: CARD_PAYOUT_STYLE,
    });
    payoutText.anchor.set(1, 0);
    payoutText.x = CARD_W - 5;
    payoutText.y = 4;
    c.addChild(payoutText);

    // Card name (center)
    const nameText = new Text({ text: card.name, style: CARD_NAME_STYLE });
    nameText.anchor.set(0.5, 0);
    nameText.x = CARD_W / 2;
    nameText.y = 20;
    c.addChild(nameText);

    // Description (below name)
    const descText = new Text({ text: card.description, style: CARD_DESC_STYLE });
    descText.anchor.set(0.5, 0);
    descText.x = CARD_W / 2;
    descText.y = 37;
    c.addChild(descText);

    // State label (bottom-center, hidden by default)
    const stateLabel = new Text({ text: "", style: READY_STYLE });
    stateLabel.anchor.set(0.5, 0);
    stateLabel.x = CARD_W / 2;
    stateLabel.y = 52;
    stateLabel.visible = false;
    c.addChild(stateLabel);

    // Click handler
    c.on("pointerdown", (e: FederatedPointerEvent) => {
      e.stopPropagation();
      if (this._readyIds.has(card.id)) {
        this.onClaim(card.id);
      }
    });

    return { container: c, bg, tierText, stateLabel };
  }

  // ── State management ─────────────────────────────────────────────────────────

  updateCards(readyIds: ReadonlySet<string>, claimedIds: ReadonlySet<string>): void {
    this._readyIds   = readyIds;
    this._claimedIds = claimedIds;

    for (const card of CARDS) {
      const view    = this.cardViews.get(card.id)!;
      const ready   = readyIds.has(card.id);
      const claimed = claimedIds.has(card.id);
      this.applyCardState(view, ready, claimed);
    }
  }

  updateSummary(totalWin: number, claimedCount: number, baseBet: number): void {
    this.summaryBetText.text     = `Bet: ${baseBet} FUN`;
    this.summaryWinText.text     = `Win: ${totalWin.toFixed(2)} FUN`;
    this.summaryClaimedText.text = `Claimed: ${claimedCount} / 20`;
  }

  /**
   * Disable all card clicks during reel animation (running/resolve states).
   * Cards remain clickable during idle AND ended so player can claim after
   * the run naturally ends.
   */
  setSpin(animating: boolean): void {
    for (const [, view] of this.cardViews) {
      view.container.eventMode = animating ? "none" : "static";
    }
  }

  // ── Visuals ──────────────────────────────────────────────────────────────────

  private drawCardBg(bg: Graphics, ready: boolean, claimed: boolean): void {
    bg.clear();
    if (claimed) {
      bg.roundRect(0, 0, CARD_W, CARD_H, 4);
      bg.fill({ color: 0x0e0e1e });
      bg.stroke({ color: 0x2a2a3a, width: 1 });
    } else if (ready) {
      bg.roundRect(0, 0, CARD_W, CARD_H, 4);
      bg.fill({ color: 0x0a2218 });
      bg.stroke({ color: 0x44ff88, width: 2 });
    } else {
      bg.roundRect(0, 0, CARD_W, CARD_H, 4);
      bg.fill({ color: 0x1a1a30 });
      bg.stroke({ color: 0x38384e, width: 1 });
    }
  }

  private applyCardState(view: CardView, ready: boolean, claimed: boolean): void {
    this.drawCardBg(view.bg, ready, claimed);

    if (claimed) {
      view.container.alpha = 0.35;
      view.container.cursor = "default";
      view.stateLabel.text    = "CLAIMED";
      view.stateLabel.style   = CLAIMED_STYLE;
      view.stateLabel.visible = true;
    } else if (ready) {
      view.container.alpha = 1;
      view.container.cursor = "pointer";
      view.stateLabel.text    = "★ READY";
      view.stateLabel.style   = READY_STYLE;
      view.stateLabel.visible = true;
    } else {
      view.container.alpha = 1;
      view.container.cursor = "pointer";
      view.stateLabel.visible = false;
    }
  }
}
