/**
 * 駅名ラベル。Canvas で描いたスプライト(日本語はフォント依存なく確実に出る)。
 * 距離に応じて表示/非表示と一定の見かけサイズを保つスケーリングを行う。
 * 推定深度(estimated)の駅は「※」を付けて区別する。
 */
import * as THREE from "three";
import type { StationBox } from "../loader/artifacts.js";
import { CONFIG } from "../config.js";

interface Label {
  sprite: THREE.Sprite;
  pos: THREE.Vector3;
  lineId: string;
  aspect: number;
}

export interface LabelLayer {
  group: THREE.Group;
  update(cameraPos: THREE.Vector3): void;
  setVisible(lineId: string, visible: boolean): void;
  setEnabled(on: boolean): void;
}

export function createLabels(
  boxes: StationBox[],
  lineColors: Map<string, string>
): LabelLayer {
  const group = new THREE.Group();
  const labels: Label[] = [];
  const hiddenLines = new Set<string>();
  let enabled = true;

  // 駅×路線で1ラベル(複数ホームは深い方を代表値に)
  const byKey = new Map<string, StationBox>();
  for (const b of boxes) {
    const key = `${b.line_id}/${b.station_id}`;
    const prev = byKey.get(key);
    if (!prev || (b.depth_m ?? -99) > (prev.depth_m ?? -99)) byKey.set(key, b);
  }

  for (const b of byKey.values()) {
    const depth =
      b.depth_m === null
        ? ""
        : b.depth_m >= 0
          ? ` −${b.depth_m.toFixed(1)}m`
          : ` +${(-b.depth_m).toFixed(1)}m`;
    const mark = b.confidence === "estimated" ? "※" : "";
    const text = `${b.name}${depth}${mark}`;
    const { texture, aspect } = makeTexture(text, lineColors.get(b.line_id) ?? "#888");
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true })
    );
    sprite.renderOrder = 10;
    const pos = new THREE.Vector3(b.center[0], b.center[1] + b.size[1] * 2 + 6, b.center[2]);
    sprite.position.copy(pos);
    sprite.visible = false;
    group.add(sprite);
    labels.push({ sprite, pos, lineId: b.line_id, aspect });
  }

  return {
    group,
    update(cameraPos) {
      for (const l of labels) {
        if (!enabled || hiddenLines.has(l.lineId)) {
          l.sprite.visible = false;
          continue;
        }
        const d = cameraPos.distanceTo(l.pos);
        l.sprite.visible = d < CONFIG.labels.visibleDistance;
        if (l.sprite.visible) {
          const h = Math.max(8, d * CONFIG.labels.scalePerMeter);
          l.sprite.scale.set(h * l.aspect, h, 1);
          // 近距離でフェードせずスッと消えるより自然な減衰
          const fade = 1 - Math.max(0, (d - CONFIG.labels.visibleDistance * 0.75) / (CONFIG.labels.visibleDistance * 0.25));
          (l.sprite.material as THREE.SpriteMaterial).opacity = Math.min(1, fade);
        }
      }
    },
    setVisible(lineId, visible) {
      if (visible) hiddenLines.delete(lineId);
      else hiddenLines.add(lineId);
    },
    setEnabled(on) {
      enabled = on;
    },
  };
}

function makeTexture(text: string, color: string): { texture: THREE.Texture; aspect: number } {
  const font = '28px "Hiragino Sans", "Noto Sans JP", sans-serif';
  const pad = 14;
  const bar = 8;
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = font;
  const tw = Math.ceil(measure.measureText(text).width);
  const w = tw + pad * 2 + bar + 6;
  const h = 48;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(8, 12, 20, 0.78)";
  roundRect(ctx, 0, 0, w, h, 9);
  ctx.fill();
  ctx.fillStyle = color;
  roundRect(ctx, 5, 6, bar, h - 12, 3);
  ctx.fill();
  ctx.font = font;
  ctx.fillStyle = "#f0f4fa";
  ctx.textBaseline = "middle";
  ctx.fillText(text, bar + 6 + pad - 4, h / 2 + 1);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { texture, aspect: w / h };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
