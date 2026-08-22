import { Migration } from '@mikro-orm/migrations';

export class Migration20260725184506 extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "resources" ("id" uuid not null default gen_random_uuid(), "short_id" varchar(255) not null, "business_id" varchar(255) not null, "type" text not null, "name" varchar(255) not null, "price" double precision not null, "primary_image" varchar(255) null, "primary_image_key" varchar(255) null, "supporting_images" jsonb not null default '[]', "supporting_image_keys" jsonb not null default '[]', "description" varchar(255) null, "notes" varchar(255) null, "available_quantity" int not null default 0, "low_stock_threshold" int not null default 5, "business_hours" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), primary key ("id"));`);
    this.addSql(`alter table "resources" add constraint "resources_short_id_unique" unique ("short_id");`);
    this.addSql(`create index "resources_business_id_index" on "resources" ("business_id");`);
    this.addSql(`create index "resources_type_index" on "resources" ("type");`);

    this.addSql(`alter table "resources" add constraint "resources_type_check" check ("type" in ('product', 'service'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "resources" cascade;`);
  }

}
