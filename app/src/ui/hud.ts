/**
 * HUD: 現在地(緯度経度・海抜 T.P.・地表からの深さ・方位・速度)。
 */
import type { FlyControls } from "../camera/fly-controls.js";
import type { LocalFrame } from "../lib/proj.js";
import type { Terrain } from "../lib/terrain.js";
import { CONFIG } from "../config.js";

const DIRS = ["北", "北東", "東", "南東", "南", "南西", "西", "北西"];

export function startHud(
  controls: FlyControls,
  frame: LocalFrame,
  terrain: Terrain,
  getExaggeration: () => number
): void {
  const el = document.getElementById("hud")!;
  setInterval(() => {
    const p = controls.camera.position;
    const k = getExaggeration();
    const trueY = p.y / k; // シーンは高さ強調されていても HUD は実寸で表示する
    const ll = frame.toLonLat(p.x, p.z);
    const ground = terrain.elevationAt(ll);
    const depth = ground === null ? null : ground - trueY;

    // ヨー → 方位(ローカル -z が北)
    let deg = ((-controls.yaw * 180) / Math.PI) % 360;
    if (deg < 0) deg += 360;
    const dir = DIRS[Math.round(deg / 45) % 8];

    const depthHtml =
      depth === null
        ? `<span class="dim">地表比 —</span>`
        : depth >= 0
          ? `<span class="depth-under">地下 ${depth.toFixed(1)} m</span>`
          : `<span class="depth-above">地上 ${(-depth).toFixed(1)} m</span>`;

    const exagNote = k !== 1 ? ` <span class="dim">(高さ強調 ${k.toFixed(2).replace(/\.?0+$/, "")}×)</span>` : "";
    el.innerHTML =
      `<div class="big">${depthHtml}</div>` +
      `<div>海抜 T.P. ${trueY >= 0 ? "+" : ""}${trueY.toFixed(1)} m${exagNote}</div>` +
      `<div class="dim">${ll.lat.toFixed(5)}, ${ll.lon.toFixed(5)}</div>` +
      `<div class="dim">方位 ${dir} (${deg.toFixed(0)}°) ・ 速度 ${controls.speed.toFixed(0)} m/s</div>`;
  }, CONFIG.hud.updateIntervalMs);
}
