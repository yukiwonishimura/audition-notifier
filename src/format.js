// 通知行の整形（LINEテキスト）
const RANK_EMOJI = { "S+": "🔥", S: "⭐", A: "✅" };
const MAX_LEN = 4800; // LINE 1メッセージ上限 5000 に対する安全マージン

function entryText(row) {
  const emoji = RANK_EMOJI[row.rank] || "•";
  return [
    `${emoji} ${row.rank}：${row.score}点`,
    ``,
    `【作品】`,
    row.project_name || "(不明)",
    ``,
    `【募集】`,
    row.role || "(不明)",
    ``,
    `【締切】`,
    row.application_deadline || "(記載なし)",
    ``,
    `【ギャラ】`,
    row.fee || "(記載なし)",
    ``,
    `【制作】`,
    row.production_company || "(不明)",
    ``,
    `【応募URL】`,
    row.source_url || "(なし)",
    ``,
    `【応募すべき理由】`,
    row.reason || "",
    ``,
    `【注意点】`,
    row.cautions || "特になし",
  ].join("\n");
}

/**
 * 通知対象からLINEメッセージ配列（最大5件）を作る。
 * @param {object[]} rows selectNotifiable の結果（score降順）
 * @returns {string[]}
 */
export function formatNotification(rows) {
  if (rows.length === 0) {
    return ["本日の有力オーディションはありませんでした。"];
  }

  const detailRows = rows.slice(0, 6);
  const top3 = rows.slice(0, 3);

  const header = "🎬 本日のオーディション\n";
  const footer =
    "\n🏆 今日応募すべきTOP3\n" +
    top3
      .map(
        (r, i) =>
          `${i + 1}位：${r.project_name || "(不明)"}（${r.rank} ${r.score}点）`
      )
      .join("\n");

  // ヘッダー + 各案件 + フッター を、5000字を超えないように複数メッセージへ分割
  const chunks = [];
  let current = header;
  for (const row of detailRows) {
    const block = "\n" + entryText(row) + "\n\n" + "─".repeat(12) + "\n";
    if ((current + block).length > MAX_LEN) {
      chunks.push(current.trimEnd());
      current = "";
    }
    current += block;
  }
  current += footer;
  chunks.push(current.trimEnd());

  return chunks.slice(0, 5);
}
