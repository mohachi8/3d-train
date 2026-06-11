/**
 * 操作パネル: 路線フィルタ・地表透過度・基準グリッド・ラベル・駅ジャンプ。
 */
import type { LoadedData, StationBox } from "../loader/artifacts.js";

export interface PanelCallbacks {
  onLineVisible(lineId: string, visible: boolean): void;
  onGroundOpacity(v: number): void;
  onExaggeration(k: number): void;
  onGridVisible(v: boolean): void;
  onLabelsVisible(v: boolean): void;
  onJump(box: StationBox): void;
}

export function buildPanel(
  data: LoadedData,
  cb: PanelCallbacks,
  groundOpacity: number,
  exaggeration: { initial: number; min: number; max: number }
): void {
  const el = document.getElementById("panel")!;
  el.innerHTML = "";

  // --- 路線フィルタ ---
  el.appendChild(h2("路線"));
  for (const line of data.index.lines) {
    const label = document.createElement("label");
    label.className = "row";
    const cbx = document.createElement("input");
    cbx.type = "checkbox";
    cbx.checked = true;
    cbx.addEventListener("change", () => cb.onLineVisible(line.id, cbx.checked));
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.style.background = line.color;
    label.append(cbx, chip, document.createTextNode(line.name));
    el.appendChild(label);
  }

  // --- 表示設定 ---
  el.appendChild(h2("地表の透過度"));
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "100";
  slider.value = String(Math.round(groundOpacity * 100));
  slider.addEventListener("input", () => cb.onGroundOpacity(Number(slider.value) / 100));
  el.appendChild(slider);

  // --- 高さ強調(地形と深さの関係を見やすくする。HUDは常に実寸) ---
  const exagLabel = h2(`高さ強調 ${exaggeration.initial.toFixed(2).replace(/\.?0+$/, "")}×`);
  el.appendChild(exagLabel);
  const exag = document.createElement("input");
  exag.type = "range";
  exag.min = String(exaggeration.min * 100);
  exag.max = String(exaggeration.max * 100);
  exag.step = "25";
  exag.value = String(Math.round(exaggeration.initial * 100));
  exag.addEventListener("input", () => {
    const k = Number(exag.value) / 100;
    exagLabel.textContent = `高さ強調 ${k.toFixed(2).replace(/\.?0+$/, "")}×`;
    cb.onExaggeration(k);
  });
  el.appendChild(exag);
  const exagNote = document.createElement("div");
  exagNote.className = "note";
  exagNote.textContent = "地形・トンネル・駅を一体で縦に拡大します(1×=実寸)。渋谷の谷や台地と深さの関係が見やすくなります。";
  el.appendChild(exagNote);

  el.appendChild(h2("表示"));
  el.appendChild(
    check("海抜0m 基準グリッド", false, (v) => cb.onGridVisible(v))
  );
  el.appendChild(check("駅名ラベル", true, (v) => cb.onLabelsVisible(v)));

  // --- 駅ジャンプ ---
  el.appendChild(h2("駅へ移動"));
  const select = document.createElement("select");
  const placeholder = document.createElement("option");
  placeholder.textContent = "駅を選択…";
  placeholder.value = "";
  select.appendChild(placeholder);

  const lineName = new Map(data.index.lines.map((l) => [l.id, l.name]));
  const seen = new Map<string, StationBox>();
  for (const b of data.boxes) {
    const key = `${b.line_id}/${b.station_id}`;
    const prev = seen.get(key);
    if (!prev || (b.depth_m ?? -99) > (prev.depth_m ?? -99)) seen.set(key, b);
  }
  const sorted = [...seen.values()].sort((a, b) =>
    a.line_id === b.line_id
      ? a.name.localeCompare(b.name, "ja")
      : a.line_id.localeCompare(b.line_id)
  );
  for (const b of sorted) {
    const opt = document.createElement("option");
    const depth = b.depth_m === null ? "" : ` (−${b.depth_m.toFixed(1)}m)`;
    opt.textContent = `${lineName.get(b.line_id) ?? b.line_id} ${b.name}${depth}`;
    opt.value = `${b.line_id}/${b.station_id}/${b.platform_id}`;
    select.appendChild(opt);
  }
  select.addEventListener("change", () => {
    const box = data.boxes.find(
      (b) => `${b.line_id}/${b.station_id}/${b.platform_id}` === select.value
    );
    if (box) cb.onJump(box);
    select.value = "";
  });
  el.appendChild(select);

  const note = document.createElement("div");
  note.className = "note";
  note.textContent =
    "※付きの深さは推定値です(出典付きの編纂・公表値は無印)。トンネルの駅間縦断は駅深度からの補間による近似です。";
  el.appendChild(note);
}

function h2(text: string): HTMLElement {
  const e = document.createElement("h2");
  e.textContent = text;
  return e;
}

function check(text: string, initial: boolean, onChange: (v: boolean) => void): HTMLElement {
  const label = document.createElement("label");
  label.className = "row";
  const cbx = document.createElement("input");
  cbx.type = "checkbox";
  cbx.checked = initial;
  cbx.addEventListener("change", () => onChange(cbx.checked));
  label.append(cbx, document.createTextNode(text));
  return label;
}
