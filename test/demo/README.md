# Demo videos

Tutorial videos for the studio, desktop (1440x900) and mobile (iPhone 14), French captions, optional voiceover. One
steps file per video in `videos/NN-sujet.json` is the single source for actions and captions.

```sh
brew install ffmpeg            # once (or point FFMPEG and FFPROBE at your binaries)
pnpm dev                       # api, web and dashboard on the demo data (pnpm demo:reset first, with pnpm dev stopped)
pnpm demo:videos               # every video, both devices
pnpm demo:videos -- 03         # one video
pnpm demo:videos -- 03 --device=mobile --zoom --voice
```

Output goes to `test/demo/out/videos/NN-sujet-desktop.mp4`, `NN-sujet-mobile.mp4`, plus `.fr.srt` and `.fr.vtt`
(`.ar.*` when every step has `caption_ar`). `out/` is gitignored: never commit a video.

Flags: `--voice` narrates every caption, `--zoom` eases the camera toward the clicked area, `--burn` burns the French
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

`--voice` reads each step's `caption_fr` aloud. `TTS_PROVIDER` is `elevenlabs` (default) or `say` (free macOS French
voice, `say -v Thomas`). ElevenLabs reads `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` and optional
`ELEVENLABS_MODEL_ID` (default `eleven_multilingual_v2`) from the environment, normally your local `.env`. Without a key
it falls back to `say` with a warning.

Every line is cached in `out/tts-cache/` by a hash of provider, voice, model and text, so a re-run only bills changed
lines; the run prints the characters billed. All lines are generated before the recording starts, and each step lasts at
least as long as its narration, so voice and screen stay in sync.

## Add a video

Copy `videos/03-connexion.json`, change `id`, `slug`, `title_fr` and the steps. A step has an `action`
(`goto click tap fill type select upload hover scroll press wait drag`), a Playwright-style `target` (`role`+`name`,
`label`, `text` or `testId`, never CSS), a required `caption_fr` (about 42 characters per line, two lines, vouvoiement),
and `only: "desktop" | "mobile"` for steps that differ. `{{ADMIN_EMAIL}}` style values read the environment. To change a
caption, edit the JSON and re-run that video.
