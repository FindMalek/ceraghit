CREATE TABLE "uploads" (
	"key" text PRIMARY KEY NOT NULL,
	"folder" text NOT NULL,
	"content_type" text NOT NULL,
	"bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unused_since" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "uploads_unused_idx" ON "uploads" USING btree ("unused_since");