/**
 * アーティファクト(app/public/data/)のロード。
 * 形式の定義はパイプライン側 pipeline/src/schemas/artifacts.ts が正。
 * schema_version が合わない場合は明確なエラーで落とす。
 */
export const SUPPORTED_SCHEMA_VERSION = 1;

export interface IndexArtifact {
  schema_version: number;
  anchor: { lonlat: [number, number]; epsg: number };
  lines: {
    id: string;
    name: string;
    color: string;
    file: string;
    length_m: number;
    station_count: number;
  }[];
  stations_file: string;
  provenance: { pipeline_version: string; inputs_hash: string; dem_providers: string[] };
}

export interface LineArtifact {
  schema_version: number;
  line_id: string;
  name: string;
  color: string;
  tunnel_radius_m: number;
  positions: number[];
  arclength: number[];
  depth_below_ground: (number | null)[];
}

export interface StationBox {
  station_id: string;
  line_id: string;
  name: string;
  platform_id: string;
  center: [number, number, number];
  heading: number;
  size: [number, number, number];
  floor_tp: number;
  depth_m: number | null;
  confidence: "official" | "secondary" | "estimated";
}

export interface LoadedData {
  index: IndexArtifact;
  lines: LineArtifact[];
  boxes: StationBox[];
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${path}`);
  if (!res.ok) throw new Error(`データの取得に失敗: ${path} (HTTP ${res.status})`);
  return (await res.json()) as T;
}

export async function loadData(): Promise<LoadedData> {
  const index = await fetchJson<IndexArtifact>("index.json");
  if (index.schema_version !== SUPPORTED_SCHEMA_VERSION) {
    throw new Error(
      `データ形式バージョン不一致 (data=${index.schema_version}, app=${SUPPORTED_SCHEMA_VERSION})。` +
        `アプリとアーティファクトを揃えて再ビルドしてください`
    );
  }
  const [lines, stations] = await Promise.all([
    Promise.all(index.lines.map((l) => fetchJson<LineArtifact>(l.file))),
    fetchJson<{ boxes: StationBox[] }>(index.stations_file),
  ]);
  return { index, lines, boxes: stations.boxes };
}
