import { describe, it, expect } from "vitest";
import { lonLatToPlane, LocalFrame } from "../src/lib/proj.js";

describe("平面直角座標系IX系", () => {
  it("東京駅付近の座標が既知の範囲に入る", () => {
    // 系IX原点は (36°N, 139°50'E)。東京駅は南へ約35km・西へ約6km
    const p = lonLatToPlane({ lon: 139.7671, lat: 35.6812 });
    expect(p.n).toBeGreaterThan(-36500);
    expect(p.n).toBeLessThan(-34500);
    expect(p.e).toBeGreaterThan(-7000);
    expect(p.e).toBeLessThan(-5000);
  });

  it("ローカル座標の往復変換が一致する", () => {
    const frame = new LocalFrame({ lon: 139.7671, lat: 35.6812 });
    const roppongi = { lon: 139.7314, lat: 35.6641 };
    const local = frame.toLocal(roppongi);
    const back = frame.toLonLat(local);
    expect(back.lon).toBeCloseTo(roppongi.lon, 8);
    expect(back.lat).toBeCloseTo(roppongi.lat, 8);
  });

  it("ローカル座標の軸の向き: x=東, z=南", () => {
    const frame = new LocalFrame({ lon: 139.7671, lat: 35.6812 });
    const east = frame.toLocal({ lon: 139.78, lat: 35.6812 });
    expect(east.x).toBeGreaterThan(0);
    expect(Math.abs(east.z)).toBeLessThan(50);
    const south = frame.toLocal({ lon: 139.7671, lat: 35.67 });
    expect(south.z).toBeGreaterThan(0);
    expect(Math.abs(south.x)).toBeLessThan(50);
  });
});
