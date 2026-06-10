/**
 * 出力アーティファクト(app/public/data/)の zod スキーマ。
 * アプリはこの形のみを読む。schema_version を上げたらアプリ側 loader も更新する。
 */
import { z } from "zod";

export const SCHEMA_VERSION = 1;

export const ProvenanceSchema = z.object({
  pipeline_version: z.string(),
  inputs_hash: z.string().describe("全入力ファイル内容の SHA-256(決定性の担保)"),
  dem_providers: z.array(z.enum(["gsi", "terrarium"])),
});

export const LineArtifactSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  line_id: z.string(),
  name: z.string(),
  color: z.string(),
  tunnel_radius_m: z.number(),
  /** ローカル座標 [x,y,z, x,y,z, ...] (x=東, y=T.P., z=南, 単位m, 弧長約20m間隔) */
  positions: z.array(z.number()),
  /** 各サンプルの弧長 [m] */
  arclength: z.array(z.number()),
  /** 各サンプルの地表からの深さ [m](地表標高 − トンネル標高。DEM欠損時は null) */
  depth_below_ground: z.array(z.number().nullable()),
});

export const StationBoxSchema = z.object({
  station_id: z.string(),
  line_id: z.string(),
  name: z.string(),
  platform_id: z.string(),
  /** 箱の中心(ローカル座標, y はホーム床+高さ/2) */
  center: z.tuple([z.number(), z.number(), z.number()]),
  /** 進行方向の方位(ラジアン, ローカルXZ平面) */
  heading: z.number(),
  size: z.tuple([z.number(), z.number(), z.number()]).describe("[長さ, 高さ, 幅]"),
  /** ホーム床面の T.P. [m] */
  floor_tp: z.number(),
  /** 地表からの深さ [m](表示用, DEM欠損時 null) */
  depth_m: z.number().nullable(),
  confidence: z.enum(["official", "secondary", "estimated"]),
});

export const StationsArtifactSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  boxes: z.array(StationBoxSchema),
});

export const IndexArtifactSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  generated_by: z.string(),
  anchor: z.object({
    lonlat: z.tuple([z.number(), z.number()]),
    epsg: z.number(),
  }),
  lines: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      color: z.string(),
      file: z.string(),
      length_m: z.number(),
      station_count: z.number(),
    })
  ),
  stations_file: z.string(),
  provenance: ProvenanceSchema,
});

export type LineArtifact = z.infer<typeof LineArtifactSchema>;
export type StationsArtifact = z.infer<typeof StationsArtifactSchema>;
export type StationBox = z.infer<typeof StationBoxSchema>;
export type IndexArtifact = z.infer<typeof IndexArtifactSchema>;
