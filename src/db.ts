import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/** SQLite 存档：events（事件缓存）/ audit（AI 写操作审计）/ kv（快照与状态） */
export class Store {
  readonly db: Database.Database;

  constructor(file: string) {
    mkdirSync(dirname(file), { recursive: true });
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT,
        ts INTEGER,
        type TEXT,
        payload TEXT
      );
      CREATE TABLE IF NOT EXISTS audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER,
        tool TEXT,
        params TEXT,
        status TEXT,
        result TEXT
      );
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);
  }

  insertEvent(eventId: string, ts: number, type: string, payload: unknown): void {
    this.db
      .prepare('INSERT INTO events (event_id, ts, type, payload) VALUES (?, ?, ?, ?)')
      .run(eventId, ts, type, JSON.stringify(payload));
  }

  kvGet(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  kvSet(key: string, value: string): void {
    this.db
      .prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, value);
  }

  audit(tool: string, params: unknown, status: 'confirmed' | 'rejected' | 'error', result: string): void {
    this.db
      .prepare('INSERT INTO audit (ts, tool, params, status, result) VALUES (?, ?, ?, ?, ?)')
      .run(Date.now(), tool, JSON.stringify(params), status, result.slice(0, 2000));
  }

  close(): void {
    this.db.close();
  }
}
