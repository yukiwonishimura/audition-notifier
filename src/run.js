// 毎朝のパイプライン: 検索 → 重複排除 → AI評価 → LINE通知
import { loadConfig, loadCriteria, paths } from "./config.js";
import {
  openDb,
  upsertCandidate,
  fingerprintOf,
  saveEvaluation,
  selectNotifiable,
  markNotified,
  stats,
} from "./db.js";
import { research } from "./research.js";
import { evaluate } from "./evaluate.js";
import { formatNotification } from "./format.js";
import { pushTexts } from "./line.js";

function log(...a) {
  console.log(new Date().toISOString(), ...a);
}

async function main() {
  const cfg = loadConfig();
  const criteria = loadCriteria();
  const now = new Date().toISOString();
  log(`start model=${cfg.model} dryRun=${cfg.dryRun} db=${paths.dbFile}`);

  const db = openDb(paths.dbFile);

  // 1. 検索
  const { candidates, rawText } = await research({
    model: cfg.model,
    criteria,
  });
  log(`research: ${candidates.length} 件の候補`);
  if (candidates.length === 0) {
    log("研究ステップの生テキスト（末尾500字）:", rawText.slice(-500));
  }

  // 2. 重複排除 / 差分検出
  const toEvaluate = [];
  for (const c of candidates) {
    if (!c.project_name && !c.source_url) continue;
    const state = upsertCandidate(db, c, now);
    if (state === "new" || state === "updated") {
      toEvaluate.push({ ...c, fingerprint: fingerprintOf(c) });
    }
  }
  log(`新規/更新: ${toEvaluate.length} 件を評価対象に`);

  // 3. AI評価
  if (toEvaluate.length > 0) {
    const results = await evaluate({
      model: cfg.model,
      criteria,
      candidates: toEvaluate,
    });
    for (const r of results) {
      const target = toEvaluate[r.index];
      if (!target) continue;
      saveEvaluation(db, target.fingerprint, r);
      log(
        `  [${r.rank} ${r.score}] ${target.project_name || target.source_url}` +
          (r.suspicious ? " (要注意)" : "")
      );
    }
  }

  // 4. 通知対象の抽出・整形
  const notifiable = selectNotifiable(db);
  log(`通知対象(S+/S/A): ${notifiable.length} 件`);
  const messages = formatNotification(notifiable);

  // 5. 送信
  if (cfg.dryRun) {
    log("DRY_RUN: 送信せずに内容を表示します\n");
    console.log(messages.join("\n\n========================\n\n"));
  } else {
    const auth = { token: cfg.lineToken, userId: cfg.lineUserId };
    const r = await pushTexts(auth, messages);
    log(`LINE送信 status=${r.status}`);
    if (notifiable.length > 0) {
      markNotified(db, notifiable.map((row) => row.id), now);
    }
  }

  const s = stats(db);
  log(`DB: total=${s.total} notified=${s.notified} suspicious=${s.suspicious}`);
  db.close();
  log("done");
}

main().catch((err) => {
  console.error("実行エラー:", err);
  process.exit(1);
});
