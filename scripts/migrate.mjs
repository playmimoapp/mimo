import { createClient } from '@libsql/client';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const url = process.env.TURSO_DATABASE_URL || 'file:local-mimo.db';
const client = createClient({
  url,
  authToken: process.env.TURSO_AUTH_TOKEN || undefined,
});
await client.execute(`CREATE TABLE IF NOT EXISTS mimo_migrations
  (name TEXT PRIMARY KEY NOT NULL, applied_at INTEGER NOT NULL)`);
const applied = await client.execute('SELECT name FROM mimo_migrations');
const completed = new Set(
  applied.rows.flatMap((row) =>
    typeof row.name === 'string' ? [row.name] : [],
  ),
);
const files = (await readdir('drizzle'))
  .filter((name) => name.endsWith('.sql'))
  .sort();
for (const name of files) {
  if (completed.has(name)) continue;
  const sql = await readFile(join('drizzle', name), 'utf8');
  const statements = sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((value) => value.trim())
    .filter((value) => value && !/^PRAGMA\s+optimize$/i.test(value));
  await client.batch(
    [
      ...statements.map((statement) => ({ sql: statement })),
      {
        sql: 'INSERT INTO mimo_migrations (name, applied_at) VALUES (?, ?)',
        args: [name, Date.now()],
      },
    ],
    'write',
  );
  console.log(`Applied ${name}`);
}
console.log('Database is ready.');
