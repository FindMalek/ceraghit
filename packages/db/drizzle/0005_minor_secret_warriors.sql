CREATE TABLE "shop_profile" (
	"id" text PRIMARY KEY DEFAULT 'shop' NOT NULL,
	"legal_name" text,
	"display_name" text,
	"legal_form" text,
	"tax_id" text,
	"registry_number" text,
	"address" text,
	"postal_code" text,
	"city" text,
	"country" text DEFAULT 'TN' NOT NULL,
	"phones" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"email" text,
	"notify_email" text,
	"bank_holder" text,
	"bank_name" text,
	"bank_rib" text,
	"bank_iban" text,
	"bank_bic" text,
	"invoice_note" jsonb,
	"shipping_confirmed_at" timestamp with time zone,
	"skipped_steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"onboarded_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admins" ADD COLUMN "name_confirmed_at" timestamp with time zone;