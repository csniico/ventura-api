import { Migration } from '@mikro-orm/migrations'

/**
 * Per-code failed-attempt counter for passwordless sign-in (SEC-006).
 * Guessing a 6-digit code was bounded only by a per-IP throttle.
 */
export class Migration20261003120000 extends Migration {
  override up(): void | Promise<void> {
    this.addSql(
      `alter table "verification_codes" add column "attempts" int not null default 0;`,
    )
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "verification_codes" drop column "attempts";`)
  }
}
