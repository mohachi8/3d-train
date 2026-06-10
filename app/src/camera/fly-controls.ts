/**
 * スペクテイターモード風フライカメラ。
 * PointerLock + WASD(水平) + Space/Shift(昇降)、ホイールで速度、慣性付き。
 */
import * as THREE from "three";
import { CONFIG } from "../config.js";

export class FlyControls {
  yaw: number;
  pitch: number;
  speed: number = CONFIG.controls.speedInitial;

  private velocity = new THREE.Vector3();
  private keys = new Set<string>();
  private locked = false;
  private skipNextMouse = false;

  constructor(
    public camera: THREE.PerspectiveCamera,
    private dom: HTMLElement,
    initial: { x: number; y: number; z: number; yaw: number; pitch: number }
  ) {
    camera.position.set(initial.x, initial.y, initial.z);
    this.yaw = initial.yaw;
    this.pitch = initial.pitch;
    this.applyRotation();

    dom.addEventListener("click", () => {
      if (!this.locked) dom.requestPointerLock();
    });
    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === dom;
      this.skipNextMouse = true; // ロック取得直後の巨大なデルタでカメラが飛ぶのを防ぐ
      if (!this.locked) this.keys.clear();
    });
    document.addEventListener("mousemove", (e) => {
      if (!this.locked) return;
      if (this.skipNextMouse || Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) {
        this.skipNextMouse = false;
        return;
      }
      this.yaw -= e.movementX * CONFIG.controls.mouseSensitivity;
      this.pitch -= e.movementY * CONFIG.controls.mouseSensitivity;
      this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
      this.applyRotation();
    });
    document.addEventListener("keydown", (e) => {
      if (this.locked) this.keys.add(e.code);
    });
    document.addEventListener("keyup", (e) => this.keys.delete(e.code));
    dom.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const factor = Math.exp(-e.deltaY * 0.0012);
        this.speed = Math.max(
          CONFIG.controls.speedMin,
          Math.min(CONFIG.controls.speedMax, this.speed * factor)
        );
      },
      { passive: false }
    );
  }

  get isLocked(): boolean {
    return this.locked;
  }

  private applyRotation(): void {
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, "YXZ"));
  }

  /** 外部から位置・向きを設定(駅ジャンプ・URL復元) */
  teleport(x: number, y: number, z: number, yaw: number, pitch: number): void {
    this.camera.position.set(x, y, z);
    this.yaw = yaw;
    this.pitch = pitch;
    this.velocity.set(0, 0, 0);
    this.applyRotation();
  }

  update(dt: number): void {
    const target = new THREE.Vector3();
    if (this.locked) {
      const f = new THREE.Vector3();
      // 水平移動はヨー方向のみ(ピッチに依存しない=スペクテイター流)
      const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const right = new THREE.Vector3(-forward.z, 0, forward.x);
      if (this.keys.has("KeyW")) f.add(forward);
      if (this.keys.has("KeyS")) f.sub(forward);
      if (this.keys.has("KeyD")) f.add(right);
      if (this.keys.has("KeyA")) f.sub(right);
      if (this.keys.has("Space")) f.y += 1;
      if (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight")) f.y -= 1;
      if (f.lengthSq() > 0) target.copy(f.normalize().multiplyScalar(this.speed));
    }
    // 慣性(指数減衰でターゲット速度へ)
    const k = 1 - Math.exp(-CONFIG.controls.damping * dt);
    this.velocity.lerp(target, k);
    this.camera.position.addScaledVector(this.velocity, dt);
  }
}
