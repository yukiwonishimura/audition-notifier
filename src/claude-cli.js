// Claude Code CLI（claude -p）をサブプロセスで実行するラッパー。
// APIキー課金ではなく、CLAUDE_CODE_OAUTH_TOKEN（= `claude setup-token`）または
// ローカルのログイン済みセッションで認証する。
import { spawn } from "node:child_process";

const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";

/**
 * @param {object} opts
 * @param {string} opts.prompt            プロンプト本文（stdinで渡す）
 * @param {string[]} [opts.allowedTools]  例: ["WebSearch"]
 * @param {string} [opts.model]           例: "sonnet" / "opus"
 * @param {number} [opts.maxTurns]
 * @param {number} [opts.timeoutMs]
 * @returns {Promise<{text:string, raw:object}>}
 */
export function runClaude({
  prompt,
  allowedTools = [],
  model,
  maxTurns = 40,
  timeoutMs = 8 * 60 * 1000,
}) {
  const args = ["-p", "--output-format", "json", "--max-turns", String(maxTurns)];
  if (allowedTools.length > 0) {
    args.push("--allowed-tools", allowedTools.join(","));
  }
  if (model) args.push("--model", model);

  return new Promise((resolve, reject) => {
    const child = spawn(CLAUDE_BIN, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`claude 実行がタイムアウトしました (${timeoutMs}ms)`));
    }, timeoutMs);

    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) => {
      clearTimeout(timer);
      if (err.code === "ENOENT") {
        reject(
          new Error(
            "claude コマンドが見つかりません。`npm install -g @anthropic-ai/claude-code` を実行するか CLAUDE_BIN を設定してください。"
          )
        );
      } else {
        reject(err);
      }
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      let parsed;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        return reject(
          new Error(
            `claude の出力をJSONとして解釈できません (exit=${code})\nstdout: ${stdout.slice(
              0,
              500
            )}\nstderr: ${stderr.slice(0, 500)}`
          )
        );
      }
      const result = String(parsed.result ?? "");
      const looksLikeAuthError =
        /authenticate|OAuth access token is invalid|401|Invalid API key/i.test(
          result
        );
      if (parsed.is_error || parsed.subtype !== "success" || looksLikeAuthError) {
        return reject(
          new Error(
            `claude が正常終了しませんでした (exit=${code} subtype=${parsed.subtype})\n` +
              `result: ${result.slice(0, 600)}\n` +
              (stderr ? `stderr: ${stderr.slice(0, 400)}\n` : "") +
              (looksLikeAuthError
                ? "→ CLAUDE_CODE_OAUTH_TOKEN が無効です。`claude setup-token` を再実行し、" +
                  "出力トークン（sk-ant-oat01-... で始まる長い文字列）全体を Secret に登録し直してください。" +
                  "この機能には Claude Pro / Max のサブスクが必要です。"
                : "")
          )
        );
      }
      resolve({ text: result, raw: parsed });
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}
