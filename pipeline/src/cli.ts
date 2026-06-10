/**
 * パイプライン CLI。
 *
 *   npm run cli -w pipeline -- <command> [options]
 *
 * commands:
 *   import-mt3d [--src <dir>]  mini-tokyo-3d から線形をブートストラップ抽出
 *   fetch                      国土数値情報 N02 をダウンロード(要ネットワーク)
 *   extract-n02                N02 から対象路線を抽出(正規ルート)
 *   fetch-dem [--provider p]   DEM タイルを取得しキャッシュ(gsi | terrarium)
 *   build [--line <id>]        アーティファクト生成 → app/public/data/
 *   validate                   データ検証(エラーがあれば exit 1)
 *   report                     検証結果を Markdown で出力
 */
import { importMt3d } from "./steps/import-mt3d.js";
import { fetchN02, extractN02 } from "./steps/fetch-extract-n02.js";
import { fetchDem } from "./steps/fetch-dem.js";
import { build } from "./steps/build.js";
import { validate, type Finding } from "./validate/validate.js";

const args = process.argv.slice(2);
const command = args[0];

function opt(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

function printFindings(findings: Finding[], markdown = false): void {
  const errors = findings.filter((f) => f.severity === "error");
  const warns = findings.filter((f) => f.severity === "warn");
  if (markdown) {
    console.log(`# データ検証レポート\n`);
    console.log(`- エラー: ${errors.length} / 警告: ${warns.length}\n`);
    for (const f of findings) {
      console.log(`- ${f.severity === "error" ? "🔴" : "🟡"} **[${f.check}]** ${f.message}`);
    }
  } else {
    for (const f of findings) {
      console.log(`${f.severity === "error" ? "ERROR" : "warn "} [${f.check}] ${f.message}`);
    }
    console.log(`\n検証結果: エラー ${errors.length} 件 / 警告 ${warns.length} 件`);
  }
}

try {
  switch (command) {
    case "import-mt3d":
      await importMt3d(opt("src"));
      break;
    case "fetch":
      await fetchN02();
      break;
    case "extract-n02":
      await extractN02();
      break;
    case "fetch-dem":
      await fetchDem((opt("provider") as "gsi" | "terrarium") ?? "gsi");
      break;
    case "build":
      await build(opt("line"));
      break;
    case "validate": {
      const findings = await validate();
      printFindings(findings);
      if (findings.some((f) => f.severity === "error")) process.exit(1);
      break;
    }
    case "report": {
      printFindings(await validate(), true);
      break;
    }
    default:
      console.error(`不明なコマンド: ${command ?? "(なし)"}\n使い方は src/cli.ts のコメント参照`);
      process.exit(2);
  }
} catch (e) {
  console.error(`[FATAL] ${(e as Error).message}`);
  process.exit(1);
}
