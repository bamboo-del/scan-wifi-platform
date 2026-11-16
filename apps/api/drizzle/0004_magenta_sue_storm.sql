ALTER TYPE "public"."connection_event_type" ADD VALUE 'scan' BEFORE 'ad_load_success';--> statement-breakpoint
ALTER TYPE "public"."connection_event_type" ADD VALUE 'password_copy' BEFORE 'ad_load_success';--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"contact" text,
	"status" "store_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "qr_codes_one_active_per_store_uidx";--> statement-breakpoint
DROP INDEX "wifi_configs_store_id_uidx";--> statement-breakpoint
ALTER TABLE "connection_events" ADD COLUMN "wifi_id" uuid;--> statement-breakpoint
ALTER TABLE "connection_events" ADD COLUMN "visitor_hash" text;--> statement-breakpoint
ALTER TABLE "qr_codes" ADD COLUMN "wifi_id" uuid;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "merchant_id" uuid DEFAULT '11111111-1111-4111-8111-111111111111' NOT NULL;--> statement-breakpoint
INSERT INTO "merchants" ("id", "name") VALUES ('11111111-1111-4111-8111-111111111111', '默认商户');--> statement-breakpoint
UPDATE "qr_codes" q SET "wifi_id" = w.id FROM "wifi_configs" w WHERE q.store_id = w.store_id;--> statement-breakpoint
UPDATE "connection_events" e SET "wifi_id" = w.id FROM "wifi_configs" w WHERE e.store_id = w.store_id;--> statement-breakpoint
CREATE UNIQUE INDEX "wifi_configs_store_id_id_uidx" ON "wifi_configs" USING btree ("store_id","id");--> statement-breakpoint
ALTER TABLE "connection_events" ADD CONSTRAINT "connection_events_store_id_wifi_id_wifi_configs_store_id_id_fk" FOREIGN KEY ("store_id","wifi_id") REFERENCES "public"."wifi_configs"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_codes" ADD CONSTRAINT "qr_codes_store_id_wifi_id_wifi_configs_store_id_id_fk" FOREIGN KEY ("store_id","wifi_id") REFERENCES "public"."wifi_configs"("store_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "connection_events_wifi_date_idx" ON "connection_events" USING btree ("wifi_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "qr_codes_one_active_per_wifi_uidx" ON "qr_codes" USING btree ("wifi_id") WHERE "qr_codes"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "qr_codes_legacy_active_per_store_uidx" ON "qr_codes" USING btree ("store_id") WHERE "qr_codes"."status" = 'active' and "qr_codes"."wifi_id" is null;--> statement-breakpoint
CREATE INDEX "stores_merchant_id_idx" ON "stores" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "wifi_configs_store_id_idx" ON "wifi_configs" USING btree ("store_id");--> statement-breakpoint
