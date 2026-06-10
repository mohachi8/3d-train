/**
 * エントリポイント: データロード → シーン構築 → メインループ。
 */
import * as THREE from "three";
import { CONFIG } from "./config.js";
import { loadData } from "./loader/artifacts.js";
import { LocalFrame } from "./lib/proj.js";
import { Terrain } from "./lib/terrain.js";
import { setupEnv } from "./scene/env.js";
import { createTunnels } from "./layers/tunnels.js";
import { createStations, registerLineColors } from "./layers/stations.js";
import { createLabels } from "./layers/labels.js";
import { createGround } from "./layers/ground.js";
import { FlyControls } from "./camera/fly-controls.js";
import { restoreFromHash, startHashSync } from "./camera/camera-state.js";
import { startHud } from "./ui/hud.js";
import { buildPanel } from "./ui/panel.js";
import { buildAttribution } from "./ui/attribution.js";

async function main(): Promise<void> {
  const data = await loadData();
  const [anchorLon, anchorLat] = data.index.anchor.lonlat;
  const frame = new LocalFrame({ lon: anchorLon, lat: anchorLat });
  const terrain = new Terrain();

  // --- レンダラ・シーン ---
  const container = document.getElementById("app")!;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const env = setupEnv(scene);
  const camera = new THREE.PerspectiveCamera(
    CONFIG.camera.fov,
    window.innerWidth / window.innerHeight,
    CONFIG.camera.near,
    CONFIG.camera.far
  );

  // --- レイヤ ---
  registerLineColors(data.index.lines);
  const lineColors = new Map(data.index.lines.map((l) => [l.id, l.color]));
  const tunnels = createTunnels(data.lines);
  const stations = createStations(data.boxes);
  const labels = createLabels(data.boxes, lineColors);
  const ground = createGround(frame, terrain);
  scene.add(tunnels.group, stations.group, labels.group, ground.group);

  // --- カメラ操作 ---
  const controls = new FlyControls(camera, renderer.domElement, CONFIG.camera.initial);
  restoreFromHash(controls);
  startHashSync(controls);

  // --- UI ---
  buildPanel(
    data,
    {
      onLineVisible: (id, v) => {
        tunnels.setVisible(id, v);
        stations.setVisible(id, v);
        labels.setVisible(id, v);
      },
      onGroundOpacity: (v) => ground.setOpacity(v),
      onGridVisible: (v) => (env.grid.visible = v),
      onLabelsVisible: (v) => labels.setEnabled(v),
      onJump: (box) => {
        // ホームを少し離れた斜め上(地中)から見る位置へテレポート
        const dx = Math.cos(box.heading);
        const dz = Math.sin(box.heading);
        // 進行方向に対し横へ離れる
        const offX = -dz * 90;
        const offZ = dx * 90;
        const x = box.center[0] + offX;
        const y = box.center[1] + 35;
        const z = box.center[2] + offZ;
        const yaw = Math.atan2(-(box.center[0] - x), -(box.center[2] - z));
        const dist = Math.hypot(90, 35);
        const pitch = Math.atan2(-35, dist);
        controls.teleport(x, y, z, yaw, pitch);
      },
    },
    CONFIG.ground.opacityInitial
  );
  buildAttribution();
  startHud(controls, frame, terrain);

  document.getElementById("loading")!.classList.add("hidden");
  const overlay = document.getElementById("overlay")!;
  overlay.classList.remove("hidden");
  overlay.addEventListener("click", () => {
    overlay.classList.add("hidden");
    renderer.domElement.requestPointerLock();
  });
  document.addEventListener("pointerlockchange", () => {
    if (!document.pointerLockElement) overlay.classList.remove("hidden");
  });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // --- メインループ ---
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    controls.update(dt);
    ground.update(camera.position);
    labels.update(camera.position);
    renderer.render(scene, camera);
  });
}

main().catch((e: unknown) => {
  const el = document.getElementById("loading")!;
  el.classList.remove("hidden");
  el.textContent = `エラー: ${e instanceof Error ? e.message : String(e)}`;
});
