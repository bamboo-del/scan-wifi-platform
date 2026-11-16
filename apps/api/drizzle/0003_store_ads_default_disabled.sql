ALTER TABLE "stores" ALTER COLUMN "ad_enabled" SET DEFAULT false;
UPDATE "stores" SET "ad_enabled" = false WHERE "ad_enabled" = true;
