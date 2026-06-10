/**
 * 半透明の地表面。地理院タイル(淡色地図)をカメラ周辺に動的ロードし、
 * 標高タイルで起伏を付けた歪み四角形メッシュとして配置する。
 * LRU キャッシュでタイル数を制限する。
 */
import * as THREE from "three";
import { CONFIG } from "../config.js";
import { LocalFrame, lonLatToTileF, tileToLonLat } from "../lib/proj.js";
import type { Terrain } from "../lib/terrain.js";

interface TileEntry {
  mesh: THREE.Mesh;
  lastUsed: number;
}

export interface GroundLayer {
  group: THREE.Group;
  update(cameraPos: THREE.Vector3): void;
  setOpacity(v: number): void;
}

export function createGround(frame: LocalFrame, terrain: Terrain): GroundLayer {
  const group = new THREE.Group();
  const tiles = new Map<string, TileEntry>();
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin("anonymous");
  let opacity: number = CONFIG.ground.opacityInitial;
  let lastUpdate = 0;
  let tick = 0;

  function makeTile(tx: number, ty: number): THREE.Mesh {
    const z = CONFIG.ground.zoom;
    const seg = CONFIG.ground.segments;
    // タイルの (seg+1)×(seg+1) 格子点を投影し、標高で変位させる
    const geom = new THREE.BufferGeometry();
    const verts = new Float32Array((seg + 1) * (seg + 1) * 3);
    const uvs = new Float32Array((seg + 1) * (seg + 1) * 2);
    const lonlats: { lon: number; lat: number }[] = [];
    for (let j = 0; j <= seg; j++) {
      for (let i = 0; i <= seg; i++) {
        const ll = tileToLonLat(tx + i / seg, ty + j / seg, z);
        lonlats.push(ll);
        const p = frame.toLocal(ll);
        const k = (j * (seg + 1) + i) * 3;
        verts[k] = p.x;
        verts[k + 1] = 0;
        verts[k + 2] = p.z;
        const ku = (j * (seg + 1) + i) * 2;
        uvs[ku] = i / seg;
        uvs[ku + 1] = 1 - j / seg;
      }
    }
    const indices: number[] = [];
    for (let j = 0; j < seg; j++) {
      for (let i = 0; i < seg; i++) {
        const a = j * (seg + 1) + i;
        const b = a + 1;
        const c = a + (seg + 1);
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    geom.setAttribute("position", new THREE.BufferAttribute(verts, 3));
    geom.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geom.setIndex(indices);

    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide, // 地下から見上げても見えるように
      color: 0x222222, // テクスチャ到着までのプレースホルダ
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.renderOrder = 5;

    loader.load(CONFIG.ground.tileUrl(z, tx, ty), (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.anisotropy = 4;
      mat.map = tex;
      mat.color.set(0xffffff);
      mat.needsUpdate = true;
    });

    // 標高の反映は非同期(DEM タイル取得後のフレームで再試行)
    const applyElevation = () => {
      let pending = false;
      for (let v = 0; v < lonlats.length; v++) {
        const e = terrain.elevationAt(lonlats[v]!);
        if (e === null) {
          pending = true;
          continue;
        }
        verts[v * 3 + 1] = e;
      }
      geom.attributes.position!.needsUpdate = true;
      if (pending) setTimeout(applyElevation, 700);
    };
    applyElevation();

    return mesh;
  }

  return {
    group,
    update(cameraPos) {
      const now = performance.now();
      if (now - lastUpdate < CONFIG.ground.updateIntervalMs) return;
      lastUpdate = now;
      tick++;

      const ll = frame.toLonLat(cameraPos.x, cameraPos.z);
      const c = lonLatToTileF(ll, CONFIG.ground.zoom);
      const cx = Math.floor(c.x);
      const cy = Math.floor(c.y);
      const r = CONFIG.ground.radius;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const key = `${cx + dx}/${cy + dy}`;
          const entry = tiles.get(key);
          if (entry) {
            entry.lastUsed = tick;
          } else {
            const mesh = makeTile(cx + dx, cy + dy);
            group.add(mesh);
            tiles.set(key, { mesh, lastUsed: tick });
          }
        }
      }
      // LRU 退避
      if (tiles.size > CONFIG.ground.cacheLimit) {
        const entries = [...tiles.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
        for (const [key, entry] of entries.slice(0, tiles.size - CONFIG.ground.cacheLimit)) {
          group.remove(entry.mesh);
          entry.mesh.geometry.dispose();
          const m = entry.mesh.material as THREE.MeshBasicMaterial;
          m.map?.dispose();
          m.dispose();
          tiles.delete(key);
        }
      }
    },
    setOpacity(v) {
      opacity = v;
      for (const { mesh } of tiles.values()) {
        (mesh.material as THREE.MeshBasicMaterial).opacity = v;
      }
    },
  };
}
