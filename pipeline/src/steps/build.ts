/**
 * メインビルド: 抽出済み線形 + 深度YAML + DEM → 3Dアーティファクト。
 *
 * 決定性: 出力にタイムスタンプを含めない。座標は cm 単位に丸める。
 * 同じ入力(data/ 配下)からは必ず同じ出力が生成される(CI が検証する)。
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PATHS,
  loadAnchor,
  loadLines,
  loadDepthFile,
  loadExtractedLine,
  loadProfileHints,
  computeInputsHash,
  loadYaml,
} from "../lib/context.js";
import { ManifestSchema } from "../schemas/manifest.js";
import { LocalFrame, type LonLat } from "../lib/proj.js";
import { assembleChain, resample, projectPoint, type SampledPath } from "../lib/linework.js";
import { Pchip, type ControlPoint } from "../lib/interpolate.js";
import { DemSampler } from "../lib/dem.js";
import {
  SCHEMA_VERSION,
  type LineArtifact,
  type StationBox,
  type IndexArtifact,
} from "../schemas/artifacts.js";

const SAMPLE_STEP_M = 20;
/** PCHIP 制御点での勾配上限(50‰)。地下鉄の実勾配は概ね 35‰ 以下 */
const MAX_KNOT_GRADIENT = 0.05;

const r2 = (v: number) => Math.round(v * 100) / 100;

export async function build(onlyLine?: string): Promise<void> {
  const anchor = loadAnchor();
  const frame = new LocalFrame({ lon: anchor.lonlat[0], lat: anchor.lonlat[1] });
  const manifest = loadYaml(join(PATHS.data, "sources/manifest.yaml"), ManifestSchema);
  const dem = new DemSampler(PATHS.demCache, manifest.dem.providers, manifest.dem.allow_network);
  const hints = loadProfileHints();

  const lines = loadLines().filter(
    (l) => l.enabled && (onlyLine === undefined || l.id === onlyLine)
  );
  if (lines.length === 0) throw new Error("ビルド対象の路線がありません(enabled: true が必要)");

  mkdirSync(join(PATHS.artifacts, "lines"), { recursive: true });
  const indexLines: IndexArtifact["lines"] = [];
  const allBoxes: StationBox[] = [];

  for (const line of lines) {
    const extracted = loadExtractedLine(line.id);
    if (!extracted) {
      throw new Error(
        `${line.id}: 抽出済み線形がありません。npm run import:mt3d または fetch+extract を実行してください`
      );
    }
    const depthFile = loadDepthFile(line.id);
    if (!depthFile) {
      throw new Error(`${line.id}: 深度ファイル data/depths/${line.id.replace(".", "/")}.yaml がありません`);
    }

    // --- 平面線形 ---
    const trackFeatures = extracted.features.filter((f) => f.properties.kind === "track");
    const chunks = trackFeatures.map((f) =>
      (f.geometry.coordinates as [number, number][]).map(([lon, lat]) => frame.toLocal({ lon, lat }))
    );
    const ranks = trackFeatures.map((f) =>
      (f.properties as { role?: string }).role === "sub" ? 2 : 0
    );
    const chain = assembleChain(chunks, undefined, ranks);
    if (chain.dropped.length > 0) {
      console.log(
        `  [info] ${line.id}: 連絡線とみなして除外したチャンク: ` +
          chain.dropped.map((i) => `#${i}(${chunks[i]!.length}点)`).join(", ")
      );
    }
    const path: SampledPath = resample(chain.path, SAMPLE_STEP_M);
    const length = path.s[path.s.length - 1]!;

    // --- 駅の弧長位置と標高制御点 ---
    const extStations = new Map<string, LonLat>();
    for (const f of extracted.features) {
      if (f.properties.kind === "station") {
        const [lon, lat] = f.geometry.coordinates as [number, number];
        extStations.set(f.properties.name, { lon: lon!, lat: lat! });
      }
    }

    const controls: ControlPoint[] = [];
    for (const st of depthFile.stations) {
      const matchName = st.match_name ?? st.name;
      const lonlat = extStations.get(matchName);
      if (!lonlat) {
        throw new Error(`${line.id}/${st.id}: 線形データに駅「${matchName}」が見つかりません`);
      }
      const local = frame.toLocal(lonlat);
      const passes = projectPoint(path, local);
      if (passes.length === 0) {
        throw new Error(`${line.id}/${st.id}: 駅が線形から 150m 以内にありません`);
      }

      const ground = await dem.elevationAt(lonlat);
      const tps: number[] = [];
      for (const pf of st.platforms) {
        let tp: number;
        if (pf.depth_datum === "tp") {
          tp = pf.tp_m!;
        } else {
          if (ground === undefined) {
            throw new Error(
              `${line.id}/${st.id}: depth_datum=ground ですが DEM から地表標高を取得できません`
            );
          }
          tp = ground - pf.depth_m!;
        }
        tps.push(tp);

        // ホーム箱(駅に最も近い通過箇所に置く)
        const best = passes.reduce((a, b) => (a.distance < b.distance ? a : b));
        const pos = pointAt(path, best.s);
        const len = pf.length_m ?? depthFile.default_platform.length_m;
        const wid = pf.width_m ?? depthFile.default_platform.width_m;
        const hgt = pf.height_m ?? depthFile.default_platform.height_m;
        allBoxes.push({
          station_id: st.id,
          line_id: line.id,
          name: st.name,
          platform_id: pf.id,
          center: [r2(pos.x), r2(tp + hgt / 2), r2(pos.z)],
          heading: r2(best.heading),
          size: [len, hgt, wid],
          floor_tp: r2(tp),
          depth_m: ground === undefined ? null : r2(ground - tp),
          confidence: pf.confidence,
        });
      }
      // トンネル縦断の制御点はホーム標高の平均(複層ホームは中間を通す)
      const meanTp = tps.reduce((a, b) => a + b, 0) / tps.length;
      for (const pass of passes) controls.push({ s: pass.s, v: meanTp });
    }

    // --- 縦断ヒント(駅間の追加制御点) ---
    for (const hint of hints.filter((h) => h.line_id === line.id)) {
      const local = frame.toLocal({ lon: hint.lonlat[0], lat: hint.lonlat[1] });
      const passes = projectPoint(path, local);
      for (const pass of passes) controls.push({ s: pass.s, v: hint.tp_m });
    }

    // --- 3D線形の生成 ---
    const profile = new Pchip(controls, { maxGradient: MAX_KNOT_GRADIENT });
    const positions: number[] = [];
    const arclength: number[] = [];
    const depthBelow: (number | null)[] = [];
    for (let i = 0; i < path.points.length; i++) {
      const p = path.points[i]!;
      const y = profile.at(path.s[i]!);
      positions.push(r2(p.x), r2(y), r2(p.z));
      arclength.push(r2(path.s[i]!));
      const ground = await dem.elevationAt(frame.toLonLat(p));
      depthBelow.push(ground === undefined ? null : Math.round((ground - y) * 10) / 10);
    }

    const artifact: LineArtifact = {
      schema_version: SCHEMA_VERSION,
      line_id: line.id,
      name: line.name,
      color: line.color,
      tunnel_radius_m: line.tunnel_radius_m,
      positions,
      arclength,
      depth_below_ground: depthBelow,
    };
    const file = `lines/${line.id}.json`;
    writeFileSync(join(PATHS.artifacts, file), JSON.stringify(artifact) + "\n");
    indexLines.push({
      id: line.id,
      name: line.name,
      color: line.color,
      file,
      length_m: r2(length),
      station_count: depthFile.stations.length,
    });
    console.log(
      `[ok] ${line.id}: ${(length / 1000).toFixed(1)}km, 駅${depthFile.stations.length}, 制御点${controls.length}`
    );
  }

  // --- stations.json / index.json ---
  allBoxes.sort((a, b) =>
    a.line_id === b.line_id ? a.station_id.localeCompare(b.station_id) : a.line_id.localeCompare(b.line_id)
  );
  writeFileSync(
    join(PATHS.artifacts, "stations.json"),
    JSON.stringify({ schema_version: SCHEMA_VERSION, boxes: allBoxes }) + "\n"
  );

  const pkg = JSON.parse(readFileSync(join(PATHS.data, "../pipeline/package.json"), "utf-8")) as {
    version: string;
  };
  const index: IndexArtifact = {
    schema_version: SCHEMA_VERSION,
    generated_by: "pipeline (手編集禁止: data/ を編集して npm run build:data)",
    anchor: { lonlat: anchor.lonlat, epsg: anchor.epsg },
    lines: indexLines,
    stations_file: "stations.json",
    provenance: {
      pipeline_version: pkg.version,
      inputs_hash: computeInputsHash(),
      dem_providers: [...dem.usedProviders].sort() as ("gsi" | "terrarium")[],
    },
  };
  writeFileSync(join(PATHS.artifacts, "index.json"), JSON.stringify(index, null, 1) + "\n");
  console.log(`[done] ${indexLines.length}路線 / ホーム箱${allBoxes.length}個 → app/public/data/`);
}

function pointAt(path: SampledPath, s: number): { x: number; z: number } {
  const idx = Math.min(
    path.s.length - 1,
    Math.max(0, Math.round(s / (path.s[path.s.length - 1]! / (path.s.length - 1))))
  );
  return path.points[idx]!;
}
