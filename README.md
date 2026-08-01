# School Partnerships Agent (Yomnita · multi-product)

School GTM agent: live web research → scored dossier → personalized outreach (email + WhatsApp) with a human review gate + reject-and-redo feedback loop → 7-touch follow-up plan with distinct angles and auto stop-conditions → meeting brief → post-meeting summary → per-school pitch deck → MOU drafted from a clause library.

**Platformised:** everything product-specific lives in `kits/<name>/` — switch the active kit in the header and the same pipeline sells a different product (ships with `yomnita` and a demo `lit-school` kit).

## Run

```bash
cd gtm-agent
python3 -m venv venv && venv/bin/pip install -r requirements.txt
venv/bin/uvicorn app:app --port 8010
```

Open http://localhost:8010

## Configure

- `.env` — `OPENROUTER_API_KEY=...` (required), `OPENROUTER_MODEL=...` (optional, default `anthropic/claude-sonnet-4.5`)
- `kits/<name>/brand_kit.md` — product truth; every AI output pulls from this. **Edit the marked lines before the demo.**
- `kits/<name>/voice.md` — the sender's personal writing-style guide (paste your real messages). Anti-generic guardrail: every draft and revision must obey it.
- `kits/<name>/scoring.json` — the ICP note + 4 qualification dimensions used to score schools (per product).
- `kits/<name>/followup_angles.json` — the 7 follow-up angle definitions.
- `kits/<name>/mou_template.md` — the org's MOU clause library; `{{PLACEHOLDERS}}` get filled per school.

## Personalisation parameters (what shapes every outreach)

school dossier (board, fee band, strength, programs, news, hooks) × target persona (Principal / Correspondent / Exam-cell / Events) × funnel stage (status + follow-ups sent) × sender voice (voice.md) × angle library × brand kit. The generated drafts carry a "🎛️ Personalisation parameters" panel showing exactly what was used.

## What's real vs. simulated

- **Real:** web search (DuckDuckGo, keyless) + scraping the school's actual website; all AI generation via OpenRouter; the pipeline tracker; CSV export; wa.me / mailto open real drafts in WhatsApp/your mail client.
- **Simulated:** the school's reply (button) and the meeting transcript (pasted) — sending is deliberately draft-only behind the human review gate, per the brief's MVP.
