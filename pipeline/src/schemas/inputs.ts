/**
 * 入力データ(data/ 配下の YAML)の zod スキーマ。
 * スキーマがそのままデータ仕様のドキュメントを兼ねる(.describe() 参照)。
 */
import { z } from "zod";

export const LonLatTuple = z
  .tuple([z.number().min(122).max(154), z.number().min(20).max(46)])
  .describe("[経度, 緯度] (WGS84, 日本域)");

export const AnchorSchema = z.object({
  name: z.string(),
  lonlat: LonLatTuple.describe("ローカル座標原点。一度決めたら変更禁止"),
  epsg: z.literal(6677).describe("平面直角座標系IX系(JGD2011)"),
});

export const OperatorsSchema = z.object({
  operators: z.array(
    z.object({
      id: z.string().regex(/^[a-z0-9-]+$/),
      name: z.string(),
      name_en: z.string().optional(),
    })
  ),
});

export const SourceRef = z.object({
  title: z.string().describe("出典の名称(資料名・記事名・推定根拠の説明)"),
  url: z.string().url().optional(),
  accessed: z.coerce.date().optional(),
  quote: z.string().optional().describe("出典中の該当記述の引用"),
  method: z
    .enum(["published", "interpolated", "estimated-from-structure"])
    .optional()
    .describe("値の導出方法。published=公表値そのまま"),
});

export const LineSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9-]+\.[a-z0-9-]+$/)
    .describe("'<operator>.<line>' 形式 (例: tokyo-metro.ginza)"),
  name: z.string(),
  name_en: z.string().optional(),
  operator: z.string(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).describe("公式ラインカラー"),
  phase: z.number().int().min(1).max(4).describe("実装フェーズ(1=MVP)"),
  enabled: z.boolean().default(false).describe("ビルド対象に含めるか"),
  underground: z.enum(["full", "partial"]).describe("partial は地下区間のみ描画(坑口定義が必要)"),
  n02_match: z
    .object({
      operator: z.string().describe("N02_004 運営会社"),
      line: z.string().describe("N02_003 路線名"),
    })
    .optional()
    .describe("国土数値情報 N02 からの抽出キー"),
  mt3d_id: z
    .string()
    .optional()
    .describe("mini-tokyo-3d coordinates.json の路線ID(ブートストラップ用)"),
  exclude_stations: z
    .array(z.string())
    .optional()
    .describe("抽出から除外する駅名(他社直通区間の駅など)"),
  clip_bbox: z
    .tuple([z.number(), z.number(), z.number(), z.number()])
    .optional()
    .describe(
      "[minLon, minLat, maxLon, maxLat]。指定すると bbox に完全に含まれる線形チャンク・駅のみ抽出する(支線の切り出し用)"
    ),
  exclude_bbox: z
    .tuple([z.number(), z.number(), z.number(), z.number()])
    .optional()
    .describe("bbox に完全に含まれる線形チャンクを除外する(支線を本線から除く用)"),
  tunnel_radius_m: z.number().default(4.5).describe("描画用トンネル半径(複線シールド近似)"),
});

export const LinesSchema = z.object({ lines: z.array(LineSchema) });

export const PlatformSchema = z
  .object({
    id: z.string().default("main"),
    depth_m: z
      .number()
      .min(-60)
      .max(60)
      .optional()
      .describe("地表からホーム(床面)までの深さ[m]。地表より上は負値"),
    tp_m: z.number().min(-100).max(100).optional().describe("ホーム標高 T.P.[m] の直指定"),
    depth_datum: z
      .enum(["ground", "tp"])
      .describe("ground=depth_m を使用(DEMで T.P. に変換) / tp=tp_m を使用"),
    length_m: z.number().positive().optional(),
    width_m: z.number().positive().optional(),
    height_m: z.number().positive().optional(),
    confidence: z
      .enum(["official", "secondary", "estimated"])
      .describe("official=事業者公表値 / secondary=報道・編纂資料 / estimated=推定値"),
    sources: z.array(SourceRef).min(1).describe("出典は必須。推定の場合も根拠を記す"),
    note: z.string().optional(),
  })
  .refine((p) => (p.depth_datum === "ground" ? p.depth_m !== undefined : p.tp_m !== undefined), {
    message: "depth_datum=ground なら depth_m、tp なら tp_m が必要です",
  });

export const StationDepthSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().describe("駅名(抽出済み線形データの駅名と一致させる)"),
  match_name: z.string().optional().describe("線形データ側の駅名が異なる場合のマッチ用"),
  platforms: z.array(PlatformSchema).min(1),
});

export const DepthFileSchema = z.object({
  line_id: z.string(),
  default_platform: z
    .object({
      length_m: z.number().positive(),
      width_m: z.number().positive(),
      height_m: z.number().positive(),
    })
    .describe("platforms で省略された寸法の既定値(編成長などから決める)"),
  stations: z.array(StationDepthSchema).min(1),
});

export const ProfileHintsSchema = z.object({
  hints: z
    .array(
      z.object({
        line_id: z.string(),
        lonlat: LonLatTuple,
        tp_m: z.number(),
        note: z.string(),
        sources: z.array(SourceRef).optional(),
      })
    )
    .describe("駅間の縦断制御点(河川下越え・他路線回避などの補間ヒント)"),
});

export const CrossingsSchema = z.object({
  crossings: z
    .array(
      z.object({
        lines: z.tuple([z.string(), z.string()]),
        near: z.object({ lonlat: LonLatTuple, radius_m: z.number().positive() }),
        order: z
          .tuple([z.string(), z.string()])
          .describe("[上を通る路線, 下を通る路線]"),
        min_separation_m: z.number().positive().default(6.5),
        sources: z.array(SourceRef).optional(),
        note: z.string().optional(),
      })
    )
    .describe("路線交差の上下関係の明示制約。検証で突き合わせる"),
});

export type LineDef = z.infer<typeof LineSchema>;
export type DepthFile = z.infer<typeof DepthFileSchema>;
export type StationDepth = z.infer<typeof StationDepthSchema>;
export type Platform = z.infer<typeof PlatformSchema>;
