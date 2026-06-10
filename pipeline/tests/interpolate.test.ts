import { describe, it, expect } from "vitest";
import { Pchip } from "../src/lib/interpolate.js";

describe("Pchip(単調性保存補間)", () => {
  it("制御点を正確に通る", () => {
    const p = new Pchip([
      { s: 0, v: -10 },
      { s: 1000, v: -30 },
      { s: 2500, v: -15 },
    ]);
    expect(p.at(0)).toBeCloseTo(-10);
    expect(p.at(1000)).toBeCloseTo(-30);
    expect(p.at(2500)).toBeCloseTo(-15);
  });

  it("単調な制御点間でオーバーシュートしない", () => {
    // 浅い駅 → 深い駅 の単調下降区間で、制御点の範囲を飛び出さないこと
    const p = new Pchip([
      { s: 0, v: -5 },
      { s: 800, v: -8 },
      { s: 1600, v: -40 },
    ]);
    for (let s = 0; s <= 1600; s += 10) {
      const v = p.at(s);
      expect(v).toBeLessThanOrEqual(-5 + 1e-9);
      expect(v).toBeGreaterThanOrEqual(-40 - 1e-9);
    }
  });

  it("範囲外は端の値で水平に延長する", () => {
    const p = new Pchip([
      { s: 100, v: -20 },
      { s: 200, v: -25 },
    ]);
    expect(p.at(-50)).toBeCloseTo(-20);
    expect(p.at(500)).toBeCloseTo(-25);
  });

  it("同一弧長の重複制御点は平均に潰す", () => {
    const p = new Pchip([
      { s: 100, v: -10 },
      { s: 100, v: -20 },
      { s: 300, v: -15 },
    ]);
    expect(p.at(100)).toBeCloseTo(-15);
  });

  it("勾配上限を指定すると制御点での傾きがクランプされる", () => {
    const p = new Pchip(
      [
        { s: 0, v: 0 },
        { s: 100, v: -50 }, // 500‰ 相当の無茶な入力
      ],
      { maxGradient: 0.05 }
    );
    // 端点傾きが ±50‰ に制限されるため、序盤の降下は緩やかになる
    const early = p.at(10);
    expect(Math.abs(early)).toBeLessThan(5);
  });
});
