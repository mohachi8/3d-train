/**
 * 実地形の起伏を持つ半透明の地表面。
 *
 * - 地理院タイル(淡色地図)に陰影起伏図を乗算合成し、谷・台地が見えるようにする
 * - 標高タイルで (segments+1)^2 格子を頂点変位(z15タイルを24分割 ≒ 50m 間隔)
 * - カメラ周辺を動的ロードし LRU で上限管理
 *
 * 渋谷の谷(銀座線が地上3階に出る理由)や上野の台地端などが立体として見える。
 */
import * as THREE from "three";
import { CONFIG } from "../config.js";
import { LocalFrame, lonLatToTileF, tileToLonLat, type LonLat } from "../lib/proj.js";
import type { Terrain } from "../lib/terrain.js";

interface TileRec {
  mesh: THREE.Mesh;
  lastUsed: number;
  /** 標高未取得の頂点が残っているか */
  pending: boolean;
  verts: Float32Array;
  lonlats: LonLat[];
  geom: THREE.BufferGeometry;
}

export interface GroundLayer {
  group: THREE.Group;
  update(cameraPos: THREE.Vector3): void;
  setOpacity(v: number): void;
}

export function createGround(frame: LocalFrame, terrain: Terrain): GroundLayer {
  const group = new THREE.Group();
  const tiles = new Map<string, TileRec>();
  let opacity: number = CONFIG.ground.opacityInitial;
  let lastUpdate = 0;
  let tick = 0;

  // 標高タイルが届いたら、未完了タイルの変位をやり直す(デバウンス付き)
  let reapplyScheduled = false;
  terrain.onTileLoaded = () => {
    if (reapplyScheduled) return;
    reapplyScheduled = true;
    setTimeout(() => {
      reapplyScheduled = false;
      for (const rec of tiles.values()) {
        if (rec.pending) applyElevation(rec);
      }
    }, 250);
  };

  function applyElevation(rec: TileRec): void {
    let pending = false;
    for (let v = 0; v < rec.lonlats.length; v++) {
      const e = terrain.elevationAt(rec.lonlats[v]!);
      if (e === null) {
        pending = true;
        continue;
      }
      rec.verts[v * 3 + 1] = e;
    }
    rec.pending = pending;
    rec.geom.attributes.position!.needsUpdate = true;
    rec.geom.computeBoundingSphere();
  }

  /** 淡色地図 × 陰影起伏図 を canvas で乗算合成したテクスチャを作る */
  async function loadComposite(tx: number, ty: number, mat: THREE.MeshBasicMaterial) {
    const z = CONFIG.ground.zoom;
    const fetchBmp = async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return createImageBitmap(await res.blob());
    };
    let base: ImageBitmap;
    try {
      base = await fetchBmp(CONFIG.ground.tileUrl(z, tx, ty));
    } catch {
      return; // 地図タイル不達(オフライン等)。プレースホルダ色のまま
    }
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(base, 0, 0, 256, 256);
    try {
      const shade = await fetchBmp(CONFIG.ground.hillshadeUrl(z, tx, ty));
      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha = 0.75;
      ctx.drawImage(shade, 0, 0, 256, 256);
    } catch {
      // 陰影が無くても淡色地図だけで続行
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    mat.map = tex;
    mat.color.set(0xffffff);
    mat.needsUpdate = true;
  }

  function makeTile(tx: number, ty: number): TileRec {
    const z = CONFIG.ground.zoom;
    const seg = CONFIG.ground.segments;
    const geom = new THREE.BufferGeometry();
    const verts = new Float32Array((seg + 1) * (seg + 1) * 3);
    const uvs = new Float32Array((seg + 1) * (seg + 1) * 2);
    const lonlats: LonLat[] = [];
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
      color: 0x1c2433, // テクスチャ到着までのプレースホルダ
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.renderOrder = 5;
    void loadComposite(tx, ty, mat);

    const rec: TileRec = { mesh, lastUsed: 0, pending: true, verts, lonlats, geom };
    applyElevation(rec);
    return rec;
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
            const rec = makeTile(cx + dx, cy + dy);
            rec.lastUsed = tick;
            group.add(rec.mesh);
            tiles.set(key, rec);
          }
        }
      }
      // LRU 退避
      if (tiles.size > CONFIG.ground.cacheLimit) {
        const entries = [...tiles.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
        for (const [key, rec] of entries.slice(0, tiles.size - CONFIG.ground.cacheLimit)) {
          group.remove(rec.mesh);
          rec.geom.dispose();
          const m = rec.mesh.material as THREE.MeshBasicMaterial;
          m.map?.dispose();
          m.dispose();
          tiles.delete(key);
        }
      }
    },
    setOpacity(v) {
      opacity = v;
      for (const rec of tiles.values()) {
        (rec.mesh.material as THREE.MeshBasicMaterial).opacity = v;
      }
    },
  };
}
