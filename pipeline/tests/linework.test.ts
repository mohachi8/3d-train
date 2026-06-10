import { describe, it, expect } from "vitest";
import {
  assembleChain,
  resample,
  projectPoint,
  findCrossings,
  arclengths,
  type Pt,
} from "../src/lib/linework.js";

const line = (...pts: [number, number][]): Pt[] => pts.map(([x, z]) => ({ x, z }));

describe("assembleChain", () => {
  it("順不同・逆向きのチャンクを1本に結合する", () => {
    const a = line([0, 0], [100, 0]);
    const b = line([200, 0], [100, 0]); // 逆向き
    const c = line([200, 0], [300, 0]);
    const { path, dropped } = assembleChain([c, a, b]);
    expect(dropped).toEqual([]);
    // 始点方向は不定だが、両端と全長は (0,0)〜(300,0) の 300m になる
    const ends = [path[0], path[path.length - 1]].map((p) => p!.x).sort((x, y) => x - y);
    expect(ends).toEqual([0, 300]);
    expect(arclengths(path).pop()).toBeCloseTo(300);
  });

  it("環状部+放射部(大江戸線型)をオイラー路として1本にする", () => {
    // 放射部: (-200,0)→(0,0)、環状部: (0,0)→(100,100)→(200,0)→(100,-100)→(0,0)
    const tail = line([-200, 0], [0, 0]);
    const loop1 = line([0, 0], [100, 100], [200, 0]);
    const loop2 = line([200, 0], [100, -100], [0, 0]);
    const { path, dropped } = assembleChain([loop1, tail, loop2]);
    // 全チャンクが一筆書きに含まれ、全長が一致すること(始点はどの奇数次数端点でもよい)
    expect(dropped).toEqual([]);
    expect(arclengths(path).pop()!).toBeCloseTo(200 + 4 * Math.hypot(100, 100));
  });

  it("接続できない sub チャンク(連絡線)は dropped として返す", () => {
    const main1 = line([0, 0], [100, 0]);
    const main2 = line([100, 0], [200, 0]);
    const connector = line([150, 500], [150, 800]); // 本線から離れた連絡線
    const { path, dropped } = assembleChain([main1, connector, main2], 50, [0, 2, 0]);
    expect(dropped).toEqual([1]);
    expect(arclengths(path).pop()).toBeCloseTo(200);
  });

  it("本線チャンクが結合できなければ例外", () => {
    const a = line([0, 0], [100, 0]);
    const b = line([5000, 0], [6000, 0]); // 大きく分断
    expect(() => assembleChain([a, b])).toThrow(/結合できません/);
  });
});

describe("resample / projectPoint", () => {
  it("等間隔リサンプリングが全長を保存する", () => {
    const p = resample(line([0, 0], [1000, 0]), 20);
    expect(p.s[p.s.length - 1]).toBeCloseTo(1000);
    expect(p.points.length).toBe(p.s.length);
  });

  it("駅の射影: 1回通過の駅は1箇所、2回通過(都庁前型)は2箇所", () => {
    // U字: 行き(z=0)と帰り(z=400)が平行
    const u = resample(
      line([0, 0], [2000, 0], [2000, 400], [0, 400]),
      20
    );
    const once = projectPoint(u, { x: 1000, z: -30 });
    expect(once.length).toBe(1);
    expect(once[0]!.s).toBeCloseTo(1000, -2);
    const twice = projectPoint(u, { x: 100, z: 200 }, 250);
    expect(twice.length).toBe(2);
  });
});

describe("findCrossings", () => {
  it("直交する2線の交点を1つ検出する", () => {
    const a = resample(line([-100, 0], [100, 0]), 10);
    const b = resample(line([0, -100], [0, 100]), 10);
    const xs = findCrossings(a, b);
    expect(xs.length).toBe(1);
    expect(xs[0]!.point.x).toBeCloseTo(0, 0);
    expect(xs[0]!.angle).toBeCloseTo(Math.PI / 2, 1);
  });
});
