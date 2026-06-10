/**
 * トンネルの描画。路線ごとに 1 本のチューブメッシュ + センターライン。
 *
 * チューブは平行移動フレーム(parallel transport frame)で自前生成する。
 * Three 標準の TubeGeometry はフレネ標構を使うため、ほぼ直線の区間で
 * フレームが突然反転して捻れることがある(地下鉄線形は直線が多い)。
 */
import * as THREE from "three";
import type { LineArtifact } from "../loader/artifacts.js";
import { CONFIG } from "../config.js";

export interface TunnelLayer {
  group: THREE.Group;
  setVisible(lineId: string, visible: boolean): void;
}

export function createTunnels(lines: LineArtifact[]): TunnelLayer {
  const group = new THREE.Group();
  const byLine = new Map<string, THREE.Group>();

  for (const line of lines) {
    const lineGroup = new THREE.Group();
    lineGroup.name = line.line_id;
    const color = new THREE.Color(line.color);

    const geometry = buildTube(line.positions, line.tunnel_radius_m, CONFIG.tunnels.radialSegments);
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color.clone().multiplyScalar(0.32),
      roughness: 0.55,
      metalness: 0.1,
      side: THREE.DoubleSide, // トンネル内部に入っても見えるように
    });
    lineGroup.add(new THREE.Mesh(geometry, material));

    // 遠距離でも視認できるセンターライン
    const lineGeom = new THREE.BufferGeometry();
    lineGeom.setAttribute("position", new THREE.Float32BufferAttribute(line.positions, 3));
    const centerline = new THREE.Line(
      lineGeom,
      new THREE.LineBasicMaterial({ color: color.clone().lerp(new THREE.Color(0xffffff), 0.35) })
    );
    lineGroup.add(centerline);

    byLine.set(line.line_id, lineGroup);
    group.add(lineGroup);
  }

  return {
    group,
    setVisible(lineId, visible) {
      const g = byLine.get(lineId);
      if (g) g.visible = visible;
    },
  };
}

/** 平行移動フレームによるチューブ生成 */
function buildTube(flat: number[], radius: number, radialSegments: number): THREE.BufferGeometry {
  const n = flat.length / 3;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    pts.push(new THREE.Vector3(flat[i * 3]!, flat[i * 3 + 1]!, flat[i * 3 + 2]!));
  }

  // 各点の接線
  const tangents: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(n - 1, i + 1)]!;
    tangents.push(b.clone().sub(a).normalize());
  }

  // フレームの平行移動: 前の法線を「接線に直交する平面」へ射影し続ける
  const normals: THREE.Vector3[] = [];
  let normal = new THREE.Vector3(0, 1, 0);
  if (Math.abs(normal.dot(tangents[0]!)) > 0.9) normal = new THREE.Vector3(1, 0, 0);
  for (let i = 0; i < n; i++) {
    const t = tangents[i]!;
    normal = normal.clone().sub(t.clone().multiplyScalar(normal.dot(t))).normalize();
    normals.push(normal);
  }

  const positions = new Float32Array(n * radialSegments * 3);
  const vertexNormals = new Float32Array(n * radialSegments * 3);
  const indices: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = tangents[i]!;
    const u = normals[i]!;
    const v = new THREE.Vector3().crossVectors(t, u);
    for (let j = 0; j < radialSegments; j++) {
      const a = (j / radialSegments) * Math.PI * 2;
      const dir = u
        .clone()
        .multiplyScalar(Math.cos(a))
        .addScaledVector(v, Math.sin(a));
      const k = (i * radialSegments + j) * 3;
      positions[k] = pts[i]!.x + dir.x * radius;
      positions[k + 1] = pts[i]!.y + dir.y * radius;
      positions[k + 2] = pts[i]!.z + dir.z * radius;
      vertexNormals[k] = dir.x;
      vertexNormals[k + 1] = dir.y;
      vertexNormals[k + 2] = dir.z;
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const j2 = (j + 1) % radialSegments;
      const a = i * radialSegments + j;
      const b = i * radialSegments + j2;
      const c = (i + 1) * radialSegments + j;
      const d = (i + 1) * radialSegments + j2;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(vertexNormals, 3));
  geometry.setIndex(indices);
  return geometry;
}
