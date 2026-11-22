# Tutorial videos

The dashboard Help page (`/help`) is a searchable library of the tutorial videos. The catalogue (titles, tags, lengths,
areas) lives in `packages/sdk/src/tutorials.ts`. The video files never live in git: they sit in the storage bucket and
the page reads a manifest that says which ones exist.

## Files

Upload under the key prefix `tutorials/` (the api adds the environment prefix on previews, `pr-<n>/` or `staging/`):

| key | what |
| --- | --- |
| `tutorials/<id>-desktop.mp4` | desktop version (1440x900) |
| `tutorials/<id>-mobile.mp4` | phone version |
| `tutorials/<id>-desktop.vtt`, `tutorials/<id>-mobile.vtt` | French WebVTT captions, one per version |
| `tutorials/<id>.jpg` | poster, shared by both versions |
| `tutorials/manifest.json` | which of the above exist |

`<id>` is the catalogue id, for example `07-rechercher-produit`. The dashboard loads them through
`/api/files/<prefix>tutorials/...` (the api redirects to the CDN or a signed url).

Production files are H.264 `mp4` served as `video/mp4` with Range requests (R2 and Garage both support them), captions
are `text/vtt`, the poster a `jpg`. The dashboard CSP must allow the CDN or bucket origin in `media-src` (`buildCsp`
takes it from `S3_ENDPOINT` and `S3_PUBLIC_URL`, so the dashboard needs both variables).

### CORS on the bucket or CDN

The player sets `crossorigin="anonymous"` because Chromium only loads the French captions with it (measured: without the
attribute the caption track errors even when the bucket sends CORS headers). The consequence is that the video file is
fetched in CORS mode too. If the bucket or CDN has no CORS rule for the dashboard origin, **nothing plays at all**
(`The element has no supported sources`), not only the captions. Add this rule to the production R2 bucket and to the
preview Garage bucket before uploading videos: allowed origin = the dashboard origin only, methods `GET` and `HEAD`:

```json
{ "AllowedOrigins": ["https://dashboard.ceraghit.com"], "AllowedMethods": ["GET", "HEAD"], "MaxAgeSeconds": 3600 }
```

Garage answers a rule that lists several origins with the whole list in `Access-Control-Allow-Origin`, which browsers
refuse: use one rule per origin.

## Manifest

```json
{
  "videos": {
    "07-rechercher-produit": { "desktop": true, "mobile": true, "captions": true, "poster": true }
  }
}
```

A video appears as watchable when `desktop` or `mobile` is true. Unknown ids and malformed entries are ignored, and a
missing or unreadable manifest means "no videos yet": the page never errors. Videos marked `status: "soon"` in the
catalogue (feature not built yet) always show "Bientôt".

Publishing a video needs no deploy: upload its files, then add its line to `manifest.json`.

## Publishing per environment

Environments never mix. Preview uploads go to the homelab Garage bucket, production uploads go to the production R2
bucket, with the credentials of that environment only. Never commit an mp4.

Put the recorder output in one folder (`<id>-desktop.mp4`, `<id>-mobile.mp4`, `<id>-desktop.vtt`, `<id>-mobile.vtt`,
`<id>.jpg`, for example `~/ceraghit-videos/draft`) and run the uploader. It reads the bucket the way the api does
(`APP_ENV`, `DEPLOY_ENV`, `S3_*`), so the prefix is `pr-<n>/` on a preview, `staging/` on staging and empty otherwise.

```sh
# dry run first: prints what would be uploaded or skipped, writes nothing
pnpm tutorials:upload ~/ceraghit-videos/draft --dry-run

# local or preview: export that environment's S3_* (and APP_ENV, DEPLOY_ENV=pr-<n>), then
pnpm tutorials:upload ~/ceraghit-videos/draft

# production: export the production S3_* in this shell (never from a file in the repo), then
APP_ENV=production DEPLOY_ENV=production S3_ENDPOINT=... S3_BUCKET=ceraghit-prod S3_ACCESS_KEY_ID=... \
  S3_SECRET_ACCESS_KEY=... pnpm tutorials:upload:production ~/ceraghit-videos/draft --dry-run
# same command without --dry-run to publish
```

What it does:

- Only complete sets are uploaded and listed: a poster plus at least one device that has both its mp4 and its
  captions. Partial sets, unknown ids, empty files, files that are not really an mp4, WebVTT or jpeg, and files over the
  size limit (mp4 300 MB, vtt 512 KB, jpg 5 MB) are reported and skipped.
- Content types are `video/mp4`, `text/vtt`, `image/jpeg`, with `cache-control: public, max-age=86400`.
- Idempotent and resumable: an object with the same size (and the same md5 when the bucket etag is one) is skipped, so
  after a crash just run it again. `tutorials/manifest.json` is written last, merged with the videos already listed, and
  only when something changed. Per video it also records `bytes` and, when `ffprobe` is available (`FFPROBE=/path`),
  `seconds` per device; the page ignores those extra fields.
- Production is an allowlist: `--env production --confirm` (the `:production` script passes both and runs
  `bun --no-env-file`, so only the shell env counts and no env file is read), `APP_ENV=production`,
  `DEPLOY_ENV=production`, an R2 endpoint (`*.r2.cloudflarestorage.com`) and exactly the bucket `ceraghit-prod`
  (`TUTORIALS_PROD_BUCKET` if the production bucket has another name). Any other run refuses a bucket named
  `ceraghit-prod*`, an R2 endpoint or the `cdn.ceraghit.com` host. Secrets are never printed.
- An existing manifest that cannot be read stops the run before any upload (`--reset-manifest` replaces it). Devices
  already listed for a video stay listed, so a desktop-only folder does not unlist the mobile version.

## YouTube override

The "Liens YouTube" button on the Help page stores an optional YouTube link per video and device in
`settings.tutorials`. When set, the player shows the YouTube embed (youtube-nocookie) instead of the hosted file. Links
saved under the old 11 slots (`01` to `11`) are moved to the video that replaced the slot.

## Tests

`packages/orpc/test/tutorial-upload.test.ts` (uploader and environment guards, with an in-memory S3),
`packages/sdk/test/tutorials.test.ts` (catalogue, search, manifest), `apps/dashboard/test/tutorial-query.test.ts`
(url state) and `test/e2e/specs/dashboard/tutorials.e2e.ts`, which uploads a 2 second webm sample (Playwright's Chromium has no H.264) under the `.mp4` keys, from
`test/e2e/fixtures/tutorials` to the e2e bucket.
