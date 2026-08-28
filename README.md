# オーディション自動リサーチ & LINE通知（v1）

毎朝9時（JST）にGitHub Actionsで起動し、
**Web検索 → 収集 → 重複排除 → AIによる100点評価 → S/A以上だけLINE通知** を行う。

AI部分は **Claude Code CLI（`claude -p`）** を使う。Anthropic APIの従量課金ではなく、
`claude setup-token` で発行したトークン（= あなたのClaude Pro/Maxサブスク）で動くので **追加費用ゼロ**。
Web検索もClaude Code内蔵の WebSearch を使うため別料金なし。

```
 GitHub Actions (cron 0:00 UTC = 9:00 JST)
        └─ node src/run.js
             ├─ research.js   … claude -p + WebSearch で募集情報を収集
             ├─ db.js         … SQLite で重複排除・差分検出・通知履歴
             ├─ evaluate.js   … claude -p が各案件を100点評価しランク付け
             ├─ format.js     … 「本日のオーディション」＋TOP3を整形
             └─ line.js       … LINE Messaging API で push
```

## 構成ファイル

| パス | 役割 |
| --- | --- |
| `prompts/criteria.md` | 応募者プロフィールと評価ルーブリック。**ここを編集すれば挙動が変わる** |
| `src/claude-cli.js` | `claude -p` をサブプロセス実行するラッパー |
| `src/research.js` | Claude + WebSearch による情報収集 |
| `src/db.js` | SQLite（Node標準の `node:sqlite`）。重複排除・再通知判定 |
| `src/evaluate.js` | Claude による評価 |
| `src/json-extract.js` | 応答テキストからJSONを取り出す |
| `src/format.js` | LINE通知テキストの整形 |
| `src/line.js` | LINE push message 送信 |
| `src/run.js` | パイプライン全体 |
| `scripts/test-line.js` | LINE接続確認用のテスト送信 |
| `data/auditions.db` | 案件DB。**CIが毎回コミットして状態を保持する** |
| `.github/workflows/daily.yml` | 毎朝9時の自動実行 |

## 必要なもの（すべて無料枠）

- Node.js 24 以上（`node:sqlite` と `--env-file` を使用。npm依存パッケージはゼロ）
- LINE公式アカウント + Messaging API（テスト送信済み）
- Claude Pro または Max のサブスク（`claude setup-token` を発行できる）
- GitHubリポジトリ（非公開でOK。Actions無料枠 月2000分に対しこのジョブは月〜150分程度）

## ローカルでの実行

```bash
# .env に LINE_CHANNEL_ACCESS_TOKEN / LINE_USER_ID を設定（済み）
# claude に既にログインしていれば CLAUDE_CODE_OAUTH_TOKEN は空でよい
```

| コマンド | 内容 |
| --- | --- |
| `npm run test:line` | LINEにテスト文言を送るだけ |
| `npm run run:dry` | 検索〜評価まで実行し、**LINEには送らず**結果を標準出力に表示 |
| `npm run run:daily` | 本番と同じ（LINE送信あり・DB更新あり） |

`run:dry` / `run:daily` はローカルの `claude` コマンドが必要。無ければ
`npm install -g @anthropic-ai/claude-code`。使用モデルは既定 `sonnet`（`.env` の `CLAUDE_MODEL=opus` で変更）。

## GitHub Actions での定期実行 — あなたがやること

1. **`claude setup-token` を実行し、出力トークンを控える**
   ```bash
   claude setup-token
   ```

2. **GitHubに非公開リポジトリを作成し、このフォルダをpushする**
   （`node_modules` と `.env` は `.gitignore` 済み。`data/auditions.db` はコミット対象）

3. リポジトリの **Settings → Secrets and variables → Actions → New repository secret** で3つ登録:
   | Name | Value |
   | --- | --- |
   | `CLAUDE_CODE_OAUTH_TOKEN` | 手順1のトークン |
   | `LINE_CHANNEL_ACCESS_TOKEN` | LINEの長期トークン |
   | `LINE_USER_ID` | あなたのユーザーID |

4. （任意）同画面の **Variables** タブで `CLAUDE_MODEL` = `opus` などを設定

5. **Settings → Actions → General → Workflow permissions** を
   「Read and write permissions」にする（DBコミットのため）

6. **Actions タブ → daily-audition-research → Run workflow** で手動実行してテスト
   （`dry_run` にチェックを入れるとLINEに送らず、ログで結果を確認できる）

7. 問題なければ以降は毎日 UTC 0:00（JST 9:00）に自動実行される
   ※ GitHubのcronは混雑時に数分〜十数分遅延することがある

## 評価とランク

`prompts/criteria.md` のルーブリック（作品規模20 / 信頼性20 / キャリア20 / 役15 / 適性15 / 応募しやすさ10）で
100点満点評価し、`S+`(90+) / `S`(80+) / `A`(70+) / `B`(60+) / `reject` に分類。
**S+ / S / A だけ**をLINE通知する。高額登録料など悪質な兆候がある案件は自動で除外。

## 既知の制約（v1）

- **X / Threads の正式APIは使っていない。** WebSearchの結果に出てくる公開投稿を拾う範囲。
  本格的にSNSを横断するには別途API契約（X APIは有料）が必要。
- AI部分はあなたのClaude Pro/Maxの**利用枠を消費する**。Proだと日々の対話と枠を共有するため、
  重い日は上限に当たる可能性がある。心配なら `CLAUDE_MODEL` は `sonnet` のまま運用する。
- GitHub Actionsのスケジュールは実行時刻が保証されない（数分〜十数分の遅れあり）。
- DBはリポジトリにコミットして状態保持する簡易方式。並行実行は `concurrency` で抑止。
