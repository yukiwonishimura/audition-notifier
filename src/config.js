// 環境変数の読み込みと検証
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

export const paths = {
  root: ROOT,
  dbFile: process.env.DB_FILE || join(ROOT, "data", "auditions.db"),
  criteriaFile: join(ROOT, "prompts", "criteria.md"),
};

export function loadCriteria() {
  return readFileSync(paths.criteriaFile, "utf8");
}

/**
 * @param {{requireClaude?:boolean}} opts
 */
export function loadConfig({ requireClaude = true } = {}) {
  const cfg = {
    lineToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || "",
    lineUserId: process.env.LINE_USER_ID || "",
    // Claude Code CLI の認証。CIでは必須。ローカルはログイン済みセッションでも可。
    claudeToken: process.env.CLAUDE_CODE_OAUTH_TOKEN || "",
    // サブスク利用枠を節約するため既定は sonnet。opus にしたいなら CLAUDE_MODEL=opus
    model: process.env.CLAUDE_MODEL || "sonnet",
    dryRun: Boolean(process.env.DRY_RUN),
    ci: Boolean(process.env.CI),
  };

  const missing = [];
  if (!cfg.lineToken) missing.push("LINE_CHANNEL_ACCESS_TOKEN");
  if (!cfg.lineUserId) missing.push("LINE_USER_ID");
  if (missing.length > 0) {
    throw new Error(
      `環境変数が設定されていません: ${missing.join(", ")}\n` +
        `ローカルなら .env に設定し、GitHub Actions なら Secrets に登録してください。`
    );
  }

  if (requireClaude && cfg.ci && !cfg.claudeToken) {
    throw new Error(
      "CI 実行には CLAUDE_CODE_OAUTH_TOKEN が必要です。\n" +
        "ローカルで `claude setup-token` を実行し、出力を GitHub Secrets に登録してください。"
    );
  }
  if (requireClaude && !cfg.ci && !cfg.claudeToken) {
    console.warn(
      "[warn] CLAUDE_CODE_OAUTH_TOKEN 未設定。ローカルのログイン済み claude セッションを使用します。"
    );
  }

  return cfg;
}
