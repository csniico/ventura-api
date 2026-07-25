import { Migration } from '@mikro-orm/migrations';

export class Migration20260725202546 extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "mails" ("id" uuid not null default gen_random_uuid(), "short_id" varchar(255) not null, "to" varchar(255) not null, "from" varchar(255) not null, "subject" varchar(255) not null, "type" text not null, "status" text not null, "provider_id" varchar(255) null, "error" varchar(255) null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), primary key ("id"));`);
    this.addSql(`alter table "mails" add constraint "mails_short_id_unique" unique ("short_id");`);

    this.addSql(`create table "verification_codes" ("id" uuid not null default gen_random_uuid(), "email" varchar(255) not null, "code" varchar(255) not null, "expires_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), primary key ("id"));`);
    this.addSql(`create index "verification_codes_email_index" on "verification_codes" ("email");`);

    this.addSql(`alter table "mails" add constraint "mails_type_check" check ("type" in ('verification_code', 'welcome', 'existing_user_signin', 'password_change_requested', 'password_changed', 'account_deleted', 'invoice'));`);
    this.addSql(`alter table "mails" add constraint "mails_status_check" check ("status" in ('sent', 'failed'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "mails" cascade;`);
    this.addSql(`drop table if exists "verification_codes" cascade;`);
  }

}
