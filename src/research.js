// Claude Code CLI + WebSearch で最新の俳優オーディション情報を収集する
import { runClaude } from "./claude-cli.js";
import { extractJsonArray } from "./json-extract.js";

const PROMPT = (criteria, today) => `あなたは日本の芸能・映像制作に詳しいリサーチャーです。
本日は ${today} です。WebSearch ツールを複数回使って、現在応募可能な
「30代男性俳優が実際に応募できる」オーディション/キャスト募集の最新情報を集めてください。

- 一般Web検索、オーディション専門サイト、制作会社の公式サイトを横断する。
- X（旧Twitter）や Threads の公開投稿が検索結果に出たら参照し、可能なら一次情報（公式募集ページ）まで遡る。
- 募集終了・古い情報・年齢や性別が明らかに不一致のものは除外する。
- URLやギャラを推測で創作しない。不明な項目は空文字にする。
- 検索キーワードは下記を起点に自律的に追加してよい。

${criteria}

# 出力
すべての調査を終えたら、最後に \`\`\`json コードブロックを1つだけ出力する。
中身は候補案件の配列。各要素は次の形（値は日本語、URLはそのまま）:

[
  {
    "project_name": "作品・案件名",
    "production_company": "制作会社・主催者（不明なら空文字）",
    "role": "募集している役（30代男性が応募できる部分）",
    "source_url": "一次情報に最も近いURL",
    "source_type": "web | audition-site | production-site | x | threads",
    "application_deadline": "YYYY/MM/DD（不明なら空文字）",
    "fee": "ギャラ・報酬の記載（不明なら空文字）",
    "description": "役の内容・条件・撮影時期などの要点を2〜4文",
    "suspicious": false,
    "suspicion_note": "怪しい点があれば理由。無ければ空文字"
  }
]

候補が無ければ [] を出力する。JSONコードブロック以外に配列を書かない。`;

/**
 * @returns {Promise<{candidates:object[], rawText:string}>}
 */
export async function research({ model, criteria }) {
  const today = new Date().toISOString().slice(0, 10);
  const { text } = await runClaude({
    prompt: PROMPT(criteria, today),
    allowedTools: ["WebSearch", "WebFetch"],
    model,
    maxTurns: 60,
  });

  const candidates = extractJsonArray(text).map((c) => ({
    project_name: c.project_name || "",
    production_company: c.production_company || "",
    role: c.role || "",
    source_url: c.source_url || "",
    source_type: c.source_type || "",
    application_deadline: c.application_deadline || "",
    fee: c.fee || "",
    description: c.description || "",
    suspicious: Boolean(c.suspicious),
    suspicion_note: c.suspicion_note || "",
  }));

  return { candidates, rawText: text };
}
