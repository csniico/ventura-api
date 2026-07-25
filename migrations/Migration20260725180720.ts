import { Migration } from '@mikro-orm/migrations';

export class Migration20260725180720 extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "customers" ("id" uuid not null default gen_random_uuid(), "short_id" varchar(255) not null, "business_id" varchar(255) not null, "name" varchar(255) not null, "email" varchar(255) null, "phone" varchar(255) null, "notes" varchar(255) null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), primary key ("id"));`);
    this.addSql(`alter table "customers" add constraint "customers_short_id_unique" unique ("short_id");`);
    this.addSql(`create index "customers_business_id_index" on "customers" ("business_id");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "customers" cascade;`);
  }

}
