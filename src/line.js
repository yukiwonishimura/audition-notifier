// LINE Messaging API: push message 送信
const ENDPOINT = "https://api.line.me/v2/bot/message/push";

/**
 * テキストメッセージを1〜5件まとめて push する。
 * @param {{token:string,userId:string}} auth
 * @param {string[]} texts 送信するテキスト（最大5件 / 1件5000文字まで）
 */
export async function pushTexts(auth, texts) {
  if (!Array.isArray(texts) || texts.length === 0) {
    throw new Error("送信するテキストがありません");
  }
  if (texts.length > 5) {
    throw new Error("LINE push は1リクエスト最大5メッセージです");
  }

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${auth.token}`,
    },
    body: JSON.stringify({
      to: auth.userId,
      messages: texts.map((text) => ({ type: "text", text })),
    }),
  });

  const body = await res.text();
  if (!res.ok) {
    throw new Error(`LINE送信失敗 status=${res.status} body=${body}`);
  }
  return { status: res.status, body };
}
