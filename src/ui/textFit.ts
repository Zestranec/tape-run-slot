import { CanvasTextMetrics, Text } from "pixi.js";

export interface TextFitOptions {
  /** Largest font size to try first. */
  maxFontSize: number;
  /** Font size floor — truncate with "…" if still too tall here. */
  minFontSize: number;
  /** When true (default), appends "…" after truncation at minFontSize. */
  ellipsis?: boolean;
}

/**
 * Fits `text` inside a pixel box (boxW × boxH) by:
 *  1. Enabling word-wrap at boxW.
 *  2. Iterating fontSize from maxFontSize down to minFontSize until measured
 *     height ≤ boxH.
 *  3. At minFontSize, if still too tall, trims characters and appends "…".
 *
 * IMPORTANT: `textObj` must own its own TextStyle instance (not shared).
 * PixiJS 8 clones the style passed to `new Text({ style })`, so this is
 * satisfied automatically when using the standard constructor.
 */
export function fitTextToBox(
  textObj: Text,
  text: string,
  boxW: number,
  boxH: number,
  opts: TextFitOptions,
): void {
  const style = textObj.style;
  style.wordWrap      = true;
  style.wordWrapWidth = boxW;

  const ellipsis = opts.ellipsis !== false;

  for (let size = opts.maxFontSize; size >= opts.minFontSize; size--) {
    style.fontSize = size;

    const m = CanvasTextMetrics.measureText(text, style);
    if (m.height <= boxH + 0.5) {
      textObj.text = text;
      return;
    }

    if (size === opts.minFontSize && ellipsis) {
      // Trim characters one-by-one until it fits
      let s = text;
      while (s.length > 1) {
        s = s.slice(0, -1);
        const candidate = s.trimEnd() + "\u2026"; // "…"
        const mm = CanvasTextMetrics.measureText(candidate, style);
        if (mm.height <= boxH + 0.5) {
          textObj.text = candidate;
          return;
        }
      }
      // Absolute fallback — just show the ellipsis alone
      textObj.text = "\u2026";
      return;
    }
  }

  // If loop ends without returning (shouldn't happen), set text as-is
  textObj.text = text;
}
