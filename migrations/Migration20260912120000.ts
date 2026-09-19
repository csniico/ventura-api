import { Migration } from '@mikro-orm/migrations';

export class Migration20260912120000 extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "stock_adjustments" ("id" uuid not null default gen_random_uuid(), "business_id" varchar(255) not null, "resource_id" varchar(255) not null, "delta" int not null, "reason" text not null, "balance_after" int not null, "note" varchar(255) null, "created_by" varchar(255) null, "created_at" timestamptz not null default now(), primary key ("id"));`);
    this.addSql(`create index "stock_adjustments_business_id_resource_id_index" on "stock_adjustments" ("business_id", "resource_id");`);
    this.addSql(`alter table "stock_adjustments" add constraint "stock_adjustments_reason_check" check ("reason" in ('opening_balance', 'order', 'order_cancel', 'restock', 'correction', 'manual'));`);

    // Seed one opening-balance row per existing product from its current stock,
    // so the ledger's history starts from the live quantity.
    this.addSql(`insert into "stock_adjustments" ("business_id", "resource_id", "delta", "reason", "balance_after", "created_at") select "business_id", "id", "available_quantity", 'opening_balance', "available_quantity", now() from "resources" where "type" = 'product';`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "stock_adjustments" cascade;`);
  }

}
