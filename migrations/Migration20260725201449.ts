import { Migration } from '@mikro-orm/migrations';

export class Migration20260725201449 extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "admins" ("id" uuid not null default gen_random_uuid(), "short_id" varchar(255) not null, "name" varchar(255) not null, "email" varchar(255) not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), primary key ("id"));`);
    this.addSql(`alter table "admins" add constraint "admins_short_id_unique" unique ("short_id");`);
    this.addSql(`alter table "admins" add constraint "admins_email_unique" unique ("email");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "admins" cascade;`);
  }

}
