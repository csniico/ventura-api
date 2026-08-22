import { SQL } from 'bun';
import type { Config } from './config';

/**
 * Thin Postgres accessor used ONLY to read the passwordless sign-in code that
 * the API writes to `verification_codes` (the automation has no other way to
 * learn the emailed code). Uses Bun's built-in SQL client — no npm dependency.
 */
export class Db {
  private sql: SQL;

  constructor(config: Config) {
    this.sql = new SQL({ url: config.pg.url });
  }

  /** Latest verification code for an email, or null if none is stored. */
  async readLatestCode(email: string): Promise<string | null> {
    const rows = (await this.sql`
      SELECT code
      FROM verification_codes
      WHERE email = ${email}
      ORDER BY created_at DESC
      LIMIT 1
    `) as Array<{ code: string }>;
    return rows.length ? rows[0].code : null;
  }

  async close(): Promise<void> {
    await this.sql.end();
  }
}
