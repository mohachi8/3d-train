# データ更新ガイド(レシピ集)

AI エージェント・人間共用の具体的な作業手順。前提は [CLAUDE.md](../CLAUDE.md) を読むこと。

## レシピ1: 駅深度を1件追加・修正する

例: 「大江戸線 月島駅の深さの公表値が見つかった」

1. `data/depths/toei/oedo.yaml` の該当駅の `platforms[].depth_m` を修正し、
   `confidence` を `estimated` → `secondary`(報道・編纂)または `official`(事業者公表)へ。
   `sources` に出典(title / url / accessed)を**必ず**追加。
2. ```bash
   npm run build:data && npm run validate:data
   ```
3. validate の crossing/gradient 警告が増えていないことを確認。
4. `git diff` で `data/depths/` と `app/public/data/` の差分を確認しコミット。

## レシピ2: 新しい路線を有効化する(Phase 2)

例: 「日比谷線を追加する」

1. `data/registry/lines.yaml` の `tokyo-metro.hibiya` は登録済み。抽出済み線形も
   `data/sources/extracted/lines/tokyo-metro.hibiya.geojson` に存在することを確認。
2. `data/depths/tokyo-metro/hibiya.yaml` を新規作成。スキーマは既存ファイル
   (`ginza.yaml` が手本)と同じ。**全駅**にエントリが必要(coverage チェックで検証)。
   駅名は抽出済み geojson の `station` フィーチャの `name` と一致させる
   (異なる場合は `match_name` を使う)。
3. `lines.yaml` の該当路線を `enabled: true` に変更。
4. `npm run build:data && npm run validate:data`
5. 新たな交差が検出されたら `data/constraints/crossings.yaml` に上下関係を明記。

## レシピ3: 交差の警告を解消する

`crossing` 警告は「2路線の鉛直離隔が 6.5m 未満」の自動検出。

- **現実にもそのくらい近接している場合**(直上直下の併設など):
  `data/constraints/crossings.yaml` に交差を登録し、`order`(上下)と
  `min_separation_m` を実態に合わせて明記する。
- **補間の誤りの場合**: 交差点付近の駅深度を見直すか、駅間に
  `data/constraints/profile-hints.yaml` の制御点を追加して縦断を補正する。
- 上下関係が制約と**逆**だと error になる。この場合はどちらかの深度データが
  間違っているので、出典に立ち返って修正する。

## レシピ4: 線形を国土数値情報(N02)に置き換える

現在の線形は mini-tokyo-3d 由来のブートストラップ。正規データへの置換は:

```bash
npm run fetch:sources                          # N02 GeoJSON をダウンロード(要ネットワーク)
npm run cli -w pipeline -- extract-n02         # 同じ形式で再抽出(上書き)
npm run build:data && npm run validate:data    # 駅名不一致が出たら match_name で調整
```

ネットワーク制限のある環境では GitHub Actions ランナーで実行する。

## レシピ5: 地表標高を地理院DEMに切り替える

1. GitHub Actions の `refresh-dem` ワークフローを手動実行(provider: gsi)。
   → `data/sources/extracted/dem/gsi/` にタイルがコミットされる。
2. ブランチを pull し、`data/sources/manifest.yaml` の `dem.providers` を
   `[gsi, terrarium]` に変更。
3. `npm run build:data && npm run validate:data` → 差分をコミット。
   (depth_datum: ground の駅の T.P. が変わるので、勾配・交差検証を必ず見ること)

## レシピ6: アーティファクトのスキーマを変更する

1. `pipeline/src/schemas/artifacts.ts` の `SCHEMA_VERSION` をインクリメントし、
   スキーマと `pipeline/src/steps/build.ts` を変更。
2. アプリ側 `app/src/loader/artifacts.ts` の `SUPPORTED_SCHEMA_VERSION` と型を追従。
3. `npm run check` が通ることを確認(バージョン不一致はアプリが起動時に検出する)。
