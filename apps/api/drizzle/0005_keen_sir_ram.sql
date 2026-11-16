CREATE TABLE "merchant_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "openid_hash" text;--> statement-breakpoint
ALTER TABLE "wifi_configs" ADD COLUMN "short_id" text DEFAULT replace(gen_random_uuid()::text, '-', '') NOT NULL;--> statement-breakpoint
ALTER TABLE "wifi_configs" ADD COLUMN "spot_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "wifi_configs" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "merchant_sessions" ADD CONSTRAINT "merchant_sessions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "merchant_sessions_expiry_idx" ON "merchant_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "merchant_sessions_owner_idx" ON "merchant_sessions" USING btree ("merchant_id");--> statement-breakpoint
UPDATE wifi_configs w SET short_id = q.scene_token FROM (
  SELECT DISTINCT ON (wifi_id) wifi_id, scene_token FROM qr_codes
  WHERE wifi_id IS NOT NULL ORDER BY wifi_id, (status = 'active') DESC, generated_at DESC, id DESC
) q WHERE w.id = q.wifi_id;
--> statement-breakpoint
CREATE UNIQUE INDEX "wifi_configs_short_id_uidx" ON "wifi_configs" USING btree ("short_id");--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_openid_hash_unique" UNIQUE("openid_hash");
