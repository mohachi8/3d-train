/**
 * DEM タイルの事前取得: 全抽出済み線形の座標をカバーするタイルを
 * data/sources/extracted/dem/<provider>/ にダウンロードしてキャッシュする。
 *
 * 地理院タイル(gsi)へ到達できる環境(GitHub Actions の refresh-dem ワークフロー、
 * 開発者ローカル)で実行し、キャッシュをコミットすることで、ネットワーク制限の
 * ある環境でもビルドが決定的に再現できるようにする。
 */
import { readdirSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { PATHS, loadExtractedLine, loadLines } from "../lib/context.js";
import { lonLatToTile, type DemProvider } from "../lib/dem.js";

const ZOOM = 14;
const URLS: Record<DemProvider, (z: number, x: number, y: number) => string> = {
  gsi: (z, x, y) => `https://cyberjapandata.gsi.go.jp/xyz/dem_png/${z}/${x}/${y}.png`,
  terrarium: (z, x, y) =>
    `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`,
};

export async function fetchDem(provider: DemProvider = "gsi"): Promise<void> {
  if (!existsSync(PATHS.extractedLines)) {
    throw new Error("抽出済み線形がありません。先に import:mt3d / extract-n02 を実行してください");
  }

  // 全抽出済み路線の全座標からタイル集合を求める
  const tiles = new Set<string>();
  const lineIds = readdirSync(PATHS.extractedLines)
    .filter((f) => f.endsWith(".geojson"))
    .map((f) => f.replace(/\.geojson$/, ""));
  for (const id of lineIds) {
    const ex = loadExtractedLine(id);
    if (!ex) continue;
    for (const f of ex.features) {
      const coords =
        f.geometry.type === "LineString"
          ? (f.geometry.coordinates as [number, number][])
          : [f.geometry.coordinates as [number, number]];
      for (const [lon, lat] of coords) {
        const t = lonLatToTile({ lon, lat }, ZOOM);
        tiles.add(`${t.x}/${t.y}`);
      }
    }
  }
  console.log(`対象: ${lineIds.length}路線 → ${tiles.size}タイル (provider=${provider}, z=${ZOOM})`);
  void loadLines(); // レジストリの整合性を早期に検証

  let fetched = 0;
  let skipped = 0;
  let failed = 0;
  for (const key of [...tiles].sort()) {
    const [x, y] = key.split("/").map(Number);
    const path = join(PATHS.demCache, provider, String(ZOOM), String(x), `${y}.png`);
    if (existsSync(path)) {
      skipped++;
      continue;
    }
    const url = URLS[provider](ZOOM, x!, y!);
    const res = await fetch(url);
    if (!res.ok) {
      // 地理院 dem_png は海上などデータ無し領域が 404 になる(異常ではない)
      console.warn(`  [miss] ${url} → HTTP ${res.status}`);
      failed++;
      continue;
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
    fetched++;
  }
  console.log(`[done] 取得 ${fetched} / 既存 ${skipped} / 失敗 ${failed}`);
  if (fetched === 0 && skipped === 0) {
    throw new Error("タイルを1枚も取得できませんでした(ネットワーク制限の可能性)");
  }
}
