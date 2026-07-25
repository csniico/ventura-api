import { Migration } from '@mikro-orm/migrations';

export class Migration20260725194921 extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "appointments" ("id" uuid not null default gen_random_uuid(), "short_id" varchar(255) not null, "business_id" varchar(255) not null, "created_by" varchar(255) not null, "title" varchar(255) not null, "start" timestamptz not null, "end" timestamptz not null, "notes" varchar(255) null, "location" varchar(255) null, "invitees" jsonb not null default '[]', "recurrence" jsonb null, "status" text not null default 'scheduled', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), primary key ("id"));`);
    this.addSql(`alter table "appointments" add constraint "appointments_short_id_unique" unique ("short_id");`);
    this.addSql(`create index "appointments_business_id_index" on "appointments" ("business_id");`);

    this.addSql(`alter table "appointments" add constraint "appointments_status_check" check ("status" in ('scheduled', 'completed', 'attended', 'cancelled'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "appointments" cascade;`);
  }

}
