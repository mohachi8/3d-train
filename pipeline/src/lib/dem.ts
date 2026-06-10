/**
 * 地表標高(DEM)のサンプリング。
 *
 * プロバイダ:
 *  - gsi:       国土地理院 標高タイル dem_png(DEM10B 相当, z14)。精度が高く本命。
 *  - terrarium: AWS Open Data の Terrain Tiles(SRTM 由来, z14)。
 *               地理院タイルへ到達できないネットワーク環境向けのフォールバック。
 *               市街地では建物高さの影響で数 m 程度の誤差が出うる。
 *
 * タイルは data/sources/extracted/dem/<provider>/ にキャッシュし、コミットする。
 * これによりビルドはオフラインで決定的に再現できる。キャッシュの更新(地理院
 * タイルへの差し替え)はネットワーク制限のない環境で `fetch` を実行する。
 */
import { PNG } from "pngjs";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { LonLat } from "./proj.js";

export type DemProvider = "gsi" | "terrarium";

const ZOOM = 14;

const URLS: Record<DemProvider, (z: number, x: number, y: number) => string> = {
  gsi: (z, x, y) => `https://cyberjapandata.gsi.go.jp/xyz/dem_png/${z}/${x}/${y}.png`,
  terrarium: (z, x, y) =>
    `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`,
};

export function lonLatToTile(p: LonLat, z = ZOOM): { x: number; y: number; px: number; py: number } {
  const n = 2 ** z;
  const xf = ((p.lon + 180) / 360) * n;
  const latRad = (p.lat * Math.PI) / 180;
  const yf = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  const x = Math.floor(xf);
  const y = Math.floor(yf);
  return { x, y, px: (xf - x) * 256, py: (yf - y) * 256 };
}

function decode(provider: DemProvider, r: number, g: number, b: number): number | undefined {
  if (provider === "terrarium") {
    return r * 256 + g + b / 256 - 32768;
  }
  // 地理院 dem_png: x = 2^16 R + 2^8 G + B, u=0.01m, x=2^23 は無効値
  const x = r * 65536 + g * 256 + b;
  if (x === 8388608) return undefined;
  return x < 8388608 ? x * 0.01 : (x - 16777216) * 0.01;
}

export class DemSampler {
  private tiles = new Map<string, PNG | null>();

  constructor(
    private cacheDir: string,
    private providers: DemProvider[],
    private allowNetwork: boolean
  ) {}

  /** 使用された(=キャッシュに存在した)プロバイダの記録。プロビナンス出力用。 */
  readonly usedProviders = new Set<DemProvider>();

  private tilePath(provider: DemProvider, x: number, y: number): string {
    return join(this.cacheDir, provider, String(ZOOM), String(x), `${y}.png`);
  }

  private async loadTile(provider: DemProvider, x: number, y: number): Promise<PNG | null> {
    const key = `${provider}/${x}/${y}`;
    const cached = this.tiles.get(key);
    if (cached !== undefined) return cached;

    const path = this.tilePath(provider, x, y);
    let buf: Buffer | undefined;
    if (existsSync(path)) {
      buf = readFileSync(path);
    } else if (this.allowNetwork) {
      const url = URLS[provider](ZOOM, x, y);
      const res = await fetch(url);
      if (res.ok) {
        buf = Buffer.from(await res.arrayBuffer());
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, buf);
      }
    }
    const png = buf ? PNG.sync.read(buf) : null;
    this.tiles.set(key, png);
    return png;
  }

  /**
   * 地表標高 T.P.[m]。どのプロバイダでも得られなければ undefined。
   *
   * terrarium(SRTM 由来)は表層モデルのため市街地で建物高さが混入する
   * (大手町で +30m 等を確認)。正のバイアスなので、近傍の最小値を取る
   * 簡易 DSM→DTM フィルタで道路・水面レベルに寄せる。
   * gsi(地理院 DEM)は地形モデルなのでフィルタ不要。
   */
  async elevationAt(p: LonLat): Promise<number | undefined> {
    for (const provider of this.providers) {
      const v =
        provider === "terrarium"
          ? await this.minFiltered(provider, p)
          : await this.sampleOne(provider, p);
      if (v !== undefined) {
        this.usedProviders.add(provider);
        return v;
      }
    }
    return undefined;
  }

  private async sampleOne(provider: DemProvider, p: LonLat): Promise<number | undefined> {
    const t = lonLatToTile(p);
    const png = await this.loadTile(provider, t.x, t.y);
    if (!png) return undefined;
    return this.bilinear(png, provider, t.px, t.py);
  }

  private async minFiltered(provider: DemProvider, p: LonLat): Promise<number | undefined> {
    const RADIUS_M = 120;
    const STEPS = 2; // 5×5 グリッド
    const dLat = RADIUS_M / 111320;
    const dLon = RADIUS_M / (111320 * Math.cos((p.lat * Math.PI) / 180));
    let min: number | undefined;
    for (let i = -STEPS; i <= STEPS; i++) {
      for (let j = -STEPS; j <= STEPS; j++) {
        const v = await this.sampleOne(provider, {
          lon: p.lon + (j / STEPS) * dLon,
          lat: p.lat + (i / STEPS) * dLat,
        });
        if (v !== undefined && (min === undefined || v < min)) min = v;
      }
    }
    return min;
  }

  private bilinear(png: PNG, provider: DemProvider, px: number, py: number): number | undefined {
    const x0 = Math.max(0, Math.min(254, Math.floor(px - 0.5)));
    const y0 = Math.max(0, Math.min(254, Math.floor(py - 0.5)));
    const fx = Math.max(0, Math.min(1, px - 0.5 - x0));
    const fy = Math.max(0, Math.min(1, py - 0.5 - y0));
    const at = (x: number, y: number): number | undefined => {
      const i = (y * png.width + x) * 4;
      return decode(provider, png.data[i]!, png.data[i + 1]!, png.data[i + 2]!);
    };
    const v00 = at(x0, y0);
    const v10 = at(x0 + 1, y0);
    const v01 = at(x0, y0 + 1);
    const v11 = at(x0 + 1, y0 + 1);
    if (v00 === undefined || v10 === undefined || v01 === undefined || v11 === undefined) {
      return v00 ?? v10 ?? v01 ?? v11;
    }
    return (
      v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy
    );
  }
}
