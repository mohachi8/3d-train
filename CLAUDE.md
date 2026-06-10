# 東京地下3D — AI運用ガイド

東京の地下鉄網を正確な位置・深さで探索できる 3D ビューア。
**このファイルは AI エージェントが保守作業をするときの起点ドキュメント。**

## アーキテクチャ(3層の厳密分離)

```
data/                 ソース・オブ・トゥルース(人間/AI が編集する唯一の場所)
  │  pipeline/        決定的な変換 + 多層検証(zod)
  ▼
app/public/data/      生成アーティファクト(コミットするが、手編集は絶対禁止)
  │  app/             アーティファクトを読むだけの Three.js ビューア
  ▼
GitHub Pages
```

- 座標系: 平面直角座標系IX系(EPSG:6677)。ローカル座標は x=東 / y=海抜T.P. / z=南 [m]。
  原点は `data/registry/anchor.yaml`(**変更禁止**)。
- 出力は決定的: 同じ `data/` からは必ず同じアーティファクトが生成される。
  タイムスタンプを出力に入れてはならない。CI が再ビルド差分ゼロを検証する。

## データ更新の黄金パス

```bash
# 1. data/ 配下の YAML を編集(例: 駅深度の修正)
# 2. 再生成と検証
npm run build:data
npm run validate:data
# 3. 差分を確認してコミット(data/ と app/public/data/ の両方が変わる)
git diff --stat
```

詳細な手順(駅深度の追加・新路線の追加・交差矛盾の解消)は
`docs/data-update-guide.md` のレシピを参照。

## コマンド一覧

| コマンド | 説明 |
|---|---|
| `npm run build:data` | data/ → app/public/data/ のアーティファクト生成 |
| `npm run validate:data` | スキーマ・カバレッジ・勾配・交差・鮮度の検証(エラーで exit 1) |
| `npm run report:data` | 検証結果を Markdown で出力 |
| `npm run import:mt3d` | 線形のブートストラップ抽出(mini-tokyo-3d から) |
| `npm run fetch:sources` + `cli -w pipeline -- extract-n02` | 国土数値情報 N02 からの正規抽出(要ネットワーク) |
| `npm run cli -w pipeline -- fetch-dem --provider gsi` | DEM タイルキャッシュ取得(要ネットワーク) |
| `npm run test` / `npm run typecheck` | 単体テスト / 型チェック |
| `npm run dev` / `npm run build` | アプリ開発サーバ / 本番ビルド |
| `npm run check` | 上記全部入り(CI 相当) |

## 禁止事項

- `app/public/data/` の手編集(必ず `data/` を直して `build:data`)
- `data/registry/anchor.yaml` の変更(全座標・共有URLが壊れる)
- 出典(`sources`)なしの深度値の追加(zod が拒否する。推定値も根拠を書く)
- 公表値と推定値の混同: 推定値は必ず `confidence: estimated`

## 重要な設計知識

- **深度データは3段階の確度**で管理: `official`(事業者公表) / `secondary`(報道・編纂) /
  `estimated`(推定)。推定値はビューアで半透明表示+※印になる。
- **駅間の縦断線形は非公開**のため、駅深度を制御点とした PCHIP 補間で近似している。
  駅間に山・谷がある場合(地上区間・河川下越え)は `data/constraints/profile-hints.yaml`
  に制御点を足す。
- **路線交差の上下関係**は `data/constraints/crossings.yaml` に明示し、検証が突き合わせる。
  crossing-check の警告が出たら: 現実に近接しているなら制約に明記、補間の誤りなら
  profile-hints で補正。
- **DEM(地表標高)**: キャッシュ(`data/sources/extracted/dem/`)をコミットして
  オフライン再現性を確保。現在は terrarium(SRTM 由来、ビル街で誤差あり)。
  地理院 DEM への置換は GitHub Actions の `refresh-dem` ワークフローで行う
  (実行後 `data/sources/manifest.yaml` の providers を `[gsi, terrarium]` にして再ビルド)。
- **ネットワーク制約**: 開発サンドボックスからは GitHub / npm / S3 のみ到達可能なことがある。
  nlftp.mlit.go.jp や cyberjapandata.gsi.go.jp への取得は CI(GitHub Actions)で行う。

## ディレクトリの地図

- `data/registry/lines.yaml` — 路線レジストリ(enabled で対象制御、phase 計画つき)
- `data/depths/<operator>/<line>.yaml` — 駅深度(キュレーションの中核)
- `data/constraints/` — crossings.yaml / profile-hints.yaml
- `data/sources/extracted/` — 抽出済み線形 + DEM キャッシュ(コミット対象)
- `pipeline/src/steps/build.ts` — メインビルド(縦断補間の核心は 50 行目付近)
- `pipeline/src/validate/validate.ts` — 全検証ロジック
- `app/src/layers/` — tunnels(平行移動フレーム) / stations / labels / ground
- `.github/workflows/` — ci(検証+決定性) / deploy(Pages) / refresh-dem
