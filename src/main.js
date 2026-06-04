import * as THREE from "three";

const canvas = document.querySelector("#scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.28;
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07111a);
scene.fog = new THREE.FogExp2(0x07111a, 0.00145);

const camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.1, 3200);
camera.position.set(0, 240, 560);

const clock = new THREE.Clock();
const world = new THREE.Group();
scene.add(world);

const surfaceGroup = new THREE.Group();
const stationGroup = new THREE.Group();
const facilityGroup = new THREE.Group();
const depthGroup = new THREE.Group();
const labelGroup = new THREE.Group();
const lineGroups = new Map();
world.add(surfaceGroup, stationGroup, facilityGroup, depthGroup, labelGroup);

const lines = [
  { id: "ginza", name: "銀座線", color: 0xf39700, defaultDepth: -13, stations: ["Shibuya", "Omotesando", "Aoyama", "Akasaka", "Ginza", "Nihombashi", "Ueno"] },
  { id: "marunouchi", name: "丸ノ内線", color: 0xe60012, defaultDepth: -18, stations: ["Shinjuku", "Yotsuya", "Akasaka", "Ginza", "Tokyo", "Otemachi", "Korakuen", "Ikebukuro"] },
  { id: "hibiya", name: "日比谷線", color: 0xb5b5ac, defaultDepth: -25, stations: ["Ebisu", "Roppongi", "Kamiyacho", "Kasumigaseki", "Ginza", "Akihabara", "Ueno"] },
  { id: "tozai", name: "東西線", color: 0x00a7db, defaultDepth: -22, stations: ["Nakano", "Takadanobaba", "Iidabashi", "Otemachi", "Nihombashi", "Kayabacho"] },
  { id: "chiyoda", name: "千代田線", color: 0x00a650, defaultDepth: -30, stations: ["Yoyogi", "MeijiJingumae", "Omotesando", "Akasaka", "Kasumigaseki", "Otemachi", "Nezu"] },
  { id: "yurakucho", name: "有楽町線", color: 0xc7a46b, defaultDepth: -28, stations: ["Ikebukuro", "Iidabashi", "Nagatacho", "Yurakucho", "Tsukishima"] },
  { id: "hanzomon", name: "半蔵門線", color: 0x8f76d6, defaultDepth: -34, stations: ["Shibuya", "Omotesando", "Aoyama", "Nagatacho", "Otemachi"] },
  { id: "namboku", name: "南北線", color: 0x00ada9, defaultDepth: -38, stations: ["Komagome", "Korakuen", "Iidabashi", "Yotsuya", "Nagatacho", "AzabuJuban", "Meguro"] },
  { id: "fukutoshin", name: "副都心線", color: 0x9c5e31, defaultDepth: -42, stations: ["Ikebukuro", "Takadanobaba", "ShinjukuSanchome", "MeijiJingumae", "Shibuya"] },
  { id: "asakusa", name: "都営浅草線", color: 0xe85298, defaultDepth: -20, stations: ["Asakusa", "Nihombashi", "HigashiGinza", "Daimon", "Gotanda"] },
  { id: "mita", name: "都営三田線", color: 0x0079c2, defaultDepth: -31, stations: ["Sugamo", "Kasuga", "Otemachi", "Hibiya", "Mita", "Meguro"] },
  { id: "shinjuku", name: "都営新宿線", color: 0x6cbb5a, defaultDepth: -36, stations: ["Shinjuku", "ShinjukuSanchome", "Iwamotocho", "Jimbocho", "Kudanshita"] },
  { id: "oedo", name: "都営大江戸線", color: 0xb6007a, defaultDepth: -48, stations: ["Shinjuku", "Roppongi", "AzabuJuban", "Tsukiji", "Ueno", "Iidabashi", "ShinjukuNishiguchi"] },
];

const stations = {
  Shinjuku: { label: "新宿", x: -265, z: 25, scale: 1.35 },
  ShinjukuNishiguchi: { label: "新宿西口", x: -242, z: -5, scale: 0.9 },
  ShinjukuSanchome: { label: "新宿三丁目", x: -220, z: 42, scale: 1 },
  Yoyogi: { label: "代々木上原方面", x: -255, z: 90, scale: 0.85 },
  Takadanobaba: { label: "高田馬場", x: -210, z: -104, scale: 0.95 },
  Nakano: { label: "中野方面", x: -310, z: -56, scale: 0.85 },
  Ikebukuro: { label: "池袋", x: -120, z: -230, scale: 1.2 },
  Sugamo: { label: "巣鴨", x: -34, z: -252, scale: 0.92 },
  Komagome: { label: "駒込", x: 24, z: -248, scale: 0.92 },
  Nezu: { label: "根津", x: 102, z: -170, scale: 0.9 },
  Ueno: { label: "上野", x: 132, z: -126, scale: 1.15 },
  Asakusa: { label: "浅草", x: 205, z: -104, scale: 0.9 },
  Korakuen: { label: "後楽園", x: -20, z: -118, scale: 1 },
  Kasuga: { label: "春日", x: -6, z: -96, scale: 0.9 },
  Iidabashi: { label: "飯田橋", x: -62, z: -70, scale: 1.08 },
  Kudanshita: { label: "九段下", x: -42, z: -24, scale: 0.96 },
  Jimbocho: { label: "神保町", x: -6, z: -38, scale: 0.94 },
  Iwamotocho: { label: "岩本町", x: 74, z: -42, scale: 0.9 },
  Akihabara: { label: "秋葉原", x: 92, z: -60, scale: 0.98 },
  Otemachi: { label: "大手町", x: 18, z: 0, scale: 1.45 },
  Tokyo: { label: "東京", x: 62, z: 26, scale: 1.2 },
  Nihombashi: { label: "日本橋", x: 92, z: 2, scale: 1 },
  Kayabacho: { label: "茅場町", x: 126, z: 34, scale: 0.92 },
  Ginza: { label: "銀座", x: 80, z: 80, scale: 1.18 },
  HigashiGinza: { label: "東銀座", x: 104, z: 92, scale: 0.9 },
  Yurakucho: { label: "有楽町", x: 54, z: 66, scale: 0.94 },
  Hibiya: { label: "日比谷", x: 36, z: 72, scale: 1 },
  Kasumigaseki: { label: "霞ケ関", x: 4, z: 84, scale: 0.94 },
  Nagatacho: { label: "永田町", x: -58, z: 70, scale: 1.08 },
  Yotsuya: { label: "四ツ谷", x: -118, z: 34, scale: 0.96 },
  Akasaka: { label: "赤坂見附", x: -72, z: 96, scale: 1 },
  Aoyama: { label: "青山一丁目", x: -132, z: 116, scale: 0.96 },
  Omotesando: { label: "表参道", x: -172, z: 142, scale: 1 },
  MeijiJingumae: { label: "明治神宮前", x: -204, z: 160, scale: 0.95 },
  Shibuya: { label: "渋谷", x: -222, z: 214, scale: 1.22 },
  Ebisu: { label: "恵比寿", x: -126, z: 242, scale: 0.96 },
  Roppongi: { label: "六本木", x: -60, z: 154, scale: 1.08 },
  Kamiyacho: { label: "神谷町", x: 4, z: 128, scale: 0.94 },
  AzabuJuban: { label: "麻布十番", x: -28, z: 198, scale: 0.95 },
  Daimon: { label: "大門", x: 72, z: 174, scale: 0.94 },
  Mita: { label: "三田", x: 34, z: 230, scale: 0.94 },
  Meguro: { label: "目黒", x: -76, z: 292, scale: 1 },
  Gotanda: { label: "五反田", x: 20, z: 302, scale: 0.94 },
  Tsukiji: { label: "築地市場", x: 122, z: 122, scale: 0.94 },
  Tsukishima: { label: "月島", x: 156, z: 138, scale: 0.94 },
};

for (const station of Object.values(stations)) {
  station.depths = [];
}
for (const line of lines) {
  line.stations.forEach((stationId, index) => {
    const station = stations[stationId];
    const localOffset = Math.sin(index * 1.7 + line.defaultDepth) * 2.8;
    station.depths.push(line.defaultDepth + localOffset);
  });
}
for (const station of Object.values(stations)) {
  station.depths = [...new Set(station.depths.map((depth) => Math.round(depth)))].sort((a, b) => b - a);
}

const keyState = new Set();
const pointer = { yaw: 0, pitch: -0.62, locked: false };
const player = {
  velocity: new THREE.Vector3(),
  direction: new THREE.Vector3(),
  speed: 38,
};

const stationMaterials = {
  shell: new THREE.MeshStandardMaterial({
    color: 0x6d7f8e,
    transparent: true,
    opacity: 0.44,
    roughness: 0.78,
    metalness: 0.05,
  }),
  platform: new THREE.MeshStandardMaterial({ color: 0xd8e0e6, roughness: 0.6 }),
  glass: new THREE.MeshStandardMaterial({
    color: 0x8ed8ff,
    transparent: true,
    opacity: 0.26,
    roughness: 0.25,
  }),
  shaft: new THREE.MeshStandardMaterial({ color: 0x95a3ad, roughness: 0.8 }),
};

initLights();
buildSurface();
buildDepthReference();
buildStations();
buildLines();
buildFacilities();
buildInterface();
setCameraLook();
animate();

function initLights() {
  scene.add(new THREE.HemisphereLight(0xc8f3ff, 0x21313f, 2.35));
  scene.add(new THREE.AmbientLight(0x9fb8ca, 0.82));

  const key = new THREE.DirectionalLight(0xf6fbff, 3.4);
  key.position.set(-220, 260, 160);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  scene.add(key);

  const fillLights = [
    [0x8ee6ff, -260, 90, -260, 680],
    [0xfff1bf, 260, 80, -220, 520],
    [0xa8ffe8, -240, 70, 260, 540],
    [0xffffff, 250, 120, 270, 600],
    [0x68f7ff, 20, -16, 18, 420],
  ];
  for (const [color, x, y, z, intensity] of fillLights) {
    const fill = new THREE.PointLight(color, intensity, 760, 1.45);
    fill.position.set(x, y, z);
    scene.add(fill);
  }
}

function buildSurface() {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(720, 700, 28, 28),
    new THREE.MeshStandardMaterial({
      color: 0x16222c,
      transparent: true,
      opacity: 0.46,
      side: THREE.DoubleSide,
      roughness: 0.9,
    }),
  );
  ground.rotation.x = Math.PI / 2;
  ground.position.y = 0;
  surfaceGroup.add(ground);

  const grid = new THREE.GridHelper(720, 36, 0x324b5d, 0x20313c);
  grid.position.y = 0.08;
  surfaceGroup.add(grid);

  const yamanote = makeYamanoteLoop();
  surfaceGroup.add(yamanote);

  const districts = [
    [-240, 32, 115, 80, "新宿"],
    [-222, 214, 96, 80, "渋谷"],
    [-120, -230, 92, 70, "池袋"],
    [132, -126, 88, 62, "上野"],
    [48, 18, 130, 76, "丸の内"],
    [84, 86, 112, 78, "銀座"],
    [-58, 156, 100, 70, "六本木"],
  ];
  for (const [x, z, w, d, name] of districts) {
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(w, 3, d),
      new THREE.MeshStandardMaterial({ color: 0x2b4b5f, transparent: true, opacity: 0.52 }),
    );
    block.position.set(x, 1.6, z);
    surfaceGroup.add(block);
    labelGroup.add(makeLabel(name, new THREE.Vector3(x, 12, z), "#d7f9ff", 18));
  }
}

function buildDepthReference() {
  const planeMaterial = new THREE.MeshBasicMaterial({
    color: 0x5eead4,
    transparent: true,
    opacity: 0.055,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  [-10, -20, -30, -40, -50].forEach((depth) => {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(720, 700), planeMaterial.clone());
    plane.rotation.x = Math.PI / 2;
    plane.position.y = depth;
    depthGroup.add(plane);
    labelGroup.add(makeLabel(`${Math.abs(depth)}m`, new THREE.Vector3(342, depth, -332), "#5eead4", 16));
  });
}

function makeYamanoteLoop() {
  const curvePoints = [
    new THREE.Vector3(-265, 2.2, 25),
    new THREE.Vector3(-210, 2.2, -104),
    new THREE.Vector3(-120, 2.2, -230),
    new THREE.Vector3(132, 2.2, -126),
    new THREE.Vector3(92, 2.2, -60),
    new THREE.Vector3(62, 2.2, 26),
    new THREE.Vector3(20, 2.2, 302),
    new THREE.Vector3(-222, 2.2, 214),
    new THREE.Vector3(-265, 2.2, 25),
  ];
  const curve = new THREE.CatmullRomCurve3(curvePoints, true, "catmullrom", 0.25);
  const tube = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 160, 2.4, 12, true),
    new THREE.MeshStandardMaterial({ color: 0x8cc63e, emissive: 0x47751e, emissiveIntensity: 0.65 }),
  );
  labelGroup.add(makeLabel("山手線内エリア", new THREE.Vector3(-250, 18, -150), "#b7ff75", 20));
  return tube;
}

function buildStations() {
  for (const [id, station] of Object.entries(stations)) {
    const stationRoot = new THREE.Group();
    stationRoot.name = `station-${id}`;
    stationGroup.add(stationRoot);

    station.depths.forEach((depth, index) => {
      const width = 32 * station.scale;
      const length = 21 * station.scale;
      const shell = new THREE.Mesh(new THREE.BoxGeometry(width, 6, length), stationMaterials.shell);
      shell.position.set(station.x, depth, station.z);
      shell.castShadow = true;
      shell.receiveShadow = true;
      stationRoot.add(shell);

      const platform = new THREE.Mesh(new THREE.BoxGeometry(width * 0.88, 1.2, 5.5), stationMaterials.platform);
      platform.position.set(station.x, depth + 0.8, station.z);
      stationRoot.add(platform);

      const mezzanine = new THREE.Mesh(new THREE.BoxGeometry(width * 0.62, 2.2, length * 0.72), stationMaterials.glass);
      mezzanine.position.set(station.x, depth + 5.2, station.z);
      stationRoot.add(mezzanine);

      if (index > 0) {
        const upperDepth = station.depths[index - 1];
        const shaft = makeVerticalShaft(station.x + width * 0.32, (depth + upperDepth) / 2, station.z - length * 0.28, Math.abs(depth - upperDepth));
        stationRoot.add(shaft);
      }
    });

    const deepest = Math.min(...station.depths);
    const surfaceShaft = makeVerticalShaft(station.x - 12, deepest / 2, station.z + 12, Math.abs(deepest));
    stationRoot.add(surfaceShaft);

    const stationLight = new THREE.PointLight(0xdff8ff, 72 + station.depths.length * 18, 96, 1.35);
    stationLight.position.set(station.x, deepest + 12, station.z);
    stationRoot.add(stationLight);

    labelGroup.add(makeLabel(station.label, new THREE.Vector3(station.x, deepest - 8, station.z), "#ffffff", 22));
  }
}

function buildLines() {
  for (const line of lines) {
    const group = new THREE.Group();
    group.name = `line-${line.id}`;
    lineGroups.set(line.id, group);
    world.add(group);

    const material = new THREE.MeshStandardMaterial({
      color: line.color,
      emissive: line.color,
      emissiveIntensity: 0.92,
      roughness: 0.38,
      metalness: 0.12,
    });

    const points = line.stations.map((stationId, index) => getLinePoint(line, stationId, index));

    for (let i = 0; i < points.length - 1; i += 1) {
      const start = points[i];
      const end = points[i + 1];
      const mid = start.clone().lerp(end, 0.5);
      mid.y -= 2.4 + Math.abs(start.y - end.y) * 0.12;
      const curve = new THREE.CatmullRomCurve3([start, mid, end]);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 30, 1.55, 12, false), material);
      tube.castShadow = true;
      tube.receiveShadow = true;
      group.add(tube);

      const darkCore = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 30, 0.82, 10, false),
        new THREE.MeshStandardMaterial({ color: 0x090b0f, roughness: 0.85 }),
      );
      group.add(darkCore);
    }

    points.forEach((point, index) => {
      const beacon = new THREE.PointLight(line.color, 42, 54, 1.8);
      beacon.position.copy(point);
      group.add(beacon);

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(3.8, 0.35, 8, 28),
        new THREE.MeshBasicMaterial({ color: line.color }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.copy(point);
      ring.position.y += 4.2;
      group.add(ring);

      if (index === 0 || index === points.length - 1) {
        labelGroup.add(makeLabel(line.name, point.clone().add(new THREE.Vector3(0, -10, 0)), `#${line.color.toString(16).padStart(6, "0")}`, 16));
      }
    });
  }
}

function getLinePoint(line, stationId, index) {
  const station = stations[stationId];
  const localOffset = Math.sin(index * 1.7 + line.defaultDepth) * 2.8;
  return new THREE.Vector3(station.x, line.defaultDepth + localOffset, station.z);
}

function buildFacilities() {
  const ventMaterial = new THREE.MeshStandardMaterial({ color: 0x8aa4b5, roughness: 0.82, metalness: 0.05 });
  const cableMaterial = new THREE.MeshBasicMaterial({ color: 0x5eead4, transparent: true, opacity: 0.62 });

  for (const station of Object.values(stations)) {
    const deep = Math.min(...station.depths);
    const vent = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 4.5, Math.abs(deep), 18), ventMaterial);
    vent.position.set(station.x + 20, deep / 2, station.z - 18);
    facilityGroup.add(vent);

    const spiral = makeSpiral(station.x + 20, station.z - 18, deep, cableMaterial);
    facilityGroup.add(spiral);
  }

  const crossPassages = [
    ["Otemachi", "Tokyo"],
    ["Ginza", "HigashiGinza"],
    ["Akasaka", "Roppongi"],
    ["Shinjuku", "ShinjukuSanchome"],
    ["Iidabashi", "Korakuen"],
    ["Nagatacho", "Akasaka"],
    ["Meguro", "Gotanda"],
  ];
  for (const [a, b] of crossPassages) {
    const s1 = stations[a];
    const s2 = stations[b];
    const y = (Math.min(...s1.depths) + Math.min(...s2.depths)) / 2;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(s1.x, y, s1.z),
      new THREE.Vector3((s1.x + s2.x) / 2, y - 6, (s1.z + s2.z) / 2),
      new THREE.Vector3(s2.x, y, s2.z),
    ]);
    facilityGroup.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(curve, 26, 1.1, 10, false),
        new THREE.MeshStandardMaterial({ color: 0x6b7785, transparent: true, opacity: 0.54 }),
      ),
    );
  }

  buildCrossingColumns();
}

function buildCrossingColumns() {
  const crossings = ["Otemachi", "Ginza", "Iidabashi", "Nagatacho", "Shinjuku", "Roppongi", "Nihombashi", "Ueno"];
  for (const stationId of crossings) {
    const station = stations[stationId];
    const depths = station.depths;
    if (!station || depths.length < 2) continue;
    const deepest = Math.min(...depths);
    const shallowest = Math.max(...depths);
    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.2, Math.abs(deepest - shallowest) + 6, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.34 }),
    );
    column.position.set(station.x, (deepest + shallowest) / 2, station.z);
    facilityGroup.add(column);
  }
}

function makeVerticalShaft(x, y, z, height) {
  const group = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.7, height, 16), stationMaterials.shaft);
  shaft.position.set(x, y, z);
  group.add(shaft);

  const cage = new THREE.Mesh(
    new THREE.CylinderGeometry(3.5, 3.5, height + 0.3, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x8ed8ff, transparent: true, opacity: 0.16, wireframe: true }),
  );
  cage.position.set(x, y, z);
  group.add(cage);
  return group;
}

function makeSpiral(x, z, depth, material) {
  const points = [];
  const turns = 38;
  for (let i = 0; i <= turns; i += 1) {
    const t = i / turns;
    const angle = t * Math.PI * 10;
    points.push(new THREE.Vector3(x + Math.cos(angle) * 5.7, depth * t, z + Math.sin(angle) * 5.7));
  }
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 90, 0.35, 8, false), material);
}

function makeLabel(text, position, color = "#ffffff", size = 20) {
  const labelCanvas = document.createElement("canvas");
  const context = labelCanvas.getContext("2d");
  const pixelRatio = 2;
  labelCanvas.width = 320 * pixelRatio;
  labelCanvas.height = 92 * pixelRatio;
  context.scale(pixelRatio, pixelRatio);
  context.font = `800 ${size}px system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "rgba(4, 8, 12, 0.62)";
  context.fillRect(10, 18, 300, 56);
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.strokeRect(10, 18, 300, 56);
  context.fillStyle = color;
  context.fillText(text, 160, 46);

  const texture = new THREE.CanvasTexture(labelCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  sprite.position.copy(position);
  sprite.scale.set(45, 13, 1);
  return sprite;
}

function buildInterface() {
  document.querySelector("#startButton").addEventListener("click", () => canvas.requestPointerLock());

  document.addEventListener("pointerlockchange", () => {
    pointer.locked = document.pointerLockElement === canvas;
    document.querySelector("#lockNotice").classList.toggle("visible", !pointer.locked);
  });

  document.addEventListener("mousemove", (event) => {
    if (!pointer.locked) return;
    pointer.yaw -= event.movementX * 0.0022;
    pointer.pitch -= event.movementY * 0.0022;
    pointer.pitch = THREE.MathUtils.clamp(pointer.pitch, -Math.PI / 2 + 0.02, Math.PI / 2 - 0.02);
    setCameraLook();
  });

  document.addEventListener("keydown", (event) => keyState.add(event.code));
  document.addEventListener("keyup", (event) => keyState.delete(event.code));

  document.querySelector("#toggleSurface").addEventListener("change", (event) => {
    surfaceGroup.visible = event.target.checked;
  });
  document.querySelector("#toggleLabels").addEventListener("change", (event) => {
    labelGroup.visible = event.target.checked;
  });
  document.querySelector("#toggleFacilities").addEventListener("change", (event) => {
    facilityGroup.visible = event.target.checked;
  });

  const lineToggles = document.querySelector("#lineToggles");
  for (const line of lines) {
    const label = document.createElement("label");
    label.className = "toggle";
    label.innerHTML = `
      <input type="checkbox" checked data-line="${line.id}" />
      <span class="line-swatch" style="color: #${line.color.toString(16).padStart(6, "0")}; background: currentColor"></span>
      <span>${line.name}</span>
    `;
    lineToggles.append(label);
  }
  lineToggles.addEventListener("change", (event) => {
    const lineId = event.target.dataset.line;
    if (!lineId) return;
    lineGroups.get(lineId).visible = event.target.checked;
  });

  document.querySelectorAll("[data-station]").forEach((button) => {
    button.addEventListener("click", () => jumpToStation(button.dataset.station));
  });
}

function setCameraLook() {
  camera.rotation.order = "YXZ";
  camera.rotation.y = pointer.yaw;
  camera.rotation.x = pointer.pitch;
}

function updateMovement(delta) {
  player.direction.set(0, 0, 0);
  if (keyState.has("KeyW")) player.direction.z -= 1;
  if (keyState.has("KeyS")) player.direction.z += 1;
  if (keyState.has("KeyA")) player.direction.x -= 1;
  if (keyState.has("KeyD")) player.direction.x += 1;
  if (keyState.has("KeyE")) player.direction.y += 1;
  if (keyState.has("KeyQ")) player.direction.y -= 1;

  if (player.direction.lengthSq() > 0) {
    player.direction.normalize();
  }

  const sprint = keyState.has("ShiftLeft") || keyState.has("ShiftRight");
  const speed = player.speed * (sprint ? 2.35 : 1);
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const up = new THREE.Vector3(0, 1, 0);

  player.velocity
    .set(0, 0, 0)
    .addScaledVector(forward, player.direction.z * -speed)
    .addScaledVector(right, player.direction.x * speed)
    .addScaledVector(up, player.direction.y * speed);

  camera.position.addScaledVector(player.velocity, delta);
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, -360, 360);
  camera.position.y = THREE.MathUtils.clamp(camera.position.y, -100, 300);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, -360, 620);
}

function updateReadouts() {
  const pos = camera.position;
  document.querySelector("#positionReadout").textContent = `${pos.x.toFixed(0)}, ${pos.y.toFixed(0)}, ${pos.z.toFixed(0)}`;
  document.querySelector("#depthReadout").textContent = pos.y < 0 ? `地下 ${Math.abs(pos.y).toFixed(0)}m` : `地上 ${pos.y.toFixed(0)}m`;

  let nearest = null;
  let nearestDistance = Infinity;
  for (const station of Object.values(stations)) {
    const distance = Math.hypot(pos.x - station.x, pos.z - station.z);
    if (distance < nearestDistance) {
      nearest = station;
      nearestDistance = distance;
    }
  }
  document.querySelector("#nearestReadout").textContent = nearest ? nearest.label : "-";
}

function jumpToStation(stationId) {
  if (stationId === "Overview") {
    camera.position.set(0, 240, 560);
    pointer.yaw = 0;
    pointer.pitch = -0.62;
    setCameraLook();
    return;
  }
  const station = stations[stationId];
  if (!station) return;
  const depth = Math.min(...station.depths) - 8;
  camera.position.set(station.x + 12, depth, station.z + 18);
  pointer.yaw = Math.atan2(station.x - camera.position.x, station.z - camera.position.z);
  pointer.pitch = -0.08;
  setCameraLook();
}

function animate() {
  const delta = Math.min(clock.getDelta(), 0.05);
  updateMovement(delta);
  updateReadouts();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
