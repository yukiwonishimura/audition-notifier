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
      if (parsed.is_error || parsed.subtype === "error_max_turns") {
        return reject(
          new Error(
            `claude がエラー終了 (subtype=${parsed.subtype}) result=${String(
              parsed.result
            ).slice(0, 500)}`
          )
        );
      }
      resolve({ text: String(parsed.result ?? ""), raw: parsed });
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}
