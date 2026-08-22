import { Migration } from '@mikro-orm/migrations';

export class Migration20260725155908 extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "users" ("id" uuid not null default gen_random_uuid(), "short_id" varchar(255) not null, "role" text not null default 'owner', "first_name" varchar(255) not null, "last_name" varchar(255) null, "email" varchar(255) not null, "google_id" varchar(255) null, "apple_id" varchar(255) null, "password" varchar(255) null, "avatar" jsonb null, "business_id" varchar(255) null, primary key ("id"));`);
    this.addSql(`alter table "users" add constraint "users_email_unique" unique ("email");`);

    this.addSql(`alter table "users" add constraint "users_role_check" check ("role" in ('owner', 'admin', 'operator', 'sales'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "users" cascade;`);
  }

}
