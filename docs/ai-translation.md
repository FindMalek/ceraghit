# AI translation

Missing English and Arabic texts are drafted from the French through Groq, with the Vercel AI SDK (`ai`, `@ai-sdk/groq`).
Shared pieces live in `packages/orpc/src/lib/translate`:

- `models.ts`: the models the dashboard may use, their prices (USD per 1M tokens), `DEFAULT_AI_MODEL`,
  `FALLBACK_AI_MODEL` (used on 429/5xx) and `DEFAULT_REASONING_EFFORT`
- `prompt.ts`: `buildTranslatePrompt`, the `KEEP` list (brand names and catalogue refs, never translated), the ceramics
  `GLOSSARY` and the strict output schema
- `score.ts`: the scorers the eval uses

## Model

Default `openai/gpt-oss-120b` with reasoning effort `low`, fallback `openai/gpt-oss-20b`. Both are Groq production
models with strict `json_schema` output. Why:

- Llama 3.x on Groq is shut down for the developer tier (2026-08-16), so it is not listed
- preview models (`qwen/qwen3.8-27b` and others) can be removed at short notice, so they are eval columns only, never
  a default, and they cost about 6x more on output
- the gpt-oss model card gives 120b low 75.0 (Arabic) and 79.6 (French) on MMMLU, 20b low 65.6 and 73.2

There is no public translation benchmark for gpt-oss in Arabic, so the eval below decides. **Status: the eval has not
been run with a real key yet.** The default stays 120b low until the results are posted on the GitHub issue. If Arabic
slips (script, glossary, round trip), switch `DEFAULT_REASONING_EFFORT` to `medium`.

## Running the eval

```sh
export GROQ_API_KEY=...   # never commit it, the script never prints it
bun scripts/translate-eval.ts                     # 120b low, 120b medium, 20b low
bun scripts/translate-eval.ts --with-preview      # adds qwen/qwen3.8-27b
bun scripts/translate-eval.ts --limit 10 --models openai/gpt-oss-20b
bun scripts/translate-eval.ts --with-reference    # human en/ar next to the model output for 5 samples
```

Samples: 10 fixed ceramics sentences (`scripts/translate-eval.fixtures.ts`) plus 20 real strings read at runtime from
the seed catalogue (titles, every description, materials, techniques) and `apps/web/messages/fr.json`. Each sample is
translated fr→en+ar in one call, then each output is translated back to French.

The table goes to the terminal and to `scripts/out/translate-eval-<date>.md` (gitignored). Columns:

| column | meaning |
| --- | --- |
| ok / fail | answers that parsed against the schema / calls that failed or did not parse |
| len median, len ±25% | output length over French length, and the share within ±25% |
| keep | share of `KEEP` names and refs (like `CG-112`) found verbatim |
| ar script | Arabic answers with no Latin words (outside `KEEP` and units) and only Western digits |
| max len | answers within the field limit (3000 for descriptions) |
| glossary | ceramics terms in the source rendered with the agreed word |
| round trip | share of French content words recovered by the back translation |
| p50/p95, tokens, cost | latency per call, tokens summed, cost from the prices in `models.ts` |

Calls run one after another with a short pause, and the SDK retries 429 and 5xx with backoff. A full run (30 samples,
3 columns, about 270 calls) costs a few cents.

## Changing the model

Change `DEFAULT_AI_MODEL` / `DEFAULT_REASONING_EFFORT` in `models.ts` to change the default for everyone. The translate
procedure will also read an owner setting (Groq key and model in the dashboard vault) and the `GROQ_MODEL` env as a
fallback; only ids in `AI_MODELS` are accepted there.

## Cost per product

A typical product (title, description, material, technique) is about 1.2k tokens for fr→en+ar, around 500 in and 700
out with low reasoning: about $0.0005 on 120b and $0.00025 on 20b. The whole 300-product catalogue is about $0.25 on 120b.
