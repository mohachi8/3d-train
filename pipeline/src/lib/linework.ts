/**
 * 平面線形の処理: 線分チェーンの結合、弧長パラメータ化、リサンプリング、
 * 点の線形への射影(複数回通過の検出を含む)。
 *
 * 全てローカル水平座標(x=東, z=南, 単位m)の 2D で扱う。
 */
import type { LocalXZ } from "./proj.js";

export type Pt = LocalXZ;

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.z - b.z);

export interface ChainResult {
  path: Pt[];
  /** 結合に使われなかったチャンクの index(他路線への連絡線など) */
  dropped: number[];
}

/**
 * 複数のポリラインチャンクを 1 本のパスに結合する。
 *
 * 奇数次数の端点(なければ rank 最小のチャンクの端点)から未使用チャンクを
 * 貪欲に辿る。大江戸線のような「環状部+放射部」(オイラー路)も 1 本になる。
 *
 * ranks: チャンクの優先度(0=本線, 大きいほど補助的)。端点距離がほぼ同じ
 * 候補が複数あるとき(駅の分岐点など)に本線を優先するために使う。
 * つながらなかったチャンク(連絡線・留置線)は dropped として返す。
 * ※ 本線の一部を誤って落とした場合は、駅スナップ検証(150m)が必ず検出する。
 */
export function assembleChain(chunks: Pt[][], tolerance = 50, ranks?: number[]): ChainResult {
  if (chunks.length === 0) throw new Error("assembleChain: チャンクがありません");
  const rank = (i: number) => ranks?.[i] ?? 0;
  if (chunks.length === 1) return { path: [...chunks[0]!], dropped: [] };

  type End = { chunk: number; end: 0 | 1 };
  const endpoint = (e: End): Pt => {
    const c = chunks[e.chunk]!;
    return e.end === 0 ? c[0]! : c[c.length - 1]!;
  };

  // 本線(rank 0)チャンクの端点のうち、接続数が奇数のものを開始点にする
  const mains = chunks.map((_, i) => i).filter((i) => rank(i) === 0);
  const degree = (p: Pt) => {
    let n = 0;
    for (const i of mains) {
      for (const end of [0, 1] as const) {
        if (dist(endpoint({ chunk: i, end }), p) <= tolerance) n++;
      }
    }
    return n;
  };

  let start: End | undefined;
  for (const i of mains) {
    for (const end of [0, 1] as const) {
      if (degree(endpoint({ chunk: i, end })) % 2 === 1) {
        start = { chunk: i, end };
        break;
      }
    }
    if (start) break;
  }
  start ??= { chunk: mains[0] ?? 0, end: 0 };

  const used = new Set<number>();
  const path: Pt[] = [];

  // 指定点に接続できる未使用チャンクを探す(距離が主、rank はタイブレーク)
  const findNext = (at: Pt): End | undefined => {
    let next: End | undefined;
    let bestScore = Infinity;
    for (let i = 0; i < chunks.length; i++) {
      if (used.has(i)) continue;
      for (const end of [0, 1] as const) {
        const d = dist(endpoint({ chunk: i, end }), at);
        if (d > tolerance) continue;
        const score = d + rank(i) * 1.0;
        if (score < bestScore) {
          bestScore = score;
          next = { chunk: i, end };
        }
      }
    }
    return next;
  };

  // 前方(末尾)への延長
  let cur: End | undefined = start;
  while (cur) {
    const c = chunks[cur.chunk]!;
    const ordered = cur.end === 0 ? c : [...c].reverse();
    if (path.length === 0) path.push(...ordered);
    else path.push(...ordered.slice(1));
    used.add(cur.chunk);
    cur = findNext(path[path.length - 1]!);
  }
  // 後方(先頭)への延長(開始チャンクの選び方によっては先頭側が残る)
  for (;;) {
    const prev = findNext(path[0]!);
    if (!prev) break;
    const c = chunks[prev.chunk]!;
    // prev.end が接続側なので、先頭に「接続側を末尾にした並び」を差し込む
    const ordered = prev.end === 0 ? [...c].reverse() : c;
    path.unshift(...ordered.slice(0, -1));
    used.add(prev.chunk);
  }

  const dropped = chunks.map((_, i) => i).filter((i) => !used.has(i));
  const droppedMains = dropped.filter((i) => rank(i) === 0);
  if (droppedMains.length > 0) {
    throw new Error(
      `assembleChain: 本線チャンク ${droppedMains.join(",")} を結合できませんでした。` +
        `データの分断か tolerance(${tolerance}m)不足の可能性があります。`
    );
  }
  return { path, dropped };
}

/** 各頂点までの累積弧長 [m] */
export function arclengths(path: Pt[]): number[] {
  const s: number[] = [0];
  for (let i = 1; i < path.length; i++) {
    s.push(s[i - 1]! + dist(path[i - 1]!, path[i]!));
  }
  return s;
}

export interface SampledPath {
  points: Pt[];
  /** 各サンプルの弧長 [m](等間隔, 最終点は全長) */
  s: number[];
}

/** 等間隔(step m)でリサンプリングする。元の全長と終端は保存する。 */
export function resample(path: Pt[], step = 20): SampledPath {
  const s = arclengths(path);
  const total = s[s.length - 1]!;
  const n = Math.max(2, Math.ceil(total / step) + 1);
  const points: Pt[] = [];
  const outS: number[] = [];
  let seg = 0;
  for (let i = 0; i < n; i++) {
    const target = (total * i) / (n - 1);
    while (seg < path.length - 2 && s[seg + 1]! < target) seg++;
    const s0 = s[seg]!;
    const s1 = s[seg + 1]!;
    const t = s1 > s0 ? (target - s0) / (s1 - s0) : 0;
    const a = path[seg]!;
    const b = path[seg + 1]!;
    points.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    outS.push(target);
  }
  return { points, s: outS };
}

/**
 * パスを弧長範囲 [s0, s1] に切り詰め、弧長を 0 起点に振り直す。
 *
 * mini-tokyo-3d 等の上流データは他社直通区間まで線形が伸びていることがある。
 * 「全駅の射影範囲 + マージン」でトリミングすることで、当該路線の区間だけを残す。
 */
export function trimPath(sampled: SampledPath, s0: number, s1: number): SampledPath {
  const points: Pt[] = [];
  const s: number[] = [];
  for (let i = 0; i < sampled.s.length; i++) {
    const v = sampled.s[i]!;
    if (v >= s0 && v <= s1) {
      points.push(sampled.points[i]!);
      s.push(v - s0);
    }
  }
  if (points.length < 2) throw new Error("trimPath: トリミング後の線形が短すぎます");
  return { points, s };
}

export interface PassOnLine {
  /** 弧長位置 [m] */
  s: number;
  /** 線形からの距離 [m] */
  distance: number;
  /** その地点での進行方向(ラジアン, atan2(dz, dx)) */
  heading: number;
}

/**
 * 点がパスに接近する箇所(距離の局所最小)を全て検出する。
 * 環状線が同じ駅を複数回通る場合(大江戸線・都庁前)に複数返る。
 */
export function projectPoint(
  sampled: SampledPath,
  p: Pt,
  maxDistance = 150,
  minSeparation = 300
): PassOnLine[] {
  const { points, s } = sampled;
  const d: number[] = points.map((q) => dist(p, q));
  const passes: PassOnLine[] = [];
  for (let i = 0; i < points.length; i++) {
    const here = d[i]!;
    if (here > maxDistance) continue;
    const prev = i > 0 ? d[i - 1]! : Infinity;
    const next = i < points.length - 1 ? d[i + 1]! : Infinity;
    if (here <= prev && here <= next) {
      const j0 = Math.max(0, i - 1);
      const j1 = Math.min(points.length - 1, i + 1);
      const a = points[j0]!;
      const b = points[j1]!;
      passes.push({
        s: s[i]!,
        distance: here,
        heading: Math.atan2(b.z - a.z, b.x - a.x),
      });
    }
  }
  // 近接した局所最小(サンプリングノイズ)は距離が小さい方だけ残す
  passes.sort((a, b) => a.s - b.s);
  const merged: PassOnLine[] = [];
  for (const pass of passes) {
    const last = merged[merged.length - 1];
    if (last && pass.s - last.s < minSeparation) {
      if (pass.distance < last.distance) merged[merged.length - 1] = pass;
    } else {
      merged.push(pass);
    }
  }
  return merged;
}

/** 2D ポリライン同士の交点(セグメント交差)を列挙する。交差角 [rad] 付き。 */
export interface Crossing {
  point: Pt;
  sA: number;
  sB: number;
  angle: number;
}

export function findCrossings(a: SampledPath, b: SampledPath, dedupeRadius = 50): Crossing[] {
  const out: Crossing[] = [];
  for (let i = 0; i < a.points.length - 1; i++) {
    const p1 = a.points[i]!;
    const p2 = a.points[i + 1]!;
    for (let j = 0; j < b.points.length - 1; j++) {
      const q1 = b.points[j]!;
      const q2 = b.points[j + 1]!;
      const hit = segIntersect(p1, p2, q1, q2);
      if (!hit) continue;
      const angA = Math.atan2(p2.z - p1.z, p2.x - p1.x);
      const angB = Math.atan2(q2.z - q1.z, q2.x - q1.x);
      let angle = Math.abs(angA - angB) % Math.PI;
      if (angle > Math.PI / 2) angle = Math.PI - angle;
      out.push({
        point: hit.point,
        sA: a.s[i]! + hit.tA * (a.s[i + 1]! - a.s[i]!),
        sB: b.s[j]! + hit.tB * (b.s[j + 1]! - b.s[j]!),
        angle,
      });
    }
  }
  // サンプル点上の交差はセグメント両側で重複検出されるため、近接した交点を1つに潰す
  const deduped: Crossing[] = [];
  for (const c of out) {
    const near = deduped.find((d) => dist(d.point, c.point) < dedupeRadius);
    if (!near) deduped.push(c);
  }
  return deduped;
}

function segIntersect(
  p1: Pt,
  p2: Pt,
  q1: Pt,
  q2: Pt
): { point: Pt; tA: number; tB: number } | undefined {
  const rx = p2.x - p1.x;
  const rz = p2.z - p1.z;
  const sx = q2.x - q1.x;
  const sz = q2.z - q1.z;
  const denom = rx * sz - rz * sx;
  if (Math.abs(denom) < 1e-12) return undefined;
  const dx = q1.x - p1.x;
  const dz = q1.z - p1.z;
  const tA = (dx * sz - dz * sx) / denom;
  const tB = (dx * rz - dz * rx) / denom;
  if (tA < 0 || tA > 1 || tB < 0 || tB > 1) return undefined;
  return { point: { x: p1.x + tA * rx, z: p1.z + tA * rz }, tA, tB };
}
