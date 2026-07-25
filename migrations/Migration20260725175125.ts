import { Migration } from '@mikro-orm/migrations';

export class Migration20260725175125 extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "businesses" ("id" uuid not null default gen_random_uuid(), "short_id" varchar(255) not null, "name" varchar(255) not null, "owner_id" varchar(255) not null, "categories" jsonb not null default '[]', "description" varchar(255) null, "tag_line" varchar(255) null, "logo" varchar(255) null, "logo_key" varchar(255) null, "email" varchar(255) null, "phone" varchar(255) null, "website" varchar(255) null, "address" varchar(255) null, "city" varchar(255) null, "state" varchar(255) null, "country" varchar(255) null, "tax_id" varchar(255) null, "registration_number" varchar(255) null, "business_hours" jsonb null, "socials" jsonb not null default '{}', "is_active" boolean not null default true, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), primary key ("id"));`);
    this.addSql(`alter table "businesses" add constraint "businesses_short_id_unique" unique ("short_id");`);
    this.addSql(`create index "businesses_owner_id_index" on "businesses" ("owner_id");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "businesses" cascade;`);
  }

}
