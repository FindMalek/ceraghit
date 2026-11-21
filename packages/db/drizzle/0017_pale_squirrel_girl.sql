CREATE TYPE "public"."shipment_status" AS ENUM('created', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'exception', 'returned', 'on_hold', 'cancelled');--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"environment" text NOT NULL,
	"waybill" text NOT NULL,
	"product_group" text NOT NULL,
	"product_type" text NOT NULL,
	"status" "shipment_status" DEFAULT 'created' NOT NULL,
	"cod_amount_minor" integer,
	"insurance_minor" integer,
	"currency" "currency" NOT NULL,
	"weight_grams" integer NOT NULL,
	"pieces" integer DEFAULT 1 NOT NULL,
	"label_key" text,
	"label_url" text,
	"commercial_invoice_key" text,
	"pickup_id" text,
	"pickup_guid" text,
	"last_event" jsonb,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_polled_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shipments_waybill_idx" ON "shipments" USING btree ("provider","waybill");--> statement-breakpoint
CREATE INDEX "shipments_order_idx" ON "shipments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "shipments_status_idx" ON "shipments" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "shipments_active_order_idx" ON "shipments" USING btree ("order_id") WHERE "shipments"."status" <> 'cancelled';