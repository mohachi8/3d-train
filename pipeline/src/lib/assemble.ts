/**
 * 抽出済み線形 → トリミング済みサンプルパス への共通変換。
 * build と validate の両方が同じ経路で線形を構築する(結果の食い違い防止)。
 */
import type { ExtractedLine } from "../schemas/extracted.js";
import type { LocalFrame } from "./proj.js";
import {
  assembleChain,
  resample,
  projectPoint,
  trimPath,
  type Pt,
  type SampledPath,
} from "./linework.js";

const SAMPLE_STEP_M = 20;
/** 端の駅からこの距離だけ線形を残す(引上線ぶん)。それ以遠は直通区間とみなして捨てる */
const TRIM_MARGIN_M = 250;

export interface LinePathResult {
  path: SampledPath;
  /** 結合に使われなかったチャンク数(連絡線など) */
  droppedChunks: number;
  /** トリミングで除去した長さ [m](直通区間など) */
  trimmedM: number;
  /** 駅名 → ローカル座標 */
  stations: Map<string, Pt>;
}

export function buildLinePath(
  extracted: ExtractedLine,
  frame: LocalFrame,
  /** 駅位置の上書き(深度YAMLの lonlat)。トリミングの基準にも使う */
  overrides?: Map<string, Pt>
): LinePathResult {
  const trackFeatures = extracted.features.filter((f) => f.properties.kind === "track");
  const chunks = trackFeatures.map((f) =>
    (f.geometry.coordinates as [number, number][]).map(([lon, lat]) => frame.toLocal({ lon, lat }))
  );
  const ranks = trackFeatures.map((f) =>
    (f.properties as { role?: string }).role === "sub" ? 2 : 0
  );
  const chain = assembleChain(chunks, undefined, ranks);
  const full = resample(chain.path, SAMPLE_STEP_M);

  const stations = new Map<string, Pt>();
  for (const f of extracted.features) {
    if (f.properties.kind !== "station") continue;
    const [lon, lat] = f.geometry.coordinates as [number, number];
    stations.set(f.properties.name, frame.toLocal({ lon: lon!, lat: lat! }));
  }

  // 全駅の射影範囲 + マージン でトリミング(範囲外 = 他社直通区間・回送線)
  let sMin = Infinity;
  let sMax = -Infinity;
  for (const [name, p] of stations) {
    const pos = overrides?.get(name) ?? p;
    for (const pass of projectPoint(full, pos)) {
      sMin = Math.min(sMin, pass.s);
      sMax = Math.max(sMax, pass.s);
    }
  }
  const totalLen = full.s[full.s.length - 1]!;
  let path = full;
  let trimmedM = 0;
  if (sMin < sMax) {
    const s0 = Math.max(0, sMin - TRIM_MARGIN_M);
    const s1 = Math.min(totalLen, sMax + TRIM_MARGIN_M);
    if (s0 > 0 || s1 < totalLen) {
      path = trimPath(full, s0, s1);
      trimmedM = totalLen - (s1 - s0);
    }
  }
  return { path, droppedChunks: chain.dropped.length, trimmedM, stations };
}
