CREATE TYPE "public"."currency" AS ENUM('TND', 'EUR');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending_payment', 'paid', 'fulfilled', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('new', 'contacted', 'done', 'declined');--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"admin_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" jsonb NOT NULL,
	"description" jsonb,
	"image" text,
	"visible" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "custom_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"country" text,
	"description" text NOT NULL,
	"dimensions" text,
	"budget" text,
	"references" text,
	"status" "request_status" DEFAULT 'new' NOT NULL,
	"admin_note" text,
	"locale" text DEFAULT 'fr' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" jsonb,
	"address" text NOT NULL,
	"city" text NOT NULL,
	"country" text DEFAULT 'Tunisie' NOT NULL,
	"phone" text,
	"hours" jsonb,
	"map_url" text,
	"image" text,
	"visible" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid,
	"ref" text NOT NULL,
	"title" text NOT NULL,
	"unit_minor" integer NOT NULL,
	"quantity" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"public_token" text NOT NULL,
	"status" "order_status" DEFAULT 'pending_payment' NOT NULL,
	"currency" "currency" NOT NULL,
	"subtotal_minor" integer NOT NULL,
	"shipping_minor" integer DEFAULT 0 NOT NULL,
	"total_minor" integer NOT NULL,
	"customer_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"country" text NOT NULL,
	"city" text NOT NULL,
	"address" text NOT NULL,
	"postal_code" text,
	"note" text,
	"locale" text DEFAULT 'fr' NOT NULL,
	"payment_provider" text,
	"payment_ref" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"image" text NOT NULL,
	"alt" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ref" text NOT NULL,
	"slug" text NOT NULL,
	"category_id" uuid NOT NULL,
	"title" jsonb NOT NULL,
	"description" jsonb,
	"material" jsonb,
	"technique" jsonb,
	"dimensions" text,
	"weight_grams" integer DEFAULT 1000 NOT NULL,
	"length_cm" integer DEFAULT 20 NOT NULL,
	"width_cm" integer DEFAULT 20 NOT NULL,
	"height_cm" integer DEFAULT 10 NOT NULL,
	"price_tnd" integer NOT NULL,
	"price_eur" integer NOT NULL,
	"stock" integer DEFAULT 1 NOT NULL,
	"unique" boolean DEFAULT false NOT NULL,
	"status" "product_status" DEFAULT 'draft' NOT NULL,
	"quote_only" boolean DEFAULT false NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_ref_unique" UNIQUE("ref"),
	CONSTRAINT "products_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "custom_requests_status_idx" ON "custom_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_payment_ref_idx" ON "orders" USING btree ("payment_ref");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_created_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "product_images_product_idx" ON "product_images" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "products_status_idx" ON "products" USING btree ("status");