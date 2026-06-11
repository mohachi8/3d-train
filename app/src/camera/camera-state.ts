/**
 * カメラ状態の URL ハッシュ同期(ビューの共有リンク)。
 * 形式: #c=x,y,z,yaw,pitch
 * y は高さ強調に依存しない実寸 T.P. で保存する(強調設定が違う相手にも共有できる)。
 */
import type { FlyControls } from "./fly-controls.js";
import { CONFIG } from "../config.js";

export function restoreFromHash(controls: FlyControls, exaggeration: number): boolean {
  const m = location.hash.match(/c=([-\d.,]+)/);
  if (!m) return false;
  const v = m[1]!.split(",").map(Number);
  if (v.length !== 5 || v.some((n) => !Number.isFinite(n))) return false;
  controls.teleport(v[0]!, v[1]! * exaggeration, v[2]!, v[3]!, v[4]!);
  return true;
}

export function startHashSync(controls: FlyControls, getExaggeration: () => number): void {
  let last = "";
  setInterval(() => {
    const p = controls.camera.position;
    const trueY = p.y / getExaggeration();
    const s = `c=${p.x.toFixed(1)},${trueY.toFixed(1)},${p.z.toFixed(1)},${controls.yaw.toFixed(3)},${controls.pitch.toFixed(3)}`;
    if (s !== last) {
      last = s;
      history.replaceState(null, "", `#${s}`);
    }
  }, CONFIG.urlState.updateIntervalMs);
}
