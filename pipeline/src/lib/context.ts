/**
 * パイプライン共通のパス解決と入力ロード。
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import {
  AnchorSchema,
  OperatorsSchema,
  LinesSchema,
  DepthFileSchema,
  ProfileHintsSchema,
  CrossingsSchema,
  type LineDef,
  type DepthFile,
} from "../schemas/inputs.js";
import { ExtractedLineSchema, type ExtractedLine } from "../schemas/extracted.js";

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(here, "../../..");

export const PATHS = {
  data: join(REPO_ROOT, "data"),
  registry: join(REPO_ROOT, "data/registry"),
  depths: join(REPO_ROOT, "data/depths"),
  constraints: join(REPO_ROOT, "data/constraints"),
  extractedLines: join(REPO_ROOT, "data/sources/extracted/lines"),
  demCache: join(REPO_ROOT, "data/sources/extracted/dem"),
  rawSources: join(REPO_ROOT, "data/sources/raw"),
  artifacts: join(REPO_ROOT, "app/public/data"),
} as const;

export function loadYaml<T extends z.ZodTypeAny>(path: string, schema: T): z.infer<T> {
  const text = readFileSync(path, "utf-8");
  const parsed = parseYaml(text);
  const result = schema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`スキーマ検証エラー: ${path}\n${issues}`);
  }
  return result.data;
}

export function loadAnchor() {
  return loadYaml(join(PATHS.registry, "anchor.yaml"), AnchorSchema);
}

export function loadOperators() {
  return loadYaml(join(PATHS.registry, "operators.yaml"), OperatorsSchema);
}

export function loadLines(): LineDef[] {
  return loadYaml(join(PATHS.registry, "lines.yaml"), LinesSchema).lines;
}

export function loadProfileHints() {
  const p = join(PATHS.constraints, "profile-hints.yaml");
  return existsSync(p) ? loadYaml(p, ProfileHintsSchema).hints : [];
}

export function loadCrossings() {
  const p = join(PATHS.constraints, "crossings.yaml");
  return existsSync(p) ? loadYaml(p, CrossingsSchema).crossings : [];
}

/** 路線ID → 深度ファイルパス (data/depths/<operator>/<line>.yaml) */
export function depthFilePath(lineId: string): string {
  const [operator, line] = lineId.split(".");
  return join(PATHS.depths, operator!, `${line}.yaml`);
}

export function loadDepthFile(lineId: string): DepthFile | undefined {
  const p = depthFilePath(lineId);
  if (!existsSync(p)) return undefined;
  const f = loadYaml(p, DepthFileSchema);
  if (f.line_id !== lineId) {
    throw new Error(`${p}: line_id が ${f.line_id} ですがファイル位置は ${lineId} です`);
  }
  return f;
}

export function extractedLinePath(lineId: string): string {
  return join(PATHS.extractedLines, `${lineId}.geojson`);
}

export function loadExtractedLine(lineId: string): ExtractedLine | undefined {
  const p = extractedLinePath(lineId);
  if (!existsSync(p)) return undefined;
  return loadYaml(p, ExtractedLineSchema); // YAML パーサは JSON も読める
}

/** 入力ファイル群の内容ハッシュ(決定性・プロビナンス用)。 */
export function computeInputsHash(): string {
  const files: string[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name)
    )) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ya?ml|geojson|json)$/.test(e.name)) files.push(p);
    }
  };
  walk(PATHS.registry);
  walk(PATHS.depths);
  walk(PATHS.constraints);
  walk(PATHS.extractedLines);
  const h = createHash("sha256");
  for (const f of files) {
    h.update(f.slice(REPO_ROOT.length));
    h.update(readFileSync(f));
  }
  return h.digest("hex").slice(0, 16);
}
