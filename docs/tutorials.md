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
bucket, with the credentials of that environment only. Record in `APP_ENV=local`, then upload the recorder output
(`mp4`, `vtt`, `jpg`) with the S3 client of the target environment (for example `aws s3 cp --endpoint-url <endpoint>`),
and upload `manifest.json` last so the page never points at a missing file. Never commit an mp4.

## YouTube override

The "Liens YouTube" button on the Help page stores an optional YouTube link per video and device in
`settings.tutorials`. When set, the player shows the YouTube embed (youtube-nocookie) instead of the hosted file. Links
saved under the old 11 slots (`01` to `11`) are moved to the video that replaced the slot.

## Tests

`packages/sdk/test/tutorials.test.ts` (catalogue, search, manifest), `apps/dashboard/test/tutorial-query.test.ts`
(url state) and `test/e2e/specs/dashboard/tutorials.e2e.ts`, which uploads a 2 second webm sample (Playwright's Chromium has no H.264) under the `.mp4` keys, from
`test/e2e/fixtures/tutorials` to the e2e bucket.
