import { Migration } from '@mikro-orm/migrations';

export class Migration20260725163127 extends Migration {
  override up(): void | Promise<void> {
    this.addSql(
      `create table "email_changes" ("id" uuid not null default gen_random_uuid(), "user_id" varchar(255) not null, "new_email" varchar(255) not null, "code" varchar(255) not null, "expires_at" timestamptz not null, "created_at" timestamptz not null, primary key ("id"));`,
    );

    this.addSql(`alter table "users" drop column "avatar";`);
    this.addSql(
      `alter table "users" add "hashed_refresh_token" varchar(255) null, add "avatar_url" varchar(255) null, add "avatar_key" varchar(255) null, add "is_system" boolean not null default false, add "is_active" boolean not null default true, add "is_email_verified" boolean not null default false, add "deleted" boolean not null default false, add "deleted_at" timestamptz null, add "created_at" timestamptz not null default now(), add "updated_at" timestamptz not null default now();`,
    );
    this.addSql(
      `alter table "users" add constraint "users_short_id_unique" unique ("short_id");`,
    );
    this.addSql(
      `alter table "users" add constraint "users_google_id_unique" unique ("google_id");`,
    );
    this.addSql(
      `alter table "users" add constraint "users_apple_id_unique" unique ("apple_id");`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "email_changes" cascade;`);

    this.addSql(`alter table "users" drop constraint "users_short_id_unique";`);
    this.addSql(
      `alter table "users" drop constraint "users_google_id_unique";`,
    );
    this.addSql(`alter table "users" drop constraint "users_apple_id_unique";`);
    this.addSql(
      `alter table "users" drop column "hashed_refresh_token", drop column "avatar_url", drop column "avatar_key", drop column "is_system", drop column "is_active", drop column "is_email_verified", drop column "deleted", drop column "deleted_at", drop column "created_at", drop column "updated_at";`,
    );
    this.addSql(`alter table "users" add "avatar" jsonb null;`);
  }
}
