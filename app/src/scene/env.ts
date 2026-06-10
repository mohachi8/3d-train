/**
 * シーン環境: 背景・フォグ・ライティング・基準グリッド(T.P.±0)。
 */
import * as THREE from "three";
import { CONFIG } from "../config.js";

export interface Env {
  grid: THREE.GridHelper;
}

export function setupEnv(scene: THREE.Scene): Env {
  scene.background = new THREE.Color(CONFIG.scene.background);
  scene.fog = new THREE.FogExp2(CONFIG.scene.background, CONFIG.scene.fogDensity);

  const hemi = new THREE.HemisphereLight(0xbcd2ff, 0x1a2030, 0.85);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 1.1);
  dir.position.set(0.4, 1, 0.6);
  scene.add(dir);
  const ambient = new THREE.AmbientLight(0x404a5c, 0.6);
  scene.add(ambient);

  // 海抜 0m(T.P.±0)の基準グリッド。深さの感覚を掴むための水準面
  const grid = new THREE.GridHelper(
    CONFIG.scene.gridSize,
    CONFIG.scene.gridDivisions,
    0x2c4468,
    0x18243a
  );
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.5;
  grid.position.y = 0;
  grid.visible = false;
  scene.add(grid);

  return { grid };
}
