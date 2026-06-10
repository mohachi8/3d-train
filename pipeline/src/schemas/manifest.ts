/**
 * data/sources/manifest.yaml — 上流データソースの定義。
 */
import { z } from "zod";

export const ManifestSchema = z.object({
  upstreams: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      url: z.string().url(),
      license: z.string(),
      role: z.string().describe("このデータの用途"),
      note: z.string().optional(),
    })
  ),
  dem: z.object({
    providers: z
      .array(z.enum(["gsi", "terrarium"]))
      .min(1)
      .describe(
        "標高プロバイダの優先順。キャッシュ済みタイルと整合させること" +
          "(変更したら fetch でキャッシュを作り直し、build:data を再実行する)"
      ),
    allow_network: z
      .boolean()
      .default(true)
      .describe("キャッシュにないタイルのネットワーク取得を許可するか"),
  }),
});

export type Manifest = z.infer<typeof ManifestSchema>;
