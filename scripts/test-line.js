// LINE 接続確認用のテスト送信
// 実行: npm run test:line   (= node --env-file=.env scripts/test-line.js)
import { loadConfig } from "../src/config.js";
import { pushTexts } from "../src/line.js";

const cfg = loadConfig({ requireClaude: false });

const r = await pushTexts(
  { token: cfg.lineToken, userId: cfg.lineUserId },
  ["テスト送信：オーディション通知システム接続確認"]
);

console.log("送信成功:", r.status, r.body);
