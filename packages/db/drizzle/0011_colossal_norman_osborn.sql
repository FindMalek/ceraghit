CREATE TYPE "public"."media_source" AS ENUM('bucket', 'bundled', 'external');--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"source" "media_source" DEFAULT 'bucket' NOT NULL,
	"filename" text NOT NULL,
	"original_name" text,
	"mime" text DEFAULT 'image/webp' NOT NULL,
	"bytes" integer DEFAULT 0 NOT NULL,
	"width" integer,
	"height" integer,
	"hash" text,
	"alt" jsonb,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"keep" boolean DEFAULT false NOT NULL,
	"confirmed_at" timestamp with time zone,
	"unused_since" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "image_media_id" uuid;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "image_media_id" uuid;--> statement-breakpoint
ALTER TABLE "product_images" ADD COLUMN "media_id" uuid;--> statement-breakpoint
ALTER TABLE "product_images" ADD COLUMN "is_main" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "product_images" ADD COLUMN "alt_text" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "media_hash_idx" ON "media" USING btree ("hash");--> statement-breakpoint
CREATE INDEX "media_created_idx" ON "media" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "media_filename_idx" ON "media" USING btree ("filename");--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_image_media_id_media_id_fk" FOREIGN KEY ("image_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_image_media_id_media_id_fk" FOREIGN KEY ("image_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_images_main_idx" ON "product_images" USING btree ("product_id") WHERE "product_images"."is_main";