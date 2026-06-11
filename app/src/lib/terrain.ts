/**
 * クライアント側の地表標高サンプラ。
 * 地理院標高タイル(dem_png)を第一候補、AWS Terrain Tiles(terrarium)を
 * フォールバックとしてブラウザから直接取得・デコードする。
 * HUD の「地表からの深さ」表示と、地表タイルの起伏(頂点変位)に使う。
 */
import { CONFIG } from "../config.js";
import { lonLatToTileF, type LonLat } from "./proj.js";

interface TileImage {
  data: ImageData;
  provider: "gsi" | "terrarium";
}
type TileState = TileImage | "loading" | "failed";

export class Terrain {
  private tiles = new Map<string, TileState>();
  /** 標高データが届いたら呼ばれる(地表メッシュの再変位用) */
  onTileLoaded?: () => void;

  /**
   * 標高 T.P.[m] を返す(同期)。タイル未取得なら取得を開始して null を返す。
   * 呼び出し側は null を「計測中」として扱う。
   */
  elevationAt(p: LonLat): number | null {
    const z = CONFIG.terrain.zoom;
    const t = lonLatToTileF(p, z);
    const tx = Math.floor(t.x);
    const ty = Math.floor(t.y);
    const key = `${tx}/${ty}`;
    const state = this.tiles.get(key);
    if (state === undefined) {
      void this.load(key, tx, ty);
      return null;
    }
    if (state === "loading" || state === "failed") return null;
    const px = Math.min(255, Math.floor((t.x - tx) * 256));
    const py = Math.min(255, Math.floor((t.y - ty) * 256));
    const i = (py * 256 + px) * 4;
    const r = state.data.data[i]!;
    const g = state.data.data[i + 1]!;
    const b = state.data.data[i + 2]!;
    if (state.provider === "terrarium") {
      return r * 256 + g + b / 256 - 32768;
    }
    const v = r * 65536 + g * 256 + b;
    if (v === 8388608) return null; // 無効値(海上など)
    return v < 8388608 ? v * 0.01 : (v - 16777216) * 0.01;
  }

  private async load(key: string, x: number, y: number): Promise<void> {
    this.tiles.set(key, "loading");
    const z = CONFIG.terrain.zoom;
    const sources: { url: string; provider: "gsi" | "terrarium" }[] = [
      { url: CONFIG.terrain.demUrl(z, x, y), provider: "gsi" },
      { url: CONFIG.terrain.demFallbackUrl(z, x, y), provider: "terrarium" },
    ];
    for (const src of sources) {
      try {
        const res = await fetch(src.url);
        if (!res.ok) continue;
        const bmp = await createImageBitmap(await res.blob());
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 256;
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(bmp, 0, 0);
        this.tiles.set(key, { data: ctx.getImageData(0, 0, 256, 256), provider: src.provider });
        this.onTileLoaded?.();
        return;
      } catch {
        // 次のプロバイダへ
      }
    }
    this.tiles.set(key, "failed"); // 完全オフライン等。HUD は「—」表示になる
  }
}
