// SQLite（Node標準の node:sqlite）による案件の永続化・重複管理
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS auditions (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  fingerprint          TEXT UNIQUE NOT NULL,
  project_name         TEXT,
  production_company   TEXT,
  role                 TEXT,
  source_url           TEXT,
  source_type          TEXT,
  application_deadline TEXT,
  fee                  TEXT,
  description          TEXT,
  discovered_at        TEXT NOT NULL,
  last_checked_at      TEXT NOT NULL,
  content_hash         TEXT NOT NULL,
  score                INTEGER,
  rank                 TEXT,
  reason               TEXT,
  cautions             TEXT,
  suspicious           INTEGER NOT NULL DEFAULT 0,
  notified             INTEGER NOT NULL DEFAULT 0,
  notified_at          TEXT,
  notified_hash        TEXT,
  status               TEXT NOT NULL DEFAULT 'open'
);
`;

/** 案件の同一性判定キー。作品名＋役名を正規化。無ければURL。 */
export function fingerprintOf(c) {
  const norm = (s) =>
    String(s || "")
      .toLowerCase()
      .normalize("NFKC")
      .replace(/[\s　]+/g, "")
      .replace(/[!-/:-@[-`{-~、。「」『』（）・…ー]/g, "");
  const key = norm(c.project_name) + "|" + norm(c.role);
  if (key.replace("|", "").length >= 3) return key;
  return "url:" + norm(c.source_url);
}

/** 募集内容の実質的な変化を検知するためのハッシュ。 */
export function contentHashOf(c) {
  const payload = [
    c.project_name,
    c.role,
    c.application_deadline,
    c.fee,
    c.description,
  ]
    .map((s) => String(s || "").trim())
    .join("");
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

export function openDb(dbFile) {
  mkdirSync(dirname(dbFile), { recursive: true });
  const db = new DatabaseSync(dbFile);
  db.exec(SCHEMA);
  return db;
}

/**
 * 候補をDBに反映する。
 * @returns {"new"|"updated"|"unchanged"} このレコードの状態
 */
export function upsertCandidate(db, c, now) {
  const fp = fingerprintOf(c);
  const hash = contentHashOf(c);
  const existing = db
    .prepare("SELECT * FROM auditions WHERE fingerprint = ?")
    .get(fp);

  if (!existing) {
    db.prepare(
      `INSERT INTO auditions
       (fingerprint, project_name, production_company, role, source_url, source_type,
        application_deadline, fee, description, discovered_at, last_checked_at, content_hash,
        suspicious, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, 'open')`
    ).run(
      fp,
      c.project_name || null,
      c.production_company || null,
      c.role || null,
      c.source_url || null,
      c.source_type || null,
      c.application_deadline || null,
      c.fee || null,
      c.description || null,
      now,
      now,
      hash,
      c.suspicious ? 1 : 0
    );
    return "new";
  }

  const changed = existing.content_hash !== hash;
  db.prepare(
    `UPDATE auditions SET
       project_name = ?, production_company = ?, role = ?, source_url = ?, source_type = ?,
       application_deadline = ?, fee = ?, description = ?, last_checked_at = ?, content_hash = ?,
       suspicious = ?
     WHERE fingerprint = ?`
  ).run(
    c.project_name || existing.project_name,
    c.production_company || existing.production_company,
    c.role || existing.role,
    c.source_url || existing.source_url,
    c.source_type || existing.source_type,
    c.application_deadline || existing.application_deadline,
    c.fee || existing.fee,
    c.description || existing.description,
    now,
    hash,
    c.suspicious ? 1 : existing.suspicious,
    fp
  );
  return changed ? "updated" : "unchanged";
}

/** 評価結果を保存。 */
export function saveEvaluation(db, fingerprint, evalResult) {
  db.prepare(
    `UPDATE auditions SET score = ?, rank = ?, reason = ?, cautions = ?, suspicious = ?
     WHERE fingerprint = ?`
  ).run(
    evalResult.score ?? null,
    evalResult.rank || null,
    evalResult.reason || null,
    evalResult.cautions || null,
    evalResult.suspicious ? 1 : 0,
    fingerprint
  );
}

/**
 * 通知すべき案件を返す。
 * S+/S/A かつ 怪しくない かつ（未通知 または 通知後に内容が変化）。
 */
export function selectNotifiable(db) {
  return db
    .prepare(
      `SELECT * FROM auditions
       WHERE rank IN ('S+','S','A')
         AND suspicious = 0
         AND status = 'open'
         AND (notified = 0 OR notified_hash IS NOT content_hash)
       ORDER BY score DESC`
    )
    .all();
}

export function markNotified(db, ids, now) {
  const stmt = db.prepare(
    "UPDATE auditions SET notified = 1, notified_at = ?, notified_hash = content_hash WHERE id = ?"
  );
  for (const id of ids) stmt.run(now, id);
}

export function stats(db) {
  return db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(CASE WHEN notified = 1 THEN 1 ELSE 0 END), 0) AS notified,
         COALESCE(SUM(CASE WHEN suspicious = 1 THEN 1 ELSE 0 END), 0) AS suspicious
       FROM auditions`
    )
    .get();
}
