/**
 * 座標変換(アプリ側)。パイプラインの pipeline/src/lib/proj.ts と同じ規約:
 *   ローカル座標 x=東, y=T.P., z=南 / 原点はアーティファクト index.json の anchor。
 * アプリで投影計算を行うのは「地図タイルの配置」と「HUD の緯度経度表示」のみ。
 */
import proj4 from "proj4";

const EPSG6677 =
  "+proj=tmerc +lat_0=36 +lon_0=139.8333333333333 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs";

export interface LonLat {
  lon: number;
  lat: number;
}

export class LocalFrame {
  private e0: number;
  private n0: number;

  constructor(anchor: LonLat) {
    const [e, n] = proj4("WGS84", EPSG6677, [anchor.lon, anchor.lat]);
    this.e0 = e!;
    this.n0 = n!;
  }

  toLocal(p: LonLat): { x: number; z: number } {
    const [e, n] = proj4("WGS84", EPSG6677, [p.lon, p.lat]);
    return { x: e! - this.e0, z: -(n! - this.n0) };
  }

  toLonLat(x: number, z: number): LonLat {
    const [lon, lat] = proj4(EPSG6677, "WGS84", [this.e0 + x, this.n0 - z]);
    return { lon: lon!, lat: lat! };
  }
}

/** Web メルカトリのタイル座標(浮動小数) */
export function lonLatToTileF(p: LonLat, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const latRad = (p.lat * Math.PI) / 180;
  return {
    x: ((p.lon + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  };
}

/** タイル座標(浮動小数)→ 経度緯度 */
export function tileToLonLat(x: number, y: number, z: number): LonLat {
  const n = 2 ** z;
  const lon = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  return { lon, lat: (latRad * 180) / Math.PI };
}
