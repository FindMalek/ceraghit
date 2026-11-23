# Demo videos

Tutorial videos for the studio, desktop (1440x900) and mobile (iPhone 14), French captions, optional voiceover. One
steps file per video, named after its catalogue id (`videos/34-se-connecter.json`, `id` and `slug` match `packages/sdk/src/tutorials.ts`),
is the single source for actions and captions.

```sh
brew install ffmpeg            # once (or point FFMPEG and FFPROBE at your binaries)
pnpm dev                       # api, web and dashboard on the demo data (pnpm demo:reset first, with pnpm dev stopped)
pnpm demo:videos               # every video, both devices
pnpm demo:videos -- 34         # one video
pnpm demo:videos -- 34 --device=mobile --zoom --voice=draft
```

Output goes to `test/demo/out/videos/NN-sujet-desktop.mp4`, `NN-sujet-mobile.mp4`, plus `.fr.srt` and `.fr.vtt`
(`.ar.*` when every step has `caption_ar`). `out/` (videos only) is gitignored: never commit a video.

Flags: `--plan` prints the narration cost and exits, `--voice=draft|final` narrates (see Voiceover; bare `--voice` is draft), `--zoom` eases the camera toward the clicked area, `--burn` burns the French
captions into the picture (needs ffmpeg with libass), `--device=desktop|mobile`.

## Safety

`lib/guard.ts` refuses to run unless `APP_ENV=local`, the database host is `localhost`, `MAIL_REDIRECT_TO` is set and
the api's `/health` says the payment gateway is `demo:`. Fix your `.env`, never bypass it.

A hung recording fails instead of waiting: page actions time out after 10 s, navigations after 15 s, a video after 180 s (the error names the step), and a finished video longer than 120 s, or more than twice its steps, fails the run. The video ends about a second after the last narration. Journeys that read the mail catcher (23, 24) use `{{MAILPIT_URL}}`: set `MAILPIT_URL` to your stack's Mailpit UI, for example `http://localhost:8061`.

## Recording backend (spike)

Compared on the login page, 20 s, desktop and mobile:

1. Playwright `recordVideo`: WebM VP8, low fixed bitrate, recorded at CSS pixels (no 2x), soft text.
2. Chromium CDP `Page.startScreencast` (jpeg quality 90, every second frame) piped to ffmpeg, constant 30 fps by repeating each frame for
   its own timestamp, H.264 crf 18. Keeps 2x device pixels, headless, deterministic. **Chosen.**
3. `ffmpeg -f avfoundation`: needs Screen Recording permission and a visible window, not tried.

Mobile runs the iPhone 14 viewport, user agent and touch on Chromium, so the same backend works. Results are in the PR.

## Voiceover

`--voice=draft` (or bare `--voice`) reads captions with the free macOS French voice (`say -v Thomas`) so pacing and
wording can be reviewed at zero cost. Only `--voice=final` calls ElevenLabs; it needs `ELEVENLABS_API_KEY` and
`ELEVENLABS_VOICE_ID` in your local `.env` and refuses to run without them. `ELEVENLABS_MODEL_ID` defaults to
`eleven_flash_v2_5` (supports French, 0.5 credit per character); set `eleven_multilingual_v2` (1 credit) for the
richer voice. The cache key includes the model, so lines cached with another model are generated again.

Lines are cached in `~/.cache/ceraghit-demo/tts` (`TTS_CACHE_DIR` overrides) by a hash of provider, voice, model and text. All lines are generated before
recording starts, and each step lasts at least as long as its narration, so voice and screen stay in sync.

### Budget workflow

The tutorial budget is limited (`ELEVENLABS_CREDIT_BUDGET`, default 29000 credits, about 58000 flash characters).

1. `pnpm demo:videos -- --plan` (dry run, no network): per video the unique spoken lines, characters, how many are
   already cached or shared with an earlier video (both cost 0), credits at the model's rate, and the budget left. It warns on a spoken line over 140
   characters (`NARRATION_MAX_LINE`) or a video over 450 spoken characters (`NARRATION_MAX_VIDEO`). Captions are free:
   the voice gives the point, the caption carries the details.
2. Draft pass: `pnpm demo:videos -- 34 --voice=draft`, fix wording and timing until it is right. Free.
3. Final pass: `pnpm demo:videos -- 34 --voice=final`. It refuses to start when the new (uncached) credits exceed what is
   left, naming the numbers. Any edit to a line is a new line and costs again, so finish drafts first.

One voice-over serves both devices: the narration script is the video's ordered steps, and desktop and mobile play the
same clip for the same step (a line is billed once, even across videos). A step with `only` gets its caption on that
device but no voice, unless it has `"voice": true`, which gives it its own paid line. `CREDIT_PER_CHAR` must be above 0 and can only raise the model's rate, never lower it (unknown models count 1 and the
plan says so). An invalid `ELEVENLABS_CREDIT_BUDGET` (`-5`, `29,000`) is an error, not the default.

The ledger and the cache are shared by every checkout, so they live outside the repo: the ledger in
`~/.config/ceraghit/demo/credits.json` (`ELEVENLABS_LEDGER` overrides), the cache above, both private to your user.
The ledger holds counts and dates only, never text or keys, and is updated after every billed line, so Ctrl-C or a
failure keeps the record. A final run holds a lock on it for the whole pass, so two final runs cannot both pass the gate
on stale numbers. A corrupt ledger stops the run; fix or delete it. Limit: only spend made by this tool is counted, so
characters used elsewhere on the account (the ElevenLabs site, other tools) are not in the ledger; check the real
balance on your account before a big final pass.

## Add a video

Copy `videos/34-se-connecter.json`, change `id`, `slug`, `title_fr` and the steps. A step has an `action`
(`goto click tap fill type select upload hover scroll press wait drag`), a Playwright-style `target` (`role`+`name`,
`label`, `text` or `testId`, never CSS), a required `caption_fr` (about 42 characters per line, two lines, vouvoiement),
and `exact: true` on a target to match the whole name (`Adresse` against `Adresse e-mail`), and `only: "desktop" | "mobile"` for steps that differ (silent unless `voice: true`). `{{ADMIN_EMAIL}}` style values read the environment. A desktop-only video sets `"devices": ["desktop"]`.
Only visible matches are used, so a table row and its mobile card never clash. A step that changes data (ship, cancel) needs a
different record on each device, with two `only` steps sharing one caption (a shared line is billed once), because both
devices run on the same database; re-seed before a second take. To change a caption, edit the JSON and re-run that video.

## Hard to film states

Extra step actions for what a plain click cannot show. All of them act on the recorded browser only.

| Action | `value` | Use |
| --- | --- | --- |
| `ip` | `203.0.113.7` (a documentation address: `192.0.2.x`, `198.51.100.x`, `203.0.113.x`) | Sends that address as the visitor address from now on, so the 5 failed attempts per address lockout (and the 10 per email one, with a few addresses and a made up email) can be filmed without locking the recorder out. Refused unless the web and dashboard urls are loopback. No api switch is needed: the limiter reads the forwarded address, as the e2e fixtures already do. Use a made up email for the lockouts, never the admin one. |
| `country` | `BE` (two capital letters) | Sends `x-vercel-ip-country` from now on, as the host does, so a first visit is priced in euros (the shop has no currency switch). The currency is remembered in a cookie: `clear-cookies`, `country`, then `goto`. Loopback only. |
| `press` | `Tab`, `Enter`, or `text:Amel` to type that text into the focused field | Keyboard only journeys. |
| `clear-cookies` | none | Signed out visitor: film the session expired message by clicking anything after it. |
| `back` | none | Browser back, for the page after a logout. |
| `network` | `slow 4000 **/api/**`, `status 500 **/api/**`, `reason 409 out_of_stock **/api/**` (the api's own error shape with a public reason, so the page shows its translated message: a simulated answer, say so in the PR), `fail **/api/**`, `reset` | Loading skeletons (`slow`, then `goto`), error banners and pages (`status`, `fail`). The glob must start with `**/`. `reset` before the next scene. |
| `download` | none (the `target` is the button) | Clicks, keeps the file in `out/downloads/<video>/` and shows it over the page: a table for a CSV, the first page for a PDF (needs `pdftoppm`, otherwise a card with the name, size and page count). The card goes away at the next step. |

`upload` reads from `out/assets/`, generated at every run (PNG by a tiny encoder, WebP through ffmpeg when it has libwebp, nothing committed):
`photo-1.png`, `photo-2.png`, `photo-3.png`, `photo-1.webp`, `photo-2.webp`, `banner-1.png`, `banner-1.webp`, and `not-an-image.txt` for the wrong file type message.

Seeded for these (`packages/db/src/seed/scenario.ts`, demo data only): 222 orders, so `Afficher plus de commandes` shows (the page is 200, not 50; the 170 older ones are `CER-11000` and up, over 60 days old, so the default period keeps its numbers); `CER-10100` (gateway mismatch then automatic cancel), `CER-10007` (late payment), `CER-10095` (released after the hold); `CER-10101` shipped by Rapid-Poste with a tracking number (`Modifier le suivi`, no parcel card); 12 draft or archived products (`08xx`, 42 in the list, `Voir plus de produits`); 5 customer requests, one per status plus a second new. The `Démo` label is the history line of any order paid by transfer (no admin name). An empty period: the export dialogs accept any dates, for instance 2020.

## Email and setup journeys (81 to 99)

Journeys that open Mailpit use an absolute url in a `goto` step (`http://localhost:8025`, or the port of your stack). Run
`bun prepare.ts` once on a fresh seed first: through the api only, it places a card, a cash on delivery, a transfer, an arabic
and a Payoneer order, confirms one payment, ships one order and sends a unique piece request, so the mails exist.
`bun prepare.ts expiry` places a transfer order, ages it past its 7 days and runs `/cron/release-holds`, for the cancellation
mail of video 89. It also writes `out/demo-pay-url.txt` (the checkout url of an unpaid order), read as `{{DEMO_PAY_URL}}` by
video 97. It needs `API_URL`, `CRON_SECRET`, `DATABASE_URL` and the admin login of the stack, and refuses anything that is
not local demo data.

Every device needs a fresh state (both write to the same database), so reseed between takes. 93, 94 start from an empty
profile (`bun src/seed-cli.ts --onboarding` in `packages/db`); 95 and 96 from the same seed with the required steps done
(95 also with the shipping rates not confirmed); 81 and 82 from an onboarded shop whose legal profile and bank account are blank.
