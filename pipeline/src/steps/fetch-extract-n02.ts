/**
 * 正規ルート: 国土数値情報 鉄道データ(N02)の取得と対象路線の抽出。
 *
 * このステップはネットワーク制限のない環境(GitHub Actions の手動ワークフローや
 * 開発者のローカル)で実行する。出力は import-mt3d と同じ抽出済み形式なので、
 * 実行すればブートストラップデータが正規データに置き換わる。
 *
 *   npm run fetch:sources            # N02 GeoJSON をダウンロード・展開
 *   npm run cli -w pipeline -- extract-n02   # 対象路線を抽出
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { PATHS, loadLines, extractedLinePath } from "../lib/context.js";

// N02 の年度版。更新時はここと manifest.yaml を合わせて変更する。
const N02_VERSION = "N02-23";
const N02_URL = `https://nlftp.mlit.go.jp/ksj/gml/data/N02/${N02_VERSION}/${N02_VERSION}_GeoJSON.zip`;

export async function fetchN02(): Promise<void> {
  const dir = join(PATHS.rawSources, "n02");
  mkdirSync(dir, { recursive: true });
  const zipPath = join(dir, `${N02_VERSION}_GeoJSON.zip`);
  if (!existsSync(zipPath)) {
    console.log(`ダウンロード中: ${N02_URL}`);
    const res = await fetch(N02_URL);
    if (!res.ok) {
      throw new Error(
        `N02 のダウンロードに失敗しました (HTTP ${res.status})。` +
          `ネットワーク制限環境では npm run import:mt3d を使ってください。`
      );
    }
    writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));
  }
  execSync(`unzip -o -q "${zipPath}" -d "${dir}"`, { stdio: "inherit" });
  console.log(`[ok] 展開済み → ${dir}`);
}

interface N02Feature {
  type: "Feature";
  properties: Record<string, string>;
  geometry: { type: "LineString"; coordinates: [number, number][] };
}

export async function extractN02(): Promise<void> {
  const dir = join(PATHS.rawSources, "n02");
  if (!existsSync(dir)) throw new Error("先に fetch:sources を実行してください");

  // 展開された GeoJSON を探す(RailroadSection / Station)
  const files = walkJson(dir);
  const sectionFile = files.find((f) => /RailroadSection/i.test(f));
  const stationFile = files.find((f) => /Station/i.test(f));
  if (!sectionFile || !stationFile) {
    throw new Error(`N02 の GeoJSON が見つかりません(探索先: ${dir})`);
  }
  const sections = (JSON.parse(readFileSync(sectionFile, "utf-8")) as { features: N02Feature[] })
    .features;
  const stations = (JSON.parse(readFileSync(stationFile, "utf-8")) as { features: N02Feature[] })
    .features;

  mkdirSync(PATHS.extractedLines, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);

  for (const line of loadLines()) {
    if (!line.n02_match) continue;
    const m = line.n02_match;
    const match = (f: N02Feature) =>
      f.properties["N02_003"] === m.line && f.properties["N02_004"] === m.operator;
    const secs = sections.filter(match);
    const sts = stations.filter(match);
    if (secs.length === 0) {
      console.warn(`[skip] ${line.id}: N02 に一致する区間がありません (${m.operator} / ${m.line})`);
      continue;
    }
    const fc = {
      type: "FeatureCollection",
      metadata: {
        line_id: line.id,
        source: {
          name: `国土数値情報 鉄道データ ${N02_VERSION}`,
          url: N02_URL,
          license: "国土数値情報ダウンロードサイト利用約款(出典明記)",
          retrieved: today,
        },
      },
      features: [
        ...secs.map((f, i) => ({
          type: "Feature",
          properties: { kind: "track", seq: i },
          geometry: f.geometry,
        })),
        // N02 の駅は短い LineString なので中点を駅位置とする
        ...sts.map((f) => {
          const cs = f.geometry.coordinates;
          const mid = cs[Math.floor(cs.length / 2)]!;
          return {
            type: "Feature",
            properties: { kind: "station", name: f.properties["N02_005"] ?? "不明" },
            geometry: { type: "Point", coordinates: mid },
          };
        }),
      ],
    };
    writeFileSync(extractedLinePath(line.id), JSON.stringify(fc, null, 1) + "\n");
    console.log(`[ok] ${line.id}: track=${secs.length} station=${sts.length}`);
  }
}

function walkJson(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walkJson(p));
    else if (/\.(geojson|json)$/i.test(e.name)) out.push(p);
  }
  return out;
}
