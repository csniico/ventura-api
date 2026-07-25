import { Migration } from '@mikro-orm/migrations';

export class Migration20260725190752 extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "orders" ("id" uuid not null default gen_random_uuid(), "order_number" varchar(255) not null, "business_id" varchar(255) not null, "customer_id" varchar(255) not null, "customer_name" varchar(255) not null, "customer_email" varchar(255) null, "customer_phone" varchar(255) null, "items" jsonb not null, "total_amount" double precision not null default 0, "status" text not null default 'pending', "invoice_id" varchar(255) null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), primary key ("id"));`);
    this.addSql(`alter table "orders" add constraint "orders_order_number_unique" unique ("order_number");`);
    this.addSql(`create index "orders_business_id_index" on "orders" ("business_id");`);
    this.addSql(`create index "orders_customer_id_index" on "orders" ("customer_id");`);
    this.addSql(`create index "orders_invoice_id_index" on "orders" ("invoice_id");`);

    this.addSql(`alter table "orders" add constraint "orders_status_check" check ("status" in ('pending', 'completed', 'cancelled'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "orders" cascade;`);
  }

}
