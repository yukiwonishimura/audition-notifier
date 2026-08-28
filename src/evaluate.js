// Claude Code CLI で各案件を100点満点評価し、ランク付けする
import { runClaude } from "./claude-cli.js";
import { extractJsonObject } from "./json-extract.js";

const VALID_RANKS = new Set(["S+", "S", "A", "B", "reject"]);

function buildPrompt(criteria, candidates) {
  const list = candidates
    .map(
      (c, i) =>
        `## index ${i}\n` +
        `作品/案件: ${c.project_name}\n` +
        `制作/主催: ${c.production_company || "(不明)"}\n` +
        `役: ${c.role}\n` +
        `締切: ${c.application_deadline || "(不明)"}\n` +
        `ギャラ: ${c.fee || "(不明)"}\n` +
        `情報源: ${c.source_type} ${c.source_url}\n` +
        `詳細: ${c.description}\n` +
        `リサーチ段階の懸念: ${c.suspicion_note || "(なし)"}`
    )
    .join("\n\n");

  return `あなたは俳優のキャリア戦略に詳しいキャスティング・アドバイザーです。
下記のプロフィールとルーブリックに厳密に従い、各案件を100点満点で評価してください。
情報が乏しい案件は信頼性・規模の点を低めに。悪質な募集の兆候（高額登録料・レッスン契約強要・
主催者不明・過度な勧誘・不自然な個人情報要求など）があれば suspicious=true、rank="reject"。

${criteria}

---

以下の ${candidates.length} 件を評価し、最後に \`\`\`json コードブロックを1つだけ出力する。
形式:

{
  "items": [
    {
      "index": 0,
      "score": 0,
      "rank": "S+|S|A|B|reject",
      "suspicious": false,
      "reason": "応募すべき理由（1〜3文、日本語）",
      "cautions": "応募前に確認すべき注意点（1〜3文、日本語）"
    }
  ]
}

全 index を1件ずつ含めること。JSONコードブロック以外にオブジェクトを書かない。

${list}`;
}

/**
 * @returns {Promise<Array<{index:number,score:number,rank:string,suspicious:boolean,reason:string,cautions:string}>>}
 */
export async function evaluate({ model, criteria, candidates }) {
  if (candidates.length === 0) return [];

  const { text } = await runClaude({
    prompt: buildPrompt(criteria, candidates),
    model,
    maxTurns: 6,
  });

  const obj = extractJsonObject(text);
  if (!obj || !Array.isArray(obj.items)) {
    throw new Error(`評価結果のパースに失敗:\n${text.slice(0, 800)}`);
  }

  return obj.items
    .filter((it) => Number.isInteger(it.index))
    .map((it) => ({
      index: it.index,
      score: Math.max(0, Math.min(100, Number(it.score) || 0)),
      rank: VALID_RANKS.has(it.rank) ? it.rank : "reject",
      suspicious: Boolean(it.suspicious),
      reason: String(it.reason || ""),
      cautions: String(it.cautions || ""),
    }));
}
