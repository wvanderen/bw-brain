# bw-brain pi-pack

A [Pi](https://docs.openclaw.ai/) (OpenClaw) skill pack for **bw-brain** — a local-first intelligence layer for Bitwig Studio. **Superseded 2026-08-20 (CLAP-first rebaseline, RB-02): the hosted CLAP editor inside Bitwig is the primary producer surface — live-verified in Phase 04.2 — and Pi 0.84.0 is the daemon-managed headless reasoning runtime. This pack is no longer the primary UX; it remains a CLI-wrapping asset for alternate agents and headless workflows.** The stable contract it wraps is the `bw-*` CLI (D-12 — any coding agent or shell script can drive the same commands, files, and docs).

## Install

```bash
pi install ./pi-pack
```

The reasoning runtime is Pi 0.84.0, daemon-managed (exact integrity-locked dependency of the bw-brain daemon; the `pi install` flow above remains for the skill assets only). After install, `pi list` shows the `analyze` skill registered as the `/analyze` slash command (auto-registered via `user-invocable: true` in the SKILL.md frontmatter).

## Skills shipped (M1 — read-only context)

| Skill | Slash command | Ships in | What it does |
|-------|---------------|----------|--------------|
| `analyze` | `/analyze` | **M1 (this pack)** | Reads the selected Bitwig context via `bw-focus` + `bw-project` and produces an accurate description + 2-4 read-action next steps, every line carrying `assumptions[]`. No invented critique. |

### Landing in future milestones

| Skill | Slash command | Ships in |
|-------|---------------|----------|
| `vary` | `/vary` | M2 (Phase 3 — Reversible MIDI Patching) |
| `apply` | `/apply` | M2 (Phase 3 — Reversible MIDI Patching) |
| `review` | `/review` | M3 (Phase 4 — Arrangement Intelligence; superseded 2026-08-20: the producer-facing arrangement review flow is CLAP-native, see `docs/clap-product-support.md`) |
| `device` | `/device` | M4 (Phase 5 — Automation & Device Workflows; per the superseded UX-04 wording, device/automation workflows land in the CLAP workspace, not an external Pi pane — this skill remains a CLI-wrapping secondary asset) |

M1 scope is **read-only**: the assistant reliably understands and describes the selected Bitwig context. Editing, arrangement critique, and automation workflows land in their respective phases.

## CLI dependencies

The `/analyze` skill shells out to the stable `bw-brain` CLI (D-12 — Pi wraps the CLI; the CLI is the stable contract, not the agent). The `metadata.openclaw.requires.bins` frontmatter declares the binaries Pi needs on `PATH`:

- `bw-focus` — `bw-focus export --json` reads the selected track/clip/device + transport.
- `bw-project` — `bw-project summary --json` reads the windowed TrackBank + project metadata.

Additional read commands the skill suggests as next-actions (declared in the daemon's multicall bin; install via `npm link` in `daemon/`):

- `bw-midi inspect --json` — exact notes/velocity/timing of the selected clip.
- `bw-device inspect --json` — device chain + exposed parameters (incl. VST/AU).

All commands emit compact JSON, fail clearly, and carry `stateFreshness` (SC#3) + `assumptions[]` (UX-06) on every result.

## Dev workflow (hot reload)

Pi's `skills.load.watch: true` setting (verified OpenClaw convention) watches the installed pack's `SKILL.md` for edits and hot-reloads without restarting Pi. Edit `pi-pack/skills/analyze/SKILL.md`, save, and re-invoke `/analyze` in the same session to see the prompt change immediately.

## Guardrails encoded in the skill

The `/analyze` SKILL.md body encodes the M1 floor (D-10):

- **assumptions[] on every line + every next-action** (UX-06) — every claim is auditable from day one.
- **No invented critique** (Pitfall 7) — sections, motifs, track roles, energy levels, and automation salience are explicitly named as out-of-scope until Phases 3-5; the model is instructed not to invent them.
- **stateFreshness surfacing** (SC#3) — if `bw-focus` reports `stale` or `disconnected`, the skill surfaces it prominently and refuses to describe until live.
- **State pane shape** (D-11) — Track / Clip / Device + Transport, with Section reserved as em-dash (Phase 4 fills it).
