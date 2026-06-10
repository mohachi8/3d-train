/**
 * 駅ホームの描画。全ホーム箱を InstancedMesh で 2 draw call に。
 *  - 公表値・編纂値(official/secondary): 実体感のある箱
 *  - 推定値(estimated): 半透明の箱(視覚的に区別する=データの誠実さ)
 */
import * as THREE from "three";
import type { StationBox } from "../loader/artifacts.js";

export interface StationLayer {
  group: THREE.Group;
  setVisible(lineId: string, visible: boolean): void;
}

export function createStations(boxes: StationBox[]): StationLayer {
  const group = new THREE.Group();
  const solid = boxes.filter((b) => b.confidence !== "estimated");
  const estimated = boxes.filter((b) => b.confidence === "estimated");

  const meshes: { mesh: THREE.InstancedMesh; boxes: StationBox[] }[] = [];
  for (const [set, opacity] of [
    [solid, 0.92],
    [estimated, 0.38],
  ] as const) {
    if (set.length === 0) continue;
    const geom = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({
      transparent: true,
      opacity,
      roughness: 0.4,
      metalness: 0.05,
      emissiveIntensity: 0.4,
    });
    const mesh = new THREE.InstancedMesh(geom, mat, set.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const posV = new THREE.Vector3();
    for (let i = 0; i < set.length; i++) {
      const b = set[i]!;
      posV.set(b.center[0], b.center[1], b.center[2]);
      q.setFromEuler(new THREE.Euler(0, -b.heading, 0));
      scale.set(b.size[0], b.size[1], b.size[2]);
      m.compose(posV, q, scale);
      mesh.setMatrixAt(i, m);
      const c = new THREE.Color(lineColor(b.line_id));
      mesh.setColorAt(i, c.lerp(new THREE.Color(0xffffff), 0.25));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
    meshes.push({ mesh, boxes: set });
  }

  // 路線フィルタ: インスタンスのスケールを 0 にして隠す
  const hidden = new Set<string>();
  const apply = () => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const posV = new THREE.Vector3();
    for (const { mesh, boxes: set } of meshes) {
      for (let i = 0; i < set.length; i++) {
        const b = set[i]!;
        const hide = hidden.has(b.line_id);
        posV.set(b.center[0], b.center[1], b.center[2]);
        q.setFromEuler(new THREE.Euler(0, -b.heading, 0));
        scale.set(b.size[0], b.size[1], b.size[2]).multiplyScalar(hide ? 0 : 1);
        m.compose(posV, q, scale);
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  };

  return {
    group,
    setVisible(lineId, visible) {
      if (visible) hidden.delete(lineId);
      else hidden.add(lineId);
      apply();
    },
  };
}

// 駅箱の色は stations.json に色情報を持たないため、line_id から引けるよう
// createStations の前に registerLineColors を呼ぶ。
const colors = new Map<string, string>();
export function registerLineColors(lines: { id: string; color: string }[]): void {
  for (const l of lines) colors.set(l.id, l.color);
}
function lineColor(lineId: string): string {
  return colors.get(lineId) ?? "#888888";
}
