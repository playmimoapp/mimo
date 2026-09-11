import {
  createClient,
  type Client,
  type InStatement,
  type InValue,
} from '@libsql/client';

type BoundValue = string | number | bigint | boolean | null | Uint8Array;

export type MimoRunResult = {
  success: true;
  meta: { changes: number; last_row_id?: number };
};

class MimoStatement {
  readonly sql: string;
  private args: InValue[] = [];

  constructor(
    private readonly client: Client,
    sql: string,
  ) {
    this.sql = sql;
  }

  bind(...values: BoundValue[]) {
    this.args = values.map((value) =>
      typeof value === 'boolean' ? (value ? 1 : 0) : value,
    ) as InValue[];
    return this;
  }

  toStatement(): InStatement {
    return { sql: this.sql, args: this.args };
  }

  async first<T = Record<string, unknown>>() {
    const result = await this.client.execute(this.toStatement());
    return (result.rows[0] as T | undefined) ?? null;
  }

  async all<T = Record<string, unknown>>() {
    const result = await this.client.execute(this.toStatement());
    return { results: result.rows as unknown as T[], success: true };
  }

  async run(): Promise<MimoRunResult> {
    const result = await this.client.execute(this.toStatement());
    return {
      success: true,
      meta: {
        changes: result.rowsAffected,
        ...(result.lastInsertRowid === undefined
          ? {}
          : { last_row_id: Number(result.lastInsertRowid) }),
      },
    };
  }
}

class MimoDatabase {
  constructor(private readonly client: Client) {}

  prepare(sql: string) {
    return new MimoStatement(this.client, sql);
  }

  async batch(statements: MimoStatement[]) {
    const results = await this.client.batch(
      statements.map((statement) => statement.toStatement()),
      'write',
    );
    return results.map((result) => ({
      success: true,
      results: result.rows,
      meta: { changes: result.rowsAffected },
    }));
  }
}

let database: MimoDatabase | null = null;

export function getD1() {
  if (database) return database;
  const url = process.env.TURSO_DATABASE_URL?.trim();
  if (!url && process.env.VERCEL) {
    throw new Error('TURSO_DATABASE_URL is unavailable.');
  }
  const client = createClient({
    url: url || 'file:local-mimo.db',
    authToken: process.env.TURSO_AUTH_TOKEN?.trim() || undefined,
  });
  database = new MimoDatabase(client);
  return database;
}
