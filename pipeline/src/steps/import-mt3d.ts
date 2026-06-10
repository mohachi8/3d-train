/**
 * ブートストラップ用インポータ: mini-tokyo-3d リポジトリの座標データから
 * 抽出済み線形データ(data/sources/extracted/lines/*.geojson)を生成する。
 *
 * 正規ルートは国土数値情報 N02 からの抽出(steps/extract-n02.ts)だが、
 * N02 配布サイトへ到達できないネットワーク環境ではこちらを使う。
 * 出力形式は同一なので、後から N02 で再抽出して差し替えられる。
 *
 * 使い方: npm run import:mt3d -- --src /path/to/mini-tokyo-3d
 *   (--src 省略時は data/sources/raw/mini-tokyo-3d、無ければ GitHub から clone)
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { PATHS, loadLines, extractedLinePath } from "../lib/context.js";

const MT3D_REPO = "https://github.com/nagix/mini-tokyo-3d";

interface Mt3dSubline {
  type?: string;
  coords?: [number, number][] | [number, number, number][];
}

export async function importMt3d(srcArg?: string): Promise<void> {
  let src = srcArg ?? join(PATHS.rawSources, "mini-tokyo-3d");
  if (!existsSync(src)) {
    console.log(`mini-tokyo-3d を clone します → ${src}`);
    mkdirSync(PATHS.rawSources, { recursive: true });
    execSync(`git clone --depth 1 ${MT3D_REPO} "${src}"`, { stdio: "inherit" });
  }

  const commit = execSync("git rev-parse --short HEAD", { cwd: src }).toString().trim();
  const commitDate = execSync("git log -1 --format=%cs", { cwd: src }).toString().trim();

  const coords = JSON.parse(readFileSync(join(src, "data/coordinates.json"), "utf-8")) as {
    railways: { id: string; sublines: Mt3dSubline[] }[];
  };
  const stations = JSON.parse(readFileSync(join(src, "data/stations.json"), "utf-8")) as {
    id: string;
    railway?: string;
    coord?: [number, number];
    title?: { ja?: string };
  }[];

  const lines = loadLines().filter((l) => l.mt3d_id);
  mkdirSync(PATHS.extractedLines, { recursive: true });

  for (const line of lines) {
    const railway = coords.railways.find((r) => r.id === line.mt3d_id);
    if (!railway) {
      console.warn(`[skip] ${line.id}: mt3d_id=${line.mt3d_id} が coordinates.json にありません`);
      continue;
    }
    // 全 subline を保持する。"sub" には本線の隙間を埋める短い部品と、他路線への
    // 連絡線の両方が混在するため、結合時(assembleChain)に main 優先で判別する。
    const inBbox = (bbox: [number, number, number, number], cs: number[][]) =>
      cs.every(
        (c) => c[0]! >= bbox[0] && c[1]! >= bbox[1] && c[0]! <= bbox[2] && c[1]! <= bbox[3]
      );
    const tracks = railway.sublines.filter((s) => {
      if (!s.coords?.length) return false;
      if (line.clip_bbox && !inBbox(line.clip_bbox, s.coords)) return false;
      if (line.exclude_bbox && inBbox(line.exclude_bbox, s.coords)) return false;
      return true;
    });

    const sts = stations.filter((s) => {
      if (s.railway !== line.mt3d_id || !s.coord || !s.title?.ja) return false;
      if (line.exclude_stations?.includes(s.title.ja)) return false;
      if (line.clip_bbox && !inBbox(line.clip_bbox, [s.coord])) return false;
      return true;
    });
    // 同名の重複(複数ホームの別エントリ等)は除外
    const seen = new Set<string>();
    const uniqueSts = sts.filter((s) => {
      if (seen.has(s.title!.ja!)) return false;
      seen.add(s.title!.ja!);
      return true;
    });

    const fc = {
      type: "FeatureCollection",
      metadata: {
        line_id: line.id,
        source: {
          name: `mini-tokyo-3d (${commit}, ${commitDate})`,
          url: MT3D_REPO,
          license: "MIT (c) Akihiko Kusanagi",
          retrieved: commitDate,
          note:
            "国土数値情報 N02 へ到達できない環境向けのブートストラップ。" +
            "extract-n02 で再抽出して差し替え可能。",
        },
      },
      features: [
        ...tracks.map((t, i) => ({
          type: "Feature",
          properties: { kind: "track", seq: i, role: t.type ?? "main" },
          geometry: {
            type: "LineString",
            // 第3要素(高度ヒント)は捨て、座標精度は約1cm(7桁)に丸める
            coordinates: t.coords!.map((c) => [round7(c[0]), round7(c[1])]),
          },
        })),
        ...uniqueSts.map((s) => ({
          type: "Feature",
          properties: { kind: "station", name: s.title!.ja! },
          geometry: {
            type: "Point",
            coordinates: [round7(s.coord![0]), round7(s.coord![1])],
          },
        })),
      ],
    };

    const out = extractedLinePath(line.id);
    writeFileSync(out, JSON.stringify(fc, null, 1) + "\n");
    console.log(
      `[ok] ${line.id}: track=${tracks.length}本 station=${uniqueSts.length}駅 → ${out}`
    );
  }
}

const round7 = (v: number) => Math.round(v * 1e7) / 1e7;
