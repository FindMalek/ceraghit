CREATE TYPE "public"."site_image_slot" AS ENUM('hero', 'studio', 'process', 'logo', 'og-home', 'og-shop', 'og-atelier', 'og-custom', 'texture');--> statement-breakpoint
CREATE TABLE "site_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slot" "site_image_slot" NOT NULL,
	"media_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"alt" jsonb,
	"visible" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_images" ADD CONSTRAINT "site_images_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_images_slot_idx" ON "site_images" USING btree ("slot","position");