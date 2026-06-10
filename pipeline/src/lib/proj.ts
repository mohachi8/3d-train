/**
 * 座標変換: WGS84(lon/lat) ⇄ 平面直角座標系IX系(JGD2011, EPSG:6677) ⇄ ローカル座標。
 *
 * ローカル座標系(アプリの Three.js シーン座標と同一):
 *   x = 東(+) [m] / y = 海抜 T.P.(+) [m] / z = 南(+) [m]  …右手系 Y-up
 * 原点は data/registry/anchor.yaml で定義(変更禁止)。
 */
import proj4 from "proj4";

// JGD2011 平面直角座標系IX系(東京都区部ほか)。proj4 の X=northing, Y=easting に注意。
const EPSG6677 =
  "+proj=tmerc +lat_0=36 +lon_0=139.8333333333333 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs";

export interface LonLat {
  lon: number;
  lat: number;
}

/** 平面直角座標(easting, northing) [m] */
export interface PlaneXY {
  e: number;
  n: number;
}

export function lonLatToPlane(p: LonLat): PlaneXY {
  const [e, n] = proj4("WGS84", EPSG6677, [p.lon, p.lat]);
  return { e: e!, n: n! };
}

export function planeToLonLat(p: PlaneXY): LonLat {
  const [lon, lat] = proj4(EPSG6677, "WGS84", [p.e, p.n]);
  return { lon: lon!, lat: lat! };
}

/** ローカル水平座標 (x=東, z=南)。y(高さ)は呼び出し側が T.P. を与える。 */
export interface LocalXZ {
  x: number;
  z: number;
}

export class LocalFrame {
  private origin: PlaneXY;

  constructor(public readonly anchor: LonLat) {
    this.origin = lonLatToPlane(anchor);
  }

  toLocal(p: LonLat): LocalXZ {
    const q = lonLatToPlane(p);
    return { x: q.e - this.origin.e, z: -(q.n - this.origin.n) };
  }

  toLonLat(p: LocalXZ): LonLat {
    return planeToLonLat({ e: this.origin.e + p.x, n: this.origin.n - p.z });
  }
}
