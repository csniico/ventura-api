import { Migration } from '@mikro-orm/migrations';

export class Migration20260725192603 extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "invoices" ("id" uuid not null default gen_random_uuid(), "invoice_number" varchar(255) not null, "business_id" varchar(255) not null, "order_ids" jsonb not null default '[]', "customer_id" varchar(255) null, "customer_name" varchar(255) null, "customer_email" varchar(255) null, "customer_phone" varchar(255) null, "invoice_type" text not null default 'STANDARD', "subtotal" double precision not null, "vat_rate" double precision not null default 0.15, "vat_amount" double precision not null, "nhil_rate" double precision not null default 0.025, "nhil_amount" double precision not null, "getfund_rate" double precision not null default 0.025, "getfund_amount" double precision not null, "total_tax" double precision not null, "total_amount" double precision not null, "amount_paid" double precision not null default 0, "status" text not null default 'DRAFT', "payment_method" text null, "payment_date" timestamptz null, "issue_date" timestamptz null, "due_date" timestamptz null, "sent_at" timestamptz null, "notes" varchar(255) null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), primary key ("id"));`);
    this.addSql(`alter table "invoices" add constraint "invoices_invoice_number_unique" unique ("invoice_number");`);
    this.addSql(`create index "invoices_business_id_index" on "invoices" ("business_id");`);
    this.addSql(`create index "invoices_customer_id_index" on "invoices" ("customer_id");`);

    this.addSql(`alter table "invoices" add constraint "invoices_invoice_type_check" check ("invoice_type" in ('STANDARD', 'PROFORMA', 'RECEIPT'));`);
    this.addSql(`alter table "invoices" add constraint "invoices_status_check" check ("status" in ('DRAFT', 'SENT', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'CANCELLED'));`);
    this.addSql(`alter table "invoices" add constraint "invoices_payment_method_check" check ("payment_method" in ('CASH', 'MOBILE_MONEY', 'BANK_TRANSFER', 'CARD', 'CHEQUE'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "invoices" cascade;`);
  }

}
