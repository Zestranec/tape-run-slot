import { Assets, Texture } from "pixi.js";
import { getSymbol, JOKER_IDX } from "../types/PokerTypes";

/**
 * Returns the atlas frame filename for a given symbol index.
 * Frame names match the PNG filenames packed into cards_atlas.json.
 */
export function symbolFrameKey(idx: number): string {
  if (idx === JOKER_IDX) return "joker.png";
  const sym    = getSymbol(idx);
  const suit   = sym.suit === "hearts" ? "heart" : "spade";
  return `${sym.rank}_${suit}.png`;
}

/**
 * Returns the Pixi Texture for a given symbol index.
 * Requires the cards atlas to have been loaded via loadAssets() first.
 * Falls back to Texture.WHITE if the atlas is not yet available.
 */
export function getSymbolTexture(idx: number): Texture {
  const key = symbolFrameKey(idx);
  // After loading the spritesheet, Pixi caches each frame by its name.
  const t = Assets.get<Texture>(key);
  return t instanceof Texture ? t : Texture.WHITE;
}
