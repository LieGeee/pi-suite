import { randomBytes, randomUUID, createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import initSqlJs, { type SqlJsStatic, type Database as SqlJsDatabase } from "sql.js";
import type { RelayStoredEnvelope } from "./protocol.js";

export interface RelayStoreOptions {
  readonly tokenSalt: string;
  readonly notificationRetention?: number;
}

export interface RelayPairing {
  readonly id: string;
  readonly label: string;
  readonly tokenHash: string;
  readonly createdAt: string;
  readonly revokedAt?: string;
}

export interface CreatedPairing {
  readonly id: string;
  readonly pairToken: string;
  readonly createdAt: string;
}

let sqlSingleton: Promise<SqlJsStatic> | undefined;

async function ensureSql(): Promise<SqlJsStatic> {
  if (!sqlSingleton) {
    sqlSingleton = initSqlJs();
  }
  return sqlSingleton;
}

export class RelayStore {
  private readonly notificationRetention: number;

  static async openMemory(options: RelayStoreOptions): Promise<RelayStore> {
    const store = new RelayStore(":memory:", options);
    await store.init();
    return store;
  }

  static async openFile(dbPath: string, options: RelayStoreOptions): Promise<RelayStore> {
    mkdirSync(dirname(dbPath), { recursive: true });
    const store = new RelayStore(dbPath, options);
    await store.init();
    return store;
  }

  private constructor(
    private readonly dbPath: string,
    private readonly options: RelayStoreOptions,
  ) {
    this.notificationRetention = Math.max(1, options.notificationRetention ?? 50);
  }

  private async init(): Promise<void> {
    const SQL = await ensureSql();
    let buffer: Buffer | undefined;
    if (this.dbPath !== ":memory:") {
      try {
        buffer = readFileSync(this.dbPath);
      } catch {
        // File doesn't exist yet, start fresh
      }
    }
    this.db = buffer ? new SQL.Database(buffer) : new SQL.Database();
    this.migrate();
  }

  private db!: SqlJsDatabase;

  [Symbol.dispose](): void {
    this.close();
  }

  close(): void {
    if (this.dbPath !== ":memory:") {
      const data = this.db.export();
      writeFileSync(this.dbPath, Buffer.from(data));
    }
    this.db.close();
  }

  createPairing(input: { readonly label?: string } = {}): CreatedPairing {
    const id = randomUUID();
    const pairToken = `pi_${randomBytes(24).toString("base64url")}`;
    const createdAt = new Date().toISOString();
    this.db.run(
      `insert into pairings (id, label, token_hash, created_at, revoked_at) values (?, ?, ?, ?, null)`,
      [id, input.label ?? "desktop", this.hashToken(pairToken), createdAt],
    );
    return { id, pairToken, createdAt };
  }

  verifyPairToken(pairToken: string): RelayPairing | undefined {
    const stmt = this.db.prepare(
      `select id, label, token_hash as tokenHash, created_at as createdAt, revoked_at as revokedAt
       from pairings where token_hash = ? and revoked_at is null`,
    );
    stmt.bind([this.hashToken(pairToken)]);
    let row: RelayPairing | undefined;
    if (stmt.step()) {
      row = stmt.getAsObject() as unknown as RelayPairing;
    }
    stmt.free();
    return row;
  }

  revokePairToken(pairToken: string): boolean {
    const stmt = this.db.prepare(
      `update pairings set revoked_at = ? where token_hash = ? and revoked_at is null`,
    );
    stmt.bind([new Date().toISOString(), this.hashToken(pairToken)]);
    stmt.step();
    const changes = this.db.getRowsModified();
    stmt.free();
    return changes > 0;
  }

  saveLatestSnapshot(pairingId: string, envelope: RelayStoredEnvelope): void {
    this.db.run(
      `insert into latest_snapshots (pairing_id, envelope_json, updated_at)
       values (?, ?, ?)
       on conflict(pairing_id) do update set envelope_json = excluded.envelope_json, updated_at = excluded.updated_at`,
      [pairingId, JSON.stringify(envelope), new Date().toISOString()],
    );
  }

  getLatestSnapshot(pairingId: string): RelayStoredEnvelope | undefined {
    const stmt = this.db.prepare(
      `select envelope_json as envelopeJson from latest_snapshots where pairing_id = ?`,
    );
    stmt.bind([pairingId]);
    let envelope: RelayStoredEnvelope | undefined;
    if (stmt.step()) {
      const row = stmt.getAsObject() as { envelopeJson: string };
      envelope = JSON.parse(row.envelopeJson) as RelayStoredEnvelope;
    }
    stmt.free();
    return envelope;
  }

  saveNotification(pairingId: string, envelope: RelayStoredEnvelope): void {
    this.db.run(
      `insert into notifications (id, pairing_id, envelope_json, created_at) values (?, ?, ?, ?)`,
      [randomUUID(), pairingId, JSON.stringify(envelope), new Date().toISOString()],
    );
    this.db.run(
      `delete from notifications
       where pairing_id = ? and id not in (
         select id from notifications where pairing_id = ? order by created_at desc, rowid desc limit ?
       )`,
      [pairingId, pairingId, this.notificationRetention],
    );
  }

  getRecentNotifications(pairingId: string): RelayStoredEnvelope[] {
    const stmt = this.db.prepare(
      `select envelope_json as envelopeJson from notifications where pairing_id = ? order by created_at asc, rowid asc`,
    );
    stmt.bind([pairingId]);
    const results: RelayStoredEnvelope[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as { envelopeJson: string };
      results.push(JSON.parse(row.envelopeJson) as RelayStoredEnvelope);
    }
    stmt.free();
    return results;
  }

  recordCommand(pairingId: string, commandId: string, command: string): boolean {
    try {
      this.db.run(
        `insert into command_log (pairing_id, command_id, command, created_at) values (?, ?, ?, ?)`,
        [pairingId, commandId, command, new Date().toISOString()],
      );
      return true;
    } catch (error) {
      if (isSqliteConstraint(error)) {
        return false;
      }
      throw error;
    }
  }

  findRawTokenLeak(rawToken: string): boolean {
    const escaped = `%${rawToken}%`;
    const tables = ["pairings", "latest_snapshots", "notifications", "command_log"] as const;
    for (const table of tables) {
      const stmt = this.db.prepare(`select * from ${table}`);
      stmt.bind([]);
      while (stmt.step()) {
        const row = stmt.getAsObject() as Record<string, unknown>;
        const serialized = JSON.stringify(row);
        if (serialized.includes(escaped) || serialized.includes(rawToken)) {
          stmt.free();
          return true;
        }
      }
      stmt.free();
    }
    return false;
  }

  hashPairToken(pairToken: string): string {
    return this.hashToken(pairToken);
  }

  private hashToken(pairToken: string): string {
    return createHash("sha256").update(this.options.tokenSalt).update("\0").update(pairToken).digest("hex");
  }

  private migrate(): void {
    this.db.run("PRAGMA journal_mode = WAL");
    this.db.run(`create table if not exists pairings (
      id text primary key,
      label text not null,
      token_hash text not null unique,
      created_at text not null,
      revoked_at text
    )`);
    this.db.run(`create table if not exists latest_snapshots (
      pairing_id text primary key,
      envelope_json text not null,
      updated_at text not null,
      foreign key(pairing_id) references pairings(id) on delete cascade
    )`);
    this.db.run(`create table if not exists notifications (
      id text primary key,
      pairing_id text not null,
      envelope_json text not null,
      created_at text not null,
      foreign key(pairing_id) references pairings(id) on delete cascade
    )`);
    this.db.run(`create table if not exists command_log (
      pairing_id text not null,
      command_id text not null,
      command text not null,
      created_at text not null,
      primary key(pairing_id, command_id),
      foreign key(pairing_id) references pairings(id) on delete cascade
    )`);
  }
}

function isSqliteConstraint(error: unknown): boolean {
  return error instanceof Error && /constraint/i.test(error.message);
}
