/**
 * 抽出済み線形データ(data/sources/extracted/lines/*.geojson)のスキーマ。
 *
 * これは「上流データ(N02 等)から対象路線だけを切り出して正規化した中間形式」で、
 * コミットされる。どの上流から作ったかは metadata.source に記録される。
 * N02 と mini-tokyo-3d のどちらから抽出しても同じ形になる(差し替え可能)。
 */
import { z } from "zod";

const Position = z.tuple([z.number(), z.number()]);

export const ExtractedLineSchema = z.object({
  type: z.literal("FeatureCollection"),
  metadata: z.object({
    line_id: z.string(),
    source: z.object({
      name: z.string().describe("上流データ名 (例: 国土数値情報 N02-23, mini-tokyo-3d)"),
      url: z.string().url(),
      license: z.string(),
      retrieved: z.coerce.date(),
      note: z.string().optional(),
    }),
  }),
  features: z.array(
    z.union([
      z.object({
        type: z.literal("Feature"),
        properties: z.object({
          kind: z.literal("track"),
          seq: z.number().int(),
          role: z
            .string()
            .optional()
            .describe("main=本線 / sub=連絡線または本線の補完部品 / hybrid=共用区間"),
        }),
        geometry: z.object({
          type: z.literal("LineString"),
          coordinates: z.array(Position).min(2),
        }),
      }),
      z.object({
        type: z.literal("Feature"),
        properties: z.object({ kind: z.literal("station"), name: z.string() }),
        geometry: z.object({ type: z.literal("Point"), coordinates: Position }),
      }),
    ])
  ),
});

export type ExtractedLine = z.infer<typeof ExtractedLineSchema>;
