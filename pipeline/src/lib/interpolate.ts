/**
 * 縦断線形の補間。
 *
 * 制御点(駅の弧長位置, ホーム標高 T.P.)を PCHIP(単調性保存3次エルミート,
 * Fritsch–Carlson)で補間する。PCHIP はオーバーシュートしない(制御点の間で
 * 値が制御点範囲を飛び出さない)ため、「隣り合う駅の深さの間を滑らかに遷移する」
 * という地下鉄縦断の近似に適する。
 */

export interface ControlPoint {
  /** 弧長位置 [m]。昇順であること。 */
  s: number;
  /** 標高 T.P. [m] */
  v: number;
}

export class Pchip {
  private xs: number[] = [];
  private ys: number[] = [];
  private ms: number[] = []; // 各制御点での傾き

  constructor(points: ControlPoint[], opts?: { maxGradient?: number }) {
    const pts = [...points].sort((a, b) => a.s - b.s);
    // 同一弧長位置の重複は平均に潰す(駅が複数ホームを持つ場合など)
    for (const p of pts) {
      const last = this.xs.length - 1;
      if (last >= 0 && Math.abs(p.s - this.xs[last]!) < 1e-6) {
        this.ys[last] = (this.ys[last]! + p.v) / 2;
      } else {
        this.xs.push(p.s);
        this.ys.push(p.v);
      }
    }
    if (this.xs.length === 0) throw new Error("Pchip: 制御点がありません");
    this.ms = fritschCarlsonSlopes(this.xs, this.ys);
    const maxG = opts?.maxGradient;
    if (maxG !== undefined) {
      this.ms = this.ms.map((m) => Math.max(-maxG, Math.min(maxG, m)));
    }
  }

  /** 範囲外は端の値で水平に延長する(坑口・終端の扱いは呼び出し側で制御点を足す) */
  at(s: number): number {
    const { xs, ys, ms } = this;
    const n = xs.length;
    if (n === 1 || s <= xs[0]!) return ys[0]!;
    if (s >= xs[n - 1]!) return ys[n - 1]!;
    // 二分探索: xs[i] <= s < xs[i+1]
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid]! <= s) lo = mid;
      else hi = mid;
    }
    const h = xs[lo + 1]! - xs[lo]!;
    const t = (s - xs[lo]!) / h;
    const y0 = ys[lo]!;
    const y1 = ys[lo + 1]!;
    const m0 = ms[lo]!;
    const m1 = ms[lo + 1]!;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      y0 * (2 * t3 - 3 * t2 + 1) +
      m0 * h * (t3 - 2 * t2 + t) +
      y1 * (-2 * t3 + 3 * t2) +
      m1 * h * (t3 - t2)
    );
  }
}

/** Fritsch–Carlson 法による単調性保存の傾き決定 */
function fritschCarlsonSlopes(xs: number[], ys: number[]): number[] {
  const n = xs.length;
  if (n === 1) return [0];
  const d: number[] = []; // 区間勾配
  for (let i = 0; i < n - 1; i++) {
    d.push((ys[i + 1]! - ys[i]!) / (xs[i + 1]! - xs[i]!));
  }
  const m: number[] = new Array(n).fill(0);
  m[0] = d[0]!;
  m[n - 1] = d[n - 2]!;
  for (let i = 1; i < n - 1; i++) {
    const a = d[i - 1]!;
    const b = d[i]!;
    if (a * b <= 0) {
      m[i] = 0; // 極値: 傾き0で滑らかに折り返す
    } else {
      // 調和平均(重み付き)
      const h0 = xs[i]! - xs[i - 1]!;
      const h1 = xs[i + 1]! - xs[i]!;
      const w0 = 2 * h1 + h0;
      const w1 = h1 + 2 * h0;
      m[i] = (w0 + w1) / (w0 / a + w1 / b);
    }
  }
  return m;
}
