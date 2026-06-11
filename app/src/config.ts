/** アプリ全体の定数(マジックナンバーはここに集約する) */
export const CONFIG = {
  scene: {
    background: 0x0b0e14,
    fogDensity: 0.00022,
    gridSize: 40000,
    gridDivisions: 400,
  },
  camera: {
    fov: 60,
    near: 1,
    far: 30000,
    /** 初期位置(ローカル座標 m): 都心上空から南西向きに見下ろす */
    initial: { x: 500, y: 1500, z: 800, yaw: Math.PI * 0.75, pitch: -0.55 },
  },
  controls: {
    speedMin: 4,
    speedMax: 1200,
    speedInitial: 120,
    damping: 8,
    mouseSensitivity: 0.0022,
  },
  ground: {
    /** 地理院 淡色地図タイル */
    tileUrl: (z: number, x: number, y: number) =>
      `https://cyberjapandata.gsi.go.jp/xyz/pale/${z}/${x}/${y}.png`,
    /** 地理院 陰影起伏図(淡色地図に乗算合成して地形を見せる) */
    hillshadeUrl: (z: number, x: number, y: number) =>
      `https://cyberjapandata.gsi.go.jp/xyz/hillshademap/${z}/${x}/${y}.png`,
    zoom: 15,
    /** カメラ周囲に読み込むタイル半径(タイル数) */
    radius: 4,
    cacheLimit: 220,
    opacityInitial: 0.55,
    /** タイル面の起伏グリッド分割数(z15タイル≒1.2kmを24分割 → 約50m間隔) */
    segments: 24,
    updateIntervalMs: 350,
  },
  terrain: {
    /** 地理院 標高タイル(DEM10B 相当)。HUD と地表面の起伏に使用 */
    demUrl: (z: number, x: number, y: number) =>
      `https://cyberjapandata.gsi.go.jp/xyz/dem_png/${z}/${x}/${y}.png`,
    /** フォールバック: AWS Terrain Tiles(地理院に到達できない環境用) */
    demFallbackUrl: (z: number, x: number, y: number) =>
      `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`,
    zoom: 14,
  },
  /** 高さ強調(地形・トンネル・駅を一体でY方向スケール)。HUDは常に実寸を表示 */
  exaggeration: {
    initial: 1.5,
    min: 1.0,
    max: 3.0,
  },
  tunnels: {
    radialSegments: 10,
    opacity: 1.0,
  },
  labels: {
    visibleDistance: 2600,
    /** スプライトの見かけサイズ係数(距離に比例して拡大) */
    scalePerMeter: 0.062,
  },
  hud: { updateIntervalMs: 100 },
  urlState: { updateIntervalMs: 600 },
} as const;
