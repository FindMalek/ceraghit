# Demo videos

Tutorial videos for the studio, desktop (1440x900) and mobile (iPhone 14), French captions, optional voiceover. One
steps file per video in `videos/NN-sujet.json` is the single source for actions and captions.

```sh
brew install ffmpeg            # once (or point FFMPEG and FFPROBE at your binaries)
pnpm dev                       # api, web and dashboard on the demo data (pnpm demo:reset first, with pnpm dev stopped)
pnpm demo:videos               # every video, both devices
pnpm demo:videos -- 03         # one video
pnpm demo:videos -- 03 --device=mobile --zoom --voice=draft
```

Output goes to `test/demo/out/videos/NN-sujet-desktop.mp4`, `NN-sujet-mobile.mp4`, plus `.fr.srt` and `.fr.vtt`
(`.ar.*` when every step has `caption_ar`). `out/` (videos only) is gitignored: never commit a video.

Flags: `--plan` prints the narration cost and exits, `--voice=draft|final` narrates (see Voiceover; bare `--voice` is draft), `--zoom` eases the camera toward the clicked area, `--burn` burns the French
captions into the picture (needs ffmpeg with libass), `--device=desktop|mobile`.

## Safety

`lib/guard.ts` refuses to run unless `APP_ENV=local`, the database host is `localhost`, `MAIL_REDIRECT_TO` is set and
the api's `/health` says the payment gateway is `demo:`. Fix your `.env`, never bypass it.

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
   characters (`NARRATION_MAX_LINE`) or a video over 700 spoken characters (`NARRATION_MAX_VIDEO`). Captions are free:
   the voice gives the point, the caption carries the details.
2. Draft pass: `pnpm demo:videos -- 03 --voice=draft`, fix wording and timing until it is right. Free.
3. Final pass: `pnpm demo:videos -- 03 --voice=final`. It refuses to start when the new (uncached) credits exceed what is
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

Copy `videos/03-connexion.json`, change `id`, `slug`, `title_fr` and the steps. A step has an `action`
(`goto click tap fill type select upload hover scroll press wait drag`), a Playwright-style `target` (`role`+`name`,
`label`, `text` or `testId`, never CSS), a required `caption_fr` (about 42 characters per line, two lines, vouvoiement),
and `only: "desktop" | "mobile"` for steps that differ (silent unless `voice: true`). `{{ADMIN_EMAIL}}` style values read the environment. To change a
caption, edit the JSON and re-run that video.
