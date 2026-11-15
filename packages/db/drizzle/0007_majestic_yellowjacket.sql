CREATE TABLE "invoice_counters" (
	"year" integer PRIMARY KEY NOT NULL,
	"last" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"number" text NOT NULL,
	"year" integer NOT NULL,
	"seq" integer NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seller" jsonb NOT NULL,
	CONSTRAINT "invoices_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "invoices_number_unique" UNIQUE("number")
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_year_seq_idx" ON "invoices" USING btree ("year","seq");