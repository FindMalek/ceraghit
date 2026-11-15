-- Backfill media from the image strings of product_images, categories and locations. Idempotent, never deletes.
INSERT INTO "media" ("key", "source", "filename", "mime", "bytes", "alt", "confirmed_at")
SELECT
	s.key,
	CASE WHEN s.image LIKE 's3:%' THEN 'bucket'::media_source WHEN s.image LIKE '/%' THEN 'bundled'::media_source ELSE 'external'::media_source END,
	coalesce(nullif(lower(regexp_replace(regexp_replace(s.key, '[?#].*$', ''), '^.*/', '')), ''), 'image.webp'),
	coalesce(u.content_type, 'image/webp'),
	coalesce(u.bytes, 0),
	CASE WHEN s.alt IS NULL THEN NULL ELSE jsonb_build_object('fr', s.alt) END,
	now()
FROM (
	SELECT DISTINCT ON (key) key, image, alt FROM (
		SELECT CASE WHEN image LIKE 's3:%' THEN substr(image, 4) ELSE image END AS key, image, nullif(trim(alt), '') AS alt, 0 AS ord, position, id::text AS tie
			FROM "product_images" WHERE nullif(trim(image), '') IS NOT NULL
		UNION ALL
		SELECT CASE WHEN image LIKE 's3:%' THEN substr(image, 4) ELSE image END, image, NULL, 1, position, id::text
			FROM "categories" WHERE nullif(trim(image), '') IS NOT NULL
		UNION ALL
		SELECT CASE WHEN image LIKE 's3:%' THEN substr(image, 4) ELSE image END, image, NULL, 1, position, id::text
			FROM "locations" WHERE nullif(trim(image), '') IS NOT NULL
	) all_images
	ORDER BY key, (alt IS NULL), ord, position, tie
) s
LEFT JOIN "uploads" u ON u.key = s.key AND s.image LIKE 's3:%'
ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
UPDATE "product_images" pi SET "media_id" = m.id FROM "media" m
WHERE pi."media_id" IS NULL AND m.key = CASE WHEN pi.image LIKE 's3:%' THEN substr(pi.image, 4) ELSE pi.image END;--> statement-breakpoint
UPDATE "categories" c SET "image_media_id" = m.id FROM "media" m
WHERE c."image_media_id" IS NULL AND c.image IS NOT NULL AND m.key = CASE WHEN c.image LIKE 's3:%' THEN substr(c.image, 4) ELSE c.image END;--> statement-breakpoint
UPDATE "locations" l SET "image_media_id" = m.id FROM "media" m
WHERE l."image_media_id" IS NULL AND l.image IS NOT NULL AND m.key = CASE WHEN l.image LIKE 's3:%' THEN substr(l.image, 4) ELSE l.image END;--> statement-breakpoint
UPDATE "product_images" SET "alt_text" = jsonb_build_object('fr', trim(alt)) WHERE "alt_text" IS NULL AND nullif(trim(alt), '') IS NOT NULL;--> statement-breakpoint
UPDATE "product_images" pi SET "is_main" = true
FROM (
	SELECT DISTINCT ON (product_id) id FROM "product_images" ORDER BY product_id, position, id
) first
WHERE pi.id = first.id
	AND NOT EXISTS (SELECT 1 FROM "product_images" x WHERE x.product_id = pi.product_id AND x.is_main);
