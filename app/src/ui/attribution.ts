/**
 * 出典表記。地理院タイル・国土数値情報等の利用規約上、必須の表示。
 */
export function buildAttribution(): void {
  const el = document.getElementById("attribution")!;
  el.innerHTML = [
    `<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>`,
    `<a href="https://nlftp.mlit.go.jp/ksj/" target="_blank" rel="noopener">国土数値情報(鉄道)</a>`,
    `<a href="https://github.com/nagix/mini-tokyo-3d" target="_blank" rel="noopener">mini-tokyo-3d</a>`,
    `<a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">AWS Terrain Tiles</a>`,
  ].join(" | ");
}
