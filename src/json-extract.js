// LLMの応答テキストから JSON を取り出す（```json フェンス優先、無ければ生の括弧範囲）

function tryParseAll(strings) {
  for (const s of strings) {
    if (!s) continue;
    try {
      return JSON.parse(s);
    } catch {
      /* 次へ */
    }
  }
  return undefined;
}

function fencedBlocks(text) {
  const out = [];
  const re = /```(?:json)?\s*([\s\S]*?)```/gi;
  let m;
  while ((m = re.exec(text)) !== null) out.push(m[1].trim());
  return out;
}

/** 配列を期待して取り出す。失敗時は []。 */
export function extractJsonArray(text) {
  const candidates = [
    ...fencedBlocks(text),
    text.slice(text.indexOf("["), text.lastIndexOf("]") + 1),
  ];
  const parsed = tryParseAll(candidates);
  return Array.isArray(parsed) ? parsed : [];
}

/** オブジェクトを期待して取り出す。失敗時は null。 */
export function extractJsonObject(text) {
  const candidates = [
    ...fencedBlocks(text),
    text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1),
  ];
  const parsed = tryParseAll(candidates);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed
    : null;
}
