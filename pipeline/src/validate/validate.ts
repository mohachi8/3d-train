/**
 * データ検証。入力(data/)とアーティファクト(app/public/data/)の両方を検査する。
 *
 * severity:
 *   error … マージ不可(CI が落ちる)。スキーマ違反・欠損・鮮度切れなど確実な問題
 *   warn  … マージ可だが解消が望ましい。推定値・交差離隔の疑いなど
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PATHS,
  loadAnchor,
  loadOperators,
  loadLines,
  loadDepthFile,
  loadExtractedLine,
  loadCrossings,
  loadProfileHints,
  computeInputsHash,
} from "../lib/context.js";
import { LocalFrame } from "../lib/proj.js";
import { projectPoint, findCrossings, type SampledPath } from "../lib/linework.js";
import { buildLinePath } from "../lib/assemble.js";
import {
  IndexArtifactSchema,
  LineArtifactSchema,
  StationsArtifactSchema,
  type LineArtifact,
} from "../schemas/artifacts.js";

export interface Finding {
  severity: "error" | "warn";
  check: string;
  message: string;
}

export async function validate(): Promise<Finding[]> {
  const findings: Finding[] = [];
  const err = (check: string, message: string) => findings.push({ severity: "error", check, message });
  const warn = (check: string, message: string) => findings.push({ severity: "warn", check, message });

  // --- 1. スキーマ検証(ローダが zod で検証し、失敗は例外になる) ---
  let lines;
  try {
    loadAnchor();
    loadOperators();
    lines = loadLines();
    loadCrossings();
    loadProfileHints();
  } catch (e) {
    err("schema", (e as Error).message);
    return findings; // レジストリが壊れていたら以降は検査不能
  }

  const ids = new Set<string>();
  for (const line of lines) {
    if (ids.has(line.id)) err("schema", `lines.yaml: 路線ID重複 ${line.id}`);
    ids.add(line.id);
  }

  const anchor = loadAnchor();
  const frame = new LocalFrame({ lon: anchor.lonlat[0], lat: anchor.lonlat[1] });
  const enabled = lines.filter((l) => l.enabled);
  const paths = new Map<string, SampledPath>();

  for (const line of enabled) {
    // --- 2. 抽出済み線形と深度ファイルの存在・整合 ---
    let extracted;
    let depthFile;
    try {
      extracted = loadExtractedLine(line.id);
      depthFile = loadDepthFile(line.id);
    } catch (e) {
      err("schema", (e as Error).message);
      continue;
    }
    if (!extracted) {
      err("coverage", `${line.id}: 抽出済み線形がありません(import:mt3d / extract-n02 を実行)`);
      continue;
    }
    if (!depthFile) {
      err("coverage", `${line.id}: 深度ファイルがありません(data/depths/...)`);
      continue;
    }

    let path: SampledPath;
    let stationLocals: Map<string, { x: number; z: number }>;
    try {
      const built = buildLinePath(extracted, frame);
      path = built.path;
      stationLocals = built.stations;
    } catch (e) {
      err("linework", `${line.id}: ${(e as Error).message}`);
      continue;
    }
    paths.set(line.id, path);

    // --- 3. カバレッジ: 線形の駅 ⊆ 深度YAML の駅、その逆 ---
    const extNames = new Set(stationLocals.keys());
    const depthNames = new Set(depthFile.stations.map((s) => s.match_name ?? s.name));
    for (const n of extNames) {
      if (!depthNames.has(n)) err("coverage", `${line.id}: 駅「${n}」の深度エントリがありません`);
    }
    for (const n of depthNames) {
      if (!extNames.has(n)) err("coverage", `${line.id}: 深度YAMLの駅「${n}」が線形データにありません`);
    }

    // --- 4. スナップ距離と推定値の割合 ---
    let estimated = 0;
    let total = 0;
    for (const st of depthFile.stations) {
      const pos = stationLocals.get(st.match_name ?? st.name);
      if (!pos) continue;
      const passes = projectPoint(path, pos);
      if (passes.length === 0) {
        err("snap", `${line.id}/${st.id}: 駅が線形から150m以内にありません`);
      } else {
        const d = Math.min(...passes.map((p) => p.distance));
        if (d > 60) warn("snap", `${line.id}/${st.id}: 駅と線形の距離 ${d.toFixed(0)}m(>60m)`);
      }
      for (const pf of st.platforms) {
        total++;
        if (pf.confidence === "estimated") estimated++;
      }
    }
    if (estimated > 0) {
      warn(
        "confidence",
        `${line.id}: ホーム深度の推定値 ${estimated}/${total} 件(公表値への置換が望ましい)`
      );
    }
  }

  // --- 5. アーティファクトの検証(存在・スキーマ・鮮度) ---
  const indexPath = join(PATHS.artifacts, "index.json");
  if (!existsSync(indexPath)) {
    err("artifacts", "app/public/data/index.json がありません(npm run build:data を実行)");
    return findings;
  }
  const index = IndexArtifactSchema.safeParse(JSON.parse(readFileSync(indexPath, "utf-8")));
  if (!index.success) {
    err("artifacts", `index.json がスキーマに合いません: ${index.error.issues[0]?.message}`);
    return findings;
  }
  const currentHash = computeInputsHash();
  if (index.data.provenance.inputs_hash !== currentHash) {
    err(
      "freshness",
      `アーティファクトが古いか手編集されています(inputs_hash 不一致)。npm run build:data を再実行してください`
    );
  }

  const artifacts: LineArtifact[] = [];
  for (const l of index.data.lines) {
    const p = join(PATHS.artifacts, l.file);
    if (!existsSync(p)) {
      err("artifacts", `${l.file} がありません`);
      continue;
    }
    const a = LineArtifactSchema.safeParse(JSON.parse(readFileSync(p, "utf-8")));
    if (!a.success) {
      err("artifacts", `${l.file}: ${a.error.issues[0]?.message}`);
      continue;
    }
    artifacts.push(a.data);
  }
  const stationsPath = join(PATHS.artifacts, index.data.stations_file);
  if (existsSync(stationsPath)) {
    const s = StationsArtifactSchema.safeParse(JSON.parse(readFileSync(stationsPath, "utf-8")));
    if (!s.success) err("artifacts", `stations.json: ${s.error.issues[0]?.message}`);
  } else {
    err("artifacts", "stations.json がありません");
  }

  // --- 6. 縦断勾配チェック ---
  for (const a of artifacts) {
    let maxG = 0;
    let at = 0;
    for (let i = 1; i < a.arclength.length; i++) {
      const ds = a.arclength[i]! - a.arclength[i - 1]!;
      if (ds <= 0) continue;
      const dy = a.positions[i * 3 + 1]! - a.positions[(i - 1) * 3 + 1]!;
      const g = Math.abs(dy / ds);
      if (g > maxG) {
        maxG = g;
        at = a.arclength[i]!;
      }
    }
    if (maxG > 0.06) {
      err("gradient", `${a.line_id}: 勾配 ${(maxG * 1000).toFixed(0)}‰ (>60‰) @ ${(at / 1000).toFixed(1)}km — 深度データの矛盾の可能性`);
    } else if (maxG > 0.045) {
      warn("gradient", `${a.line_id}: 勾配 ${(maxG * 1000).toFixed(0)}‰ (>45‰) @ ${(at / 1000).toFixed(1)}km`);
    }
  }

  // --- 7. 交差離隔チェック ---
  const MIN_SEP = 6.5;
  const MIN_ANGLE = (15 * Math.PI) / 180;
  const constraints = loadCrossings();
  for (let i = 0; i < artifacts.length; i++) {
    for (let j = i + 1; j < artifacts.length; j++) {
      const a = artifacts[i]!;
      const b = artifacts[j]!;
      const pa = toSampled(a);
      const pb = toSampled(b);
      for (const c of findCrossings(pa, pb)) {
        if (c.angle < MIN_ANGLE) continue; // 並走区間の擬似交差は無視
        const ya = yAt(a, c.sA);
        const yb = yAt(b, c.sB);
        const sep = Math.abs(ya - yb);
        const ll = frameToLonLat(frame, c.point.x, c.point.z);
        const where = `(${ll.lat.toFixed(4)}, ${ll.lon.toFixed(4)})`;
        const constraint = constraints.find(
          (k) =>
            ((k.lines[0] === a.line_id && k.lines[1] === b.line_id) ||
              (k.lines[0] === b.line_id && k.lines[1] === a.line_id)) &&
            distLL(k.near.lonlat, [ll.lon, ll.lat]) < k.near.radius_m
        );
        if (constraint) {
          const upper = constraint.order[0] === a.line_id ? ya : yb;
          const lower = constraint.order[0] === a.line_id ? yb : ya;
          if (upper <= lower) {
            err(
              "crossing",
              `${a.line_id} × ${b.line_id} @ ${where}: 上下関係が制約と逆です(${constraint.order[0]} が上のはず)`
            );
          } else if (upper - lower < constraint.min_separation_m) {
            warn(
              "crossing",
              `${a.line_id} × ${b.line_id} @ ${where}: 離隔 ${(upper - lower).toFixed(1)}m < 制約 ${constraint.min_separation_m}m`
            );
          }
        } else if (sep < MIN_SEP) {
          warn(
            "crossing",
            `${a.line_id} × ${b.line_id} @ ${where}: 鉛直離隔 ${sep.toFixed(1)}m (<${MIN_SEP}m)。` +
              ` 正しければ constraints/crossings.yaml に明示、誤りなら profile-hints で補正`
          );
        }
      }
    }
  }

  return findings;
}

function toSampled(a: LineArtifact): SampledPath {
  const points = [];
  for (let i = 0; i < a.arclength.length; i++) {
    points.push({ x: a.positions[i * 3]!, z: a.positions[i * 3 + 2]! });
  }
  return { points, s: a.arclength };
}

function yAt(a: LineArtifact, s: number): number {
  const total = a.arclength[a.arclength.length - 1]!;
  const idx = Math.max(0, Math.min(a.arclength.length - 1, Math.round((s / total) * (a.arclength.length - 1))));
  return a.positions[idx * 3 + 1]!;
}

function frameToLonLat(frame: LocalFrame, x: number, z: number) {
  return frame.toLonLat({ x, z });
}

/** 経度緯度間の概算距離 [m](東京近傍) */
function distLL(a: [number, number], b: [number, number]): number {
  const dx = (a[0] - b[0]) * 90000;
  const dz = (a[1] - b[1]) * 111000;
  return Math.hypot(dx, dz);
}
