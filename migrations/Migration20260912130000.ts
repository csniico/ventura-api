import { Migration } from '@mikro-orm/migrations';

export class Migration20260912130000 extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "resources" add column "base_unit" varchar(255) null, add column "units" jsonb not null default '[]';`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "resources" drop column "base_unit", drop column "units";`);
  }

}
