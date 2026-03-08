/**
 * layouts.ts — Centralised responsive layout system.
 *
 * Two explicit modes:
 *   "desktop" — wide / landscape screen (≥ 900 px wide AND wider than tall).
 *               gameRoot is rendered at scale 1, centred horizontally.
 *   "mobile"  — narrow or portrait screen (< 900 px wide OR taller than wide).
 *               gameRoot is scaled down uniformly to fit the viewport above the
 *               DevDrawer handle, then centred horizontally.
 *
 * Nothing in game logic, RNG, or reel animation is touched here.
 * This file only exports types and pure functions.
 */

// ── Mode ─────────────────────────────────────────────────────────────────────

export type LayoutMode = "desktop" | "mobile";

/**
 * Determine layout mode from current viewport dimensions.
 *
 * Rules (matches CSS portrait media query intuition):
 *   mobile  — screenWidth < 900  OR  screenWidth < screenHeight
 *   desktop — screenWidth ≥ 900  AND screenWidth ≥ screenHeight
 */
export function getLayoutMode(screenW: number, screenH: number): LayoutMode {
  return screenW < 900 || screenW < screenH ? "mobile" : "desktop";
}

// ── Logical game dimensions (at scale = 1) ────────────────────────────────────

/**
 * Logical (design) width of the game — matches UI_W in main.ts.
 * Everything inside gameRoot is laid out within this 700 px width.
 */
export const LOGICAL_W = 700;

/**
 * Logical height of the game content inside gameRoot at scale = 1.
 *
 * Derived from the layout stack in main.ts:
 *   CARDS_TOP  = PANEL_TOP + RunPanel.PANEL_H + BLOCK_GAP = 277 + 88 + 16 = 381
 *   CardGrid.TOTAL_H = SUMMARY_H + SUMMARY_GAP + 4×CARD_H + 3×GAP
 *                    = 30 + 8 + 272 + 15 = 325 → rounded to 333 (actual const)
 *   LOGICAL_H  = CARDS_TOP + CardGrid.TOTAL_H = 381 + 333 = 714
 */
export const LOGICAL_H = 714;

/**
 * Minimum top padding above gameRoot content (pixels in screen space).
 * Matches PAD_TOP in main.ts.
 */
export const PAD_TOP = 16;

/**
 * Height reserved at the bottom of the viewport for the DevDrawer handle.
 * The DevDrawer is on app.stage (not scaled with gameRoot) so we subtract
 * this from the available height when computing mobile scale.
 */
export const DEV_HANDLE_H = 44;

// ── Config ───────────────────────────────────────────────────────────────────

export interface LayoutConfig {
  /** Current layout mode. */
  mode:  LayoutMode;
  /**
   * Uniform scale applied to gameRoot.
   * 1.0 on desktop; < 1.0 on mobile when the game doesn't fit at full size.
   */
  scale: number;
  /** gameRoot.x in screen-space pixels. */
  rootX: number;
  /** gameRoot.y in screen-space pixels. */
  rootY: number;
}

/**
 * Compute the LayoutConfig for the current viewport.
 *
 * Desktop: scale = 1, gameRoot centred horizontally, PAD_TOP from top.
 * Mobile:  scale = min(screenW / LOGICAL_W, availH / totalH, 1)
 *          where availH excludes the DevDrawer handle.
 *          gameRoot centred horizontally; vertically anchored near the top.
 */
export function computeLayout(screenW: number, screenH: number): LayoutConfig {
  const mode = getLayoutMode(screenW, screenH);

  if (mode === "desktop") {
    return {
      mode,
      scale: 1,
      rootX: Math.round((screenW - LOGICAL_W) / 2),
      rootY: PAD_TOP,
    };
  }

  // Available height above the DevDrawer handle.
  const availH = screenH - DEV_HANDLE_H;

  // Fit scale: keep content within screen width and available height.
  // totalH = PAD_TOP (rootY) + LOGICAL_H * scale  →  scale = availH / (LOGICAL_H + PAD_TOP)
  const scale = Math.min(
    screenW / LOGICAL_W,
    availH / (LOGICAL_H + PAD_TOP),
    1, // never upscale beyond the design size
  );

  const scaledW = LOGICAL_W * scale;
  const rootX   = Math.round(Math.max(0, (screenW - scaledW) / 2));
  const rootY   = PAD_TOP; // keep game anchored near top; space appears below

  return { mode, scale, rootX, rootY };
}

// ── Desktop layout reference ─────────────────────────────────────────────────
//
// The constants below document the desktop layout in one place.
// They mirror the constants spread across main.ts / RunPanel.ts / CardGrid.ts.
// They are NOT used at runtime (the actual containers use their own constants),
// but they act as a single source of truth for documentation and future
// migration to a fully data-driven layout.
//
// All values are in logical pixels (scale = 1).

export const DESKTOP_LAYOUT = {
  // ── Reel block ───────────────────────────────────────────────────────────
  reel: {
    slotY:    42,          // reelsContainer.y in topBlock
    slotH:    221,         // total slot height: ctrlAbove + reelH + ctrlBelow
    reelW:    120,
    reelH:    160,
    reelGap:  8,
    ctrlAbove: 21,         // nudge button + gap above reel box
    ctrlBelow: 40,         // gap + nudge + gap + lock below reel box
  },

  // ── Panel (RunPanel / BetPanel) ──────────────────────────────────────────
  panel: {
    top:      277,         // REEL_SLOT_Y + REEL_SLOT_H + PANEL_GAP = 277
    runH:     88,
    betH:     160,
    w:        700,
  },

  // ── Cards grid ───────────────────────────────────────────────────────────
  cards: {
    top:      381,         // PANEL_TOP + RunPanel.PANEL_H + BLOCK_GAP = 381
    gridW:    700,
    gridH:    333,
    cols:     5,
    cardW:    136,
    cardH:    68,
    gap:      5,
  },

  // ── Title ────────────────────────────────────────────────────────────────
  title: {
    x:        350,         // UI_W / 2 (centred)
    y:        38,          // anchor-bottom; 4 px gap above reels
    fontSize: 28,
  },

  // ── End overlay ─────────────────────────────────────────────────────────
  endOverlay: {
    w:        340,
    h:        180,
  },
} as const;

// ── Mobile layout reference ──────────────────────────────────────────────────
//
// Mobile achieves its layout by SCALING the entire gameRoot container.
// The logical positions below are identical to desktop; visual size shrinks.
//
// Touch usability is improved by the scale (all interactive areas grow with
// the view) combined with the minimum 44 px DevDrawer handle target.
//
// Areas that may need future work at very small screen sizes (< 360 px wide):
//   • Mission card text readability (font is bitmapped via PixiJS — no reflow)
//   • Lock / nudge button hit areas (currently 14 px wide triangles)

export const MOBILE_LAYOUT = {
  // Same logical structure as desktop — layout achieved through uniform scale.
  ...DESKTOP_LAYOUT,

  // Mode-specific note:
  // gameRoot.scale = computeLayout(w,h).scale  (typically 0.50–0.85 on phones)
} as const;
