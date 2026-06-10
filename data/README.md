# data/ — ソース・オブ・トゥルース

このディレクトリ配下の YAML / GeoJSON が全データの原本。
**`app/public/data/` は生成物なので直接編集しないこと。**

- スキーマ定義(=正確な仕様): `pipeline/src/schemas/inputs.ts`(zod, 日本語の説明つき)
- 更新手順のレシピ: [docs/data-update-guide.md](../docs/data-update-guide.md)
- 運用全体の説明: [CLAUDE.md](../CLAUDE.md)

| パス | 内容 |
|---|---|
| `registry/anchor.yaml` | ローカル座標原点(変更禁止) |
| `registry/operators.yaml` | 事業者 |
| `registry/lines.yaml` | 路線レジストリ(enabled / phase / 抽出キー) |
| `depths/<operator>/<line>.yaml` | 駅深度(出典・確度つき。キュレーションの中核) |
| `constraints/crossings.yaml` | 路線交差の上下関係制約 |
| `constraints/profile-hints.yaml` | 駅間の縦断制御点 |
| `sources/manifest.yaml` | 上流データ台帳・DEM プロバイダ設定 |
| `sources/extracted/` | 抽出済み線形・DEMキャッシュ(コミット対象、ビルドのオフライン再現用) |
| `sources/raw/` | ダウンロード生データ(.gitignore) |
