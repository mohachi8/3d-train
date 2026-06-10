# 東京地下3D

東京の地下空間 — 地下鉄のトンネルと駅 — を、マインクラフトのスペクテイターモードの
ような自由視点カメラで探索できる Web アプリ。

- **位置は実データ**: 路線の平面線形は実際の線路位置(国土数値情報 N02 /
  mini-tokyo-3d 由来)、深さは海抜(T.P.)基準で駅ごとの公表値・編纂値から構築
- **深さの確度を可視化**: 公表値(無印)と推定値(※・半透明)を見た目で区別
- **軽量**: 静的サイト + 数百KBのデータ。一般的なPCの内蔵GPUで動作

## 操作

| 入力 | 動作 |
|---|---|
| クリック | 操作開始(マウスキャプチャ) |
| W / A / S / D | 水平移動 |
| Space / Shift | 上昇 / 下降 |
| マウス | 視点 |
| ホイール | 移動速度(2〜600 m/s) |
| Esc | マウス解放(パネル操作) |

右上パネル: 路線フィルタ / 地表の透過度 / 海抜0m基準グリッド / 駅へジャンプ。
URLハッシュにカメラ位置が入るので、そのまま共有リンクになる。

## 開発

```bash
npm install
npm run dev        # 開発サーバ
npm run check      # 検証+テスト+型+ビルド(CI相当)
```

データの更新方法は [CLAUDE.md](CLAUDE.md)(AI向け運用ガイド)と
[docs/data-update-guide.md](docs/data-update-guide.md)(手順レシピ)を参照。

## アーキテクチャ

```
data/(YAML: 出典付きソース) → pipeline/(決定的変換+zod検証) → app/public/data/(JSON) → app/(Three.js)
```

| 層 | 内容 |
|---|---|
| `data/` | 路線レジストリ・駅深度(出典・確度つき)・交差制約・抽出済み線形 |
| `pipeline/` | 線形結合 → 駅スナップ → DEM標高 → PCHIP縦断補間 → 3D生成 → 検証 |
| `app/` | フライカメラ / トンネル・駅・ラベル / 地理院タイル地表(起伏つき) / HUD |

## 正確さについて(誠実な注記)

- **駅の深さ**: 公表値・編纂資料(六本木 42.3m など)を出典つきで収録。
  未公表の駅は構造情報からの推定(※表示)。全88ホーム中、約6割が推定値(Phase 1 時点)
- **駅間のトンネル縦断**: 縦断線形は非公開のため、駅深度間の単調補間(PCHIP)による近似
- **地表標高**: 現在は SRTM 由来(ビル街で数mの誤差)。地理院DEMへの置換ワークフローあり
- 検証(交差離隔・勾配上限 35‰超の検出・出典必須)で物理的な矛盾を機械チェック

## データ出典

- [国土数値情報 鉄道データ (N02)](https://nlftp.mlit.go.jp/ksj/)(国土交通省)
- [mini-tokyo-3d](https://github.com/nagix/mini-tokyo-3d)(MIT, Akihiko Kusanagi)— 線形ブートストラップ
- [地理院タイル(淡色地図・標高タイル)](https://maps.gsi.go.jp/development/ichiran.html)(国土地理院)
- [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/)(Mapzen/AWS Open Data)
- 駅深度の出典は `data/depths/**/*.yaml` の各エントリに記載

## デプロイ

`main` への push で GitHub Pages へ自動デプロイ(`.github/workflows/deploy.yml`)。
初回はリポジトリの Settings → Pages → Source を **GitHub Actions** にすること。

## ロードマップ

- **Phase 1(現在)**: 銀座線・丸ノ内線(+方南町支線)・大江戸線
- **Phase 2**: 地下鉄全13路線、地理院DEM化、深度データの公表値置換
- **Phase 3**: JR・私鉄の地下区間(総武快速・りんかい線・京葉線など、坑口接続)
- **Phase 4**: 駅構内(コンコース階・出入口)、断面表示モード
