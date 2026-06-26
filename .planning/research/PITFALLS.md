# Pitfalls Research

**Domain:** Local-first DAW intelligence layer (Bitwig bridge → TypeScript daemon → CLI → Pi/OpenClaw UX)
**Researched:** 2026-06-25
**Confidence:** HIGH (Bitwig API limits, version coupling, JSON-Lines, OpenClaw session model all cross-checked against primary sources: `bitwig/bitwig-extensions`, `git-moss/DrivenByMoss`, mossgrabers.de, jsonlines.org, docs.openclaw.ai). Bitwig public-API behavioral specifics (undo grouping, stable IDs, threading) are MEDIUM — derived from the well-established community API surface, not a fetched javadoc, because the official scripting guide ships only in-app.

---

## Critical Pitfalls

Critical = a single pitfall can kill trust, wreck a project, or force a rewrite. Order is by how early each can bite.

### Pitfall 1: Designing an edit surface the Bitwig API can't actually fulfill

**What goes wrong:**
The roadmap assumes the assistant can "add notes", "scale velocities in this clip", "remove these notes", "write automation on this parameter", "duplicate this section". When implementation starts, half of these turn out to be impossible or require a contorted cursor-navigation dance: there is no `clipById("clip_19").addNote(...)` in the public `com.bitwig.extension.controller.api` surface. Note editing goes through a `CursorClip` that must be navigated to the target clip first; banks (`TrackBank`, `ParameterBank`, `DrumPadBank`) are fixed-size *paged* views you cannot fully enumerate; there is no arbitrary arranger clip create/move/delete; automation write during playback is gated by host touch/latch/write modes the extension does not own.

**Why it happens:**
The Bitwig scripting guide and API reference are **not published on the web** — they ship only in-app under Help → Documentation → Developer Resources (a recurring complaint: bitwig/bitwig-extensions issue #53 "Where is the Scripting Guide?"). Planners design against a mental model of "a DAW object graph" rather than the cursor/bank reality. The seed's JSON examples (`clipId: "clip_19"`, `target: "clip_19"` in `insert_notes`) read like stable references but the API has nothing to resolve those IDs against.

**How to avoid:**
- In M1 Phase 1, before writing any patch-schema field, **build a capability probe**: a throwaway extension that enumerates exactly which operations the targeted Bitwig version exposes (can a `CursorClip` reach an arbitrary clip? can it `addNote`/`toggleNote`/`setStep`? can `Parameter.setValue` write automation while stopped? while playing?). Record results in `docs/bitwig-capabilities.md`.
- Design the patch schema **bottom-up from the probe**, not top-down from musical intent. Every `operations[].type` must map 1:1 to a verified API call. Unknown-but-needed operations become explicit "not yet supported" stubs, never silent no-ops.
- Treat the patch's `scope.clipIds`/`trackIds` as **daemon-side intent**, not API handles. The bridge translates each into the cursor-navigation sequence required (select track → move cursor clip → perform op) and reports back which targets it could and could not reach.
- Maintain a **stable-ID synthesis layer in the daemon** (see Pitfall 3) — do not ask the API for IDs it cannot give.

**Warning signs:**
- Patch schema references "clip 19 by ID" before anyone has run `getChannelType()` / cursor-clip experiments.
- A demo "works" only because the user manually selected the right clip first (cursor was already there).
- Bridge code grows a sprawling switch on operation types that mostly return `unsupported`.
- "It works on a fresh project but breaks on my real 80-track techno file" (paging wasn't tested at scale).

**Phase to address:**
M1, Phase 1 (bridge capability probe) — this is the **single highest-risk item** in the whole project. The roadmap must reserve a phase whose deliverable is the capability matrix, not a user-facing feature.

---

### Pitfall 2: No stable persistent IDs — the entire state model rots on every edit

**What goes wrong:**
The seed explicitly requires the bridge to "provide stable IDs per observed object where possible". The public Bitwig API **does not expose stable GUIDs** for tracks, clips, devices, or scenes. You get the current cursor position and names. When a user adds, deletes, reorders, or renames a track, or drags a clip, the daemon's `state-cache.json` (`trk_5`, `clip_19`, `dev_2`) becomes silently wrong: `trk_5` now points at a different track, motif signatures point at the wrong clip, patch-history references no-longer-existing objects, track-role assignments drift onto the wrong instrument.

**Why it happens:**
"Provide stable IDs" is written as a bridge responsibility but the bridge cannot fulfill it alone — the API gives indices-in-paged-banks and names, both of which mutate. The phrase "where possible" hides the fact that it's almost never possible without a synthesis layer.

**How to avoid:**
- **Synthesize stable IDs in the daemon** from a fingerprint tuple the API *can* provide: `(track-name, track-position, device-chain-hash, clip-name, clip-length-beats, first-note-pitch-histogram)`. Store the mapping in `roles.json` keyed by fingerprint. When a fingerprint matches a known ID on next snapshot, reuse the ID; when it shifts, run a small reconciliation step (did the name stay but position move? → track moved; did position stay but fingerprint change? → clip edited, keep ID).
- **Never persist raw index-based references.** Patch-history.jsonl entries must record fingerprints + the human name at apply time, so a future "undo" can re-resolve the target even if indices changed.
- Emit a `state.reconciled` event with explicit `added`/`removed`/`moved`/`identity_preserved` lists every time the daemon's reconciliation runs, so analyzers can invalidate derived state cleanly instead of trusting stale IDs.
- **Document the failure mode in the user-facing guardrails doc**: "If you rename + reorder + delete many tracks at once, bw-brain may lose track of which is which; it will tell you and ask for confirmation rather than guess."

**Warning signs:**
- Track roles "stick" to the wrong track after the user reorders.
- Patch preview shows the right diff but apply hits the wrong clip.
- `roles.json` grows duplicate entries for the same logical track.
- Motif signatures match nothing after a clip is duplicated and edited.

**Phase to address:**
M1, Phase 2 (state normalization) — define the fingerprint + reconciliation contract **before** any analyzer depends on IDs. M3 revisits when section detection needs cross-clip references.

---

### Pitfall 3: "Every patch gets an undo label" — the API won't let you keep that promise as written

**What goes wrong:**
The guardrails list "every applied patch gets an undo label" as a hard rule. The Bitwig public API does **not expose custom undo labels or undo grouping** (`beginUndoGroup`/`endUndoGroup`/`setUndoLabel` are not in the surface). The host's `undo()`/`redo()` step the host's own undo stack one entry at a time; you cannot name that entry. A multi-operation patch that the daemon considers one logical edit ("add answer phrase") can land in Bitwig's history as several separate undo steps, or as one auto-grouped step with a generic label like "Controller Script". The user hits Cmd-Z and gets half the patch reverted, or sees a meaningless label.

**Why it happens:**
The guardrail was written from the user-trust side (good instinct) without checking the API surface. The "undo label" in the seed's protocol example (`"undoLabel": "bw-brain: subtle variation"`) is a *daemon concept*, not a Bitwig concept.

**How to avoid:**
- **Redefine the promise honestly**: "Every applied patch is recorded in bw-brain's own patch-history with a label, a before/after diff, and a recipe to reverse it; Bitwig's native Cmd-Z may not collapse multi-op patches into one step, so bw-brain provides `bw-edit revert <patchId>` as the authoritative undo."
- Keep the daemon-side patch-history.jsonl as the **source of truth for reversibility**; treat Bitwig's undo as best-effort. Document this prominently — hiding it would itself be a trust violation.
- Where the API does group operations (test this in the M1 capability probe), batch operations so the host groups them naturally. Where it doesn't, the `revert` path must be tested as rigorously as `apply`.
- Never ship a UX (Pi `/apply`) that implies "Cmd-Z will cleanly undo this" without a caveat when the patch is multi-op.

**Warning signs:**
- Demo shows "apply patch → Cmd-Z → fully reverted" but only because the demo patch happened to be a single API op.
- Patch-history.jsonl labels don't match what the user sees in Bitwig's Edit menu.
- User reports "I undid but the clip is half-changed."

**Phase to address:**
M2, Phase 1 (patch schema + reversibility) — bake the honest reversibility contract into the schema and the CLI `bw-edit revert` flow before any creative transform is built.

---

### Pitfall 4: Extension reload / Bitwig restart silently drops the bridge and corrupts in-flight edits

**What goes wrong:**
Bitwig fully tears down and re-creates an extension on reload (Preferences → reload) and on Bitwig restart — there is no warm reload. If the daemon has a pending `apply.patch` request in flight, or has sent a batch of operations and is waiting for `ok`, the extension vanishes mid-operation. Outcomes: partial patch applied with no completion ack (patch-history records it as failed but Bitwig got half of it), daemon queues more edits to a dead socket, daemon's state-cache diverges from Bitwig reality, and on extension re-init the daemon doesn't know whether to re-send or treat as applied.

**Why it happens:**
The bridge lifecycle is "dumb mirror" but dumb mirrors still need explicit lifecycle semantics. Reload is a normal debugging step during M1 development, so this will hit constantly before it ever hits a user.

**How to avoid:**
- Treat every bridge connection as **stateless and reconciliation-based**, not session-based. On connect, the daemon requests a full snapshot and reconciles against `state-cache.json` (same path as Pitfall 2's reconciliation).
- Give every `apply.patch` request a **durable idempotency key** (`patchId`) that the bridge persists *inside Bitwig's project state if the API allows* or at minimum acks with `applied`/`already-applied`/`unknown` semantics. On reconnect, the daemon replays outstanding patches and trusts the bridge's `already-applied` answer.
- **Never block the apply flow on a stateful session**: each patch is a self-contained request that can be retried safely. Operations must be idempotent where possible (insert-by-fingerprint, not insert-by-position) and order-independent within a patch.
- A watchdog: if the bridge is silent >N seconds, the daemon marks itself `stale`, all `bw-*` commands return a clear "bridge disconnected — showing last-known state from <timestamp>" instead of pretending to be live.

**Warning signs:**
- After reloading the extension, `bw-focus export` returns the pre-reload selection.
- Patch-history shows a patch as `pending` forever after a reload.
- Two copies of the same note appear after a reconnect replay.
- Daemon log shows writes to a socket that closed seconds ago.

**Phase to address:**
M1, Phase 3 (bridge reliability) — define the connection lifecycle, idempotency keys, and reconciliation-on-connect **before** M2 introduces any apply flow.

---

### Pitfall 5: Controller-thread callbacks stall all controllers and the host UI

**What goes wrong:**
Bitwig invokes extension callbacks on a single controller thread shared across all loaded controller extensions. If the bw-brain bridge does heavy work in a callback — serializing a full snapshot, walking a device chain, computing a hash for the ID fingerprint — it blocks DrivenByMoss (the user's Push/APC/Launchpad controller) and Bitwig's own controller-driven UI updates. The user's hardware controller goes sluggish or dead whenever bw-brain is active. Worse: an uncaught exception in a callback can disable the extension (and sometimes destabilize the host) for the session.

**Why it happens:**
Java makes it easy to do "real work" inline; the controller-thread constraint isn't called out in the API surface, only in the scripting guide the developer has to read in-app.

**How to avoid:**
- **Strict off-thread discipline in the bridge**: callbacks only enqueue work onto a single-writer background thread (a `BlockingQueue` + worker) whose output is the JSON-Lines socket. The callback returns in microseconds. Document this as a hard bridge rule.
- Snapshot serialization, ID hashing, diff computation all happen on the worker thread, never on the callback thread.
- **Catch `Throwable` in every callback** and route the error to a `bridge.error` frame; never let an exception escape into Bitwig's controller dispatch.
- Load-test with DrivenByMoss also installed (it will be, on the target machine) so contention is real from day one.

**Warning signs:**
- User reports their Launchpad "freezes" when bw-brain runs.
- Bitwig's own UI lags during `bw-focus export`.
- Bridge log shows callback durations >5ms.
- Extension silently disabled after an error with no `bridge.error` frame emitted.

**Phase to address:**
M1, Phase 3 (bridge reliability) — the off-thread rule is a day-one architectural constraint, documented in `bitwig-bridge/` README and enforced in code review.

---

### Pitfall 6: Trust death by "casino MIDI" — creative transforms before read-only accuracy

**What goes wrong:**
The seed names this explicitly: "Before [accurate], it's just casino MIDI." The trap is shipping a flashy `/vary` that produces three plausible-looking variants on a clean demo clip, then watching it silently wreck a real bass motif because the motif-signature layer wasn't trustworthy yet, or because the transform's "preserve motif identity" mode was a stub. The user loses five minutes of careful sequencing, never trusts the tool again, and the project reputation is set.

**Why it happens:**
Creative output demos well; accuracy doesn't. Pressure (internal or external) to "show something cool" pulls effort toward transforms before the read-only context layer is solid. The guardrail "every transform has a preserve motif identity mode" is easy to stub with `mode: preserve` that does nothing.

**How to avoid:**
- **Sequencing gate, enforced in the roadmap**: no `bw-midi vary` / `bw-midi counterline` ships until M1's read-only layer has a measured accuracy bar (e.g., "for 20 representative clips, the assistant's description matches a human's >90% of the time, and `bw-diff` round-trips 100% of the time").
- Motif-signature must be **failure-aware, not confidence-theatre**: a `motif_match` confidence below threshold means the transform refuses and says "I can't identify the motif here, so I won't vary it" — never proceeds with a guess.
- The "preserve motif identity" mode is not a flag; it's an enforced invariant: before applying, the daemon recomputes the motif signature on the *post-patch* state and aborts if it drifted beyond a bound. This invariant has its own tests.
- Default every transform to **refuse rather than guess**. "I'm 60% sure" → "I won't edit."

**Warning signs:**
- `/vary` produces output on the first clip it's tried on, regardless of how unusual the clip is.
- No test exists where a transform correctly *refuses* to vary.
- Motif signature tests are green but only test happy-path clips.
- Demos use simple 4-on-the-floor; real techno basslines break it.

**Phase to address:**
M1 hard gate before M2 begins. M2 Phase 1 implements motif-preservation as an invariant with refusal semantics, not a feature.

---

### Pitfall 7: Multi-track / scope-escape edits silently leak past the patch boundary

**What goes wrong:**
A patch declares `scope.trackIds: ["trk_5"], clipIds: ["clip_19"]` but an operation like `voice-leading-fix` transitively touches notes referenced from another clip, or an automation proposal writes to a send that affects multiple tracks, or the cursor-based edit dance (Pitfall 1) leaves the cursor on a different clip and the next operation lands there. The user approved a scoped edit; the apply mutated more than they saw in the preview.

**Why it happens:**
Scope is declared in the patch object but enforced nowhere, or enforced only at the daemon's logical layer while the bridge's cursor-navigation has side effects on other objects. Voice-leading and counterline are inherently relational and can pull in out-of-scope material.

**How to avoid:**
- **Enforce scope at three layers**: (1) schema validation rejects patches whose operation targets fall outside declared scope; (2) the bridge refuses any operation whose resolved cursor target is outside the scope fingerprint set; (3) post-apply, the daemon recomputes the actual diff and the patch is rejected/recording-aborted if the diff includes any out-of-scope change.
- The `bw-diff` output must show **scope.touched** vs **scope.declared** explicitly; any divergence is a hard error, not a warning.
- Multi-track patches are **high risk class by definition** (per the seed's risk classes) and require explicit confirmation *with the full cross-track diff visible*.
- Automation proposals target a single `(device, parameter)` tuple; writing to a send counts as multi-track and gets the high-risk flow.

**Warning signs:**
- Patch preview and post-apply diff differ.
- A voice-leading fix changes notes the user didn't see in preview.
- `scope.touched` is never surfaced in the UI.
- Tests only ever use single-track patches.

**Phase to address:**
M2, Phase 2 (scope enforcement + diff verification). Reinforced every time a new transform type is added (M2 counterline, M4 automation).

---

### Pitfall 8: JSON-Lines IPC partial frames and backpressure corrupt state silently

**What goes wrong:**
JSON Lines (jsonlines.org) requires each line to be a *complete* JSON value terminated by `\n`. Common failure modes: the bridge writes a half-serialized snapshot, crashes, and the daemon's reader sees a malformed line; the daemon writes a `apply.patch` frame larger than the socket buffer and blocks while the bridge is mid-callback; a reader using naive `readLine()` blocks forever on a partial last line; `\r\n` works but a lone `\r` breaks parsing; a stray BOM at the start of a stdio relay corrupts the first frame. Backpressure manifests as the daemon queueing patches "successfully" to a socket the bridge will read seconds later, reordering edits relative to transport events.

**Why it happens:**
Newline-delimited JSON looks trivially simple, so the failure modes get skipped in design. Atomic line writes, framing on partial reads, and version-field-per-message are disciplines, not defaults.

**How to avoid:**
- **Every frame carries its own `v` (protocol version) and `id`** inside the JSON, not in a handshake header. Readers reject or negotiate on version mismatch explicitly — never silently downgrade.
- **Write each line atomically**: build the full JSON string + `\n` in a buffer, write with one `write()`, flush. Never write a frame in pieces.
- **Read with a partial-line buffer**: only parse a line once the terminating `\n` is observed; leftover bytes stay buffered for the next read. Never block on a `readLine` that may return a partial.
- **Backpressure is explicit**: daemon maintains a bounded outbound queue per connection; when full, `apply.patch` requests return `throttled` rather than queueing indefinitely. The Pi UX shows "bridge busy" instead of accepting more edits.
- **Message ordering is per-channel**: events (`selection.changed`) are independent and may be lossy (keep last); requests (`get.*`, `apply.*`) are ordered and must be acked. Never reuse a request id until its ack arrives or the connection reconciles.
- Use `\n` only (strip `\r`), no BOM, UTF-8 enforced at the encoder.

**Warning signs:**
- Daemon log shows JSON parse errors on the bridge socket.
- First frame after process start never decodes (BOM).
- Patches apply out of order under load.
- `bw-*` commands hang intermittently when the user is rapidly switching clips.

**Phase to address:**
M1, Phase 2 (protocol design) — the framing/version/backpressure rules are written into `bitwig-bridge/protocol/messages.md` and schema before the first real message flows.

---

### Pitfall 9: `state-cache.json` corruption and `patch-history.jsonl` unbounded growth

**What goes wrong:**
`state-cache.json` is written on every snapshot; a crash mid-write (power loss, kill -9, OS update reboot) leaves a truncated or half-written file that won't parse on next launch — the daemon can't start, or worse, starts from empty and loses the durable project memory the user trusted. Separately, `patch-history.jsonl` is append-only and grows without bound; a year of daily composing produces a multi-hundred-MB file that slows every `bw-edit` / `bw-diff` / `roles.json` reconciliation until the tool is unusable. A schema migration (new field on every patch, renamed operation type) breaks every old line and the daemon refuses to load history.

**Why it happens:**
OpenClaw's own session docs (docs.openclaw.ai/reference/session-management-compaction) document exactly this class of problem: append-only transcripts need explicit `pruneAfter`/`maxEntries`/`maxDiskBytes` retention, mutable stores need atomic writes, and schema migration needs a versioned, tolerant reader. bw-brain inherits all of it.

**How to avoid:**
- **Atomic writes for `state-cache.json`**: write to `state-cache.json.tmp` then `rename()` (atomic on POSIX). Never truncate-and-write in place.
- **Schema-versioned files**: every durable file starts with a `schemaVersion` field (or for JSONL, every line carries one). Readers are tolerant: unknown fields are preserved on rewrite, unknown operation types are skipped with a logged warning, never fatal.
- **Rotation + retention for `patch-history.jsonl`**: cap at N entries or M MB; on overflow, roll to `patch-history.<date>.jsonl` and keep a configurable number of archives (mirror OpenClaw's `pruneAfter: 30d`, `maxEntries: 500` defaults). The current file stays small.
- **Migration script**, not migration-on-load: a `bw-migrate` command upgrades old caches explicitly, with `--dry-run`, writes a backup first, and is idempotent.
- **Crash recovery**: on startup, if `state-cache.json` fails to parse, the daemon refuses to start with a clear error pointing at the backup; it never silently initializes empty (that would be a trust violation — the user thinks their memory is intact).

**Warning signs:**
- `state-cache.json` is valid JSON but missing the last snapshot (silent partial write).
- `patch-history.jsonl` is >50MB.
- After an upgrade, old patches no longer parse.
- Daemon "loses" project memory after a force-quit.

**Phase to address:**
M1, Phase 4 (durable storage) for atomic writes + schema versioning. M2 adds the rotation/retention once patches actually flow. A dedicated `bw-migrate` is owned by every milestone that changes a schema.

---

### Pitfall 10: Over-confident analysis heuristics presented as fact

**What goes wrong:**
Section detection labels bars 96-128 as "build" with `confidence: 0.74` and the Pi `/analyze` skill reports it as `"build"` with no hedging. Track-role classifier says `trk_5` is `"lead"` at `0.71` and downstream transforms treat it as ground truth. The energy curve flattens a busy 32-bar drop into one number and the review skill says "energy is fine here." Automation salience flags `filter_cutoff` as the thing to automate when the musically important movement is on a send. These compound: a wrong role → a wrong motif signature → a wrong "preserve identity" check → a transform that ruins the clip.

**Why it happens:**
Heuristics always have a number; the temptation is to surface the number as confidence and then drop the confidence when formatting for the user. Genre assumptions ("kick is on the downbeat", "lead is the loudest highest-pitched track") sneak into a "generic" core because the first profile is electronic/techno.

**How to avoid:**
- **Every derived claim carries its confidence to the user, not just internally.** The CLI emits `confidence` in JSON by default; the Pi skill renders it ("section: build (74%)") and explicitly hedges below a threshold ("I'm not sure — could be a pre-build or a breakdown").
- **Below threshold = refuse, don't guess.** A section below 0.5 is reported as "unlabeled" not averaged into the nearest label.
- **Genre profile is the only place genre assumptions live.** The generic core must run end-to-end on a profile that has *no* genre assumptions (a null profile) and produce only structural facts (repetition, density, event counts), with musical labels added by the profile. Test the null profile every release — if it emits "kick", that's a bug.
- **Automation salience needs disambiguation**, not a single score: report candidate targets ranked, never a single "the" target.
- Analysis modules ship with **adversarial test fixtures** (a track that breaks the kick-on-downbeat assumption, a lead that isn't the highest pitch) and the tests assert the module hedges or refuses on them.

**Warning signs:**
- CLI JSON has `confidence` but Pi skills strip it in rendering.
- A single "best" automation target is proposed without alternatives.
- Generic core contains the words "kick", "bass", or "downbeat".
- No test fixture exists where the analyzer is expected to say "I don't know."

**Phase to address:**
M3 (arrangement intelligence) and M4 (automation) — but the **confidence-on-the-wire contract** is established in M1's schema so later modules can't strip it.

---

### Pitfall 11: CLI contract drift — prose in stdout, ambiguous exit codes, version skew

**What goes wrong:**
The seed mandates "compact JSON, clear failures, no prose unless `--explain`." In practice: a developer adds a helpful `console.log("Analyzing…")` that lands in stdout ahead of the JSON and breaks the parser; an error path writes a human message to stdout and exits 0; a warning goes to stderr (good) but a diagnostic goes to stdout (bad); a new `bw-midi` subcommand adds a field without bumping a CLI version and the Pi skill that parses it silently misreads old output. The "stable interface is the CLI, not the agent" promise erodes.

**Why it happens:**
Discipline is hard; review is uneven; the contract is implicit. Mario Zechner's "What if you don't need MCP at all?" makes the counter-case concrete: a focused README-as-contract is ~225 tokens and composable, where bloated tool descriptions break composability — *but only if the contract is actually honored*. Any prose leak re-introduces the brittleness the CLI-first stance was meant to avoid.

**How to avoid:**
- **One JSON object to stdout, nothing else.** All logging, progress, and human text goes to stderr. `--explain` is the only flag that allows prose *inside* the JSON (`{"explain": "..."}`), never alongside it.
- **Exit code contract, documented and tested**: `0` = success with JSON on stdout; `2` = usage error; `3` = bridge/daemon not reachable; `4` = partial state (stale cache); `5` = refused (e.g., motif not identified, scope violation); `>0` never emits a JSON success.
- **Every command emits `cliVersion` and `protocolVersion` in its JSON.** The Pi skill asserts compatibility on first call per session and fails loudly on mismatch instead of misreading.
- **Schema-validated output in CI**: a test runs every `bw-*` command against fixtures and asserts the output validates against the command's output schema. A prose leak fails CI.
- **Contract tests are executable**: `examples/` contains input→expected-output pairs; any change to output shape breaks a test.

**Warning signs:**
- A `console.log` appears in a `cli/` source file.
- Two commands disagree on whether errors go to stdout or stderr.
- A Pi skill works for one user (latest daemon) and silently fails for another (older daemon).
- No schema file exists for command output, only for input.

**Phase to address:**
M1, Phase 5 (CLI contract + command-contracts.md) — established before any skill consumes the output. Reinforced every phase via CI schema validation.

---

### Pitfall 12: Pi package hides the CLI contract — skills and TUI panes drift from daemon state

**What goes wrong:**
Skills are written as prose instructions ("run `bw-focus export`, then summarize") that drift from the actual CLI contract as the CLI evolves. A skill tells the agent to read a field that no longer exists, or to interpret a confidence as a certainty. Worse: a TUI pane caches `state-cache.json` at session start and renders stale track names after the user reorders tracks in Bitwig — the pane says one thing, `bw-focus export` says another, and the user can't tell which is true. OpenClaw's session docs are explicit that the Gateway is the source of truth and that UIs reading local files instead of querying the Gateway reflect nothing real.

**Why it happens:**
Skills are markdown, easy to write and easy to forget to update. TUI panes that re-query on every render feel slow, so developers cache — and caching without invalidation drifts. The ephemeral-vs-durable memory split (session memory vs `.bw-brain/`) means some state genuinely *should* be ephemeral, which makes the caching boundary fuzzy.

**How to avoid:**
- **Skills are generated from the CLI contract, not hand-written against it.** A codegen step reads `command-contracts.md` (or the output schemas) and emits skill skeletons with the *actual* field names, exit codes, and `--explain` semantics. Hand-editing happens on top of generated scaffolding, with a regeneration check in CI.
- **TUI panes re-query on focus and on explicit refresh, never trust a stale cache for an interactive decision.** Cache is for rendering; a "live" indicator must mean "queried within the last N seconds." OpenClaw's model applies directly: the daemon is the Gateway; the TUI pane queries it, it does not read `state-cache.json` directly for anything the user might act on.
- **Session memory flushes to durable memory before reset**: hook the Pi session's daily/idle reset boundary (OpenClaw documents this) so candidate patches and in-progress experiment threads are written to `.bw-brain/session/` before the ephemeral context is lost.
- **Skill version pinning**: each skill declares the `cliVersion`/`protocolVersion` it was authored against; on load it checks the daemon and warns if mismatched.

**Warning signs:**
- A skill references a field name that hasn't existed for two releases.
- TUI shows a track that was deleted in Bitwig minutes ago.
- After a `/new` session reset, candidate patches from the prior session vanish.
- Skill prose and CLI `--help` disagree.

**Phase to address:**
M1 (skill codegen + TUI re-query rule), reinforced every milestone that adds a command or pane.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skipping the M1 capability probe, going straight to a patch schema | Ships a "working" demo faster | M2/M3 rewrite when an op turns out unsupported; trust loss if it silently no-ops | Never |
| Using raw track/clip indices as IDs instead of fingerprints | Trivial to implement, "works" on a stable project | IDs rot on first reorder; role/motif state becomes garbage | M1 throwaway spike only, never persisted |
| Stubbing "preserve motif identity" as `mode: preserve` that returns the input unchanged | Lets `/vary` ship | Casino MIDI ships; trust destroyed the first time it ruins a real motif | Never on a code path users can reach |
| Letting bridge callbacks do real work inline | Less code, fewer threads | Stalls the user's hardware controllers; destabilizes host | Never — off-thread is a day-one rule |
| Writing `state-cache.json` in place (truncate + write) | One syscall | Crash mid-write corrupts the durable store; silent memory loss | Never; atomic temp+rename only |
| Hand-written skill prose instead of codegen from contracts | Easy to draft | Silent drift from CLI within one release | Acceptable for the *first* draft of one skill; CI regeneration must follow |
| Single "best" automation target without alternatives | Crisper UX | Wrong target → wrong automation on the wrong parameter | Never; always a ranked list with disambiguation |
| Treating Bitwig's native undo as authoritative reversibility | No `bw-edit revert` to build | Multi-op patches don't undo cleanly; user trapped mid-edit | Never as the *only* path; daemon-side revert is mandatory |
| `console.log` for debugging left in `cli/` | Faster debugging | Prose leaks into stdout, breaks JSON contract | Acceptable in `--debug` to stderr only, never stdout |
| Version field on handshake only (not per-message) | Simpler protocol | Silent version skew between bridge and daemon | Never; version every frame |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| **Bitwig Control Surface API** | Assuming a DAW object graph with stable IDs and arbitrary clip access | Treat it as cursor + paged banks + cursor-clip editing; synthesize IDs in the daemon from fingerprints |
| **Bitwig native undo** | Assuming custom undo labels / undo grouping exist | They don't (publicly). Daemon patch-history + `bw-edit revert` is the authoritative reversibility path |
| **Bitwig extension lifecycle** | Assuming reload preserves session/state | Full teardown + reinit every time. Stateless reconnect + reconcile-on-connect is mandatory |
| **Bitwig version upgrades** | Assuming one build works across Bitwig minors | It won't (DrivenByMoss maintains 10+ parallel release lines). Pin + version-gate; test against the user's actual Bitwig |
| **DrivenByMoss (co-resident)** | Assuming your extension owns the controller thread | It's shared; heavy callbacks stall the user's hardware controller. Off-thread discipline mandatory |
| **JSON-Lines socket** | Assuming `readLine()` gives a full frame | Buffer partial lines; only parse on `\n`; strip `\r`; reject BOM |
| **Pi/OpenClaw sessions** | Assuming ephemeral session memory persists | Daily/idle resets drop it. Flush candidates to `.bw-brain/session/` before reset |
| **OpenClaw Gateway (source of truth)** | TUI pane reading `state-cache.json` directly | Pane must query the daemon; the daemon is the Gateway-equivalent authority |
| **Stdio relay (if used instead of TCP)** | Mixing relay framing with JSON-Lines framing | The relay must be byte-transparent; one `\n` per JSON value, nothing added |
| **Shell pipes (`bw-*` \| jq \| ...)** | Commands that mix stdout prose + JSON | One JSON object to stdout, period. Composability dies on any other choice |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Snapshot serialization on the controller thread | Hardware controller lag during `bw-focus export` | Serialize on a background worker; callback only enqueues | Always — even small projects if the device chain is deep |
| Walking every track/device on every change event | CPU spike on each selection change | Subscribe to cursor + small banks; diff-emit only changed subtrees | >20 tracks or >5 devices/track |
| Re-reading + re-parsing `patch-history.jsonl` per command | `bw-diff` / `bw-edit` get slower over weeks | Maintain an index; rotate + archive per Pitfall 9 | >1k patches or >10MB history |
| Re-analyzing the full arrangement on every CLI call | `bw-arrange sections` takes seconds | Cache derived state keyed by snapshot fingerprint; invalidate on change | >5 min arrangements, frequent calls |
| Unbounded outbound socket queue under rapid edits | Patches apply seconds late, out of order | Bounded queue + explicit `throttled` response; UX shows "bridge busy" | Sustained >10 edits/sec |
| TUI pane re-rendering on every selection event | UI flicker / CPU burn | Debounce; coalesce; only re-query on focus or explicit refresh | Active editing with pane open |
| Full-reconciliation on every reconnect | Long startup after reload | Incremental reconcile using last-applied patch id watermark | Large projects + frequent reloads (dev) |

## Security Mistakes

Local-first narrows the threat model (no cloud, no remote model), but trust/safety *is* the security surface here. These are domain-specific, not OWASP.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Applying a patch without preview | User's project mutated without consent; trust death | Hard rule: no `apply` without a `preview`/`diff` first unless user explicitly forces with a documented flag; even then, only low-risk class |
| Multi-track edit approved with single-track preview | Out-of-scope mutation; the user agreed to less than happened | Three-layer scope enforcement (Pitfall 7); hard error on `scope.touched ⊋ scope.declared` |
| Mutating state without a patch object (direct bridge call from a creative module) | Untracked, unlabelled, unreversible edit | Bridge accepts *only* `apply.patch` frames for mutation; no backdoor ops. Enforced at protocol level |
| Trusting Bitwig undo as reversibility | User trapped mid-edit when multi-op undo doesn't collapse | Daemon patch-history + `bw-edit revert` is mandatory; documented caveat |
| Localhost socket bound to `0.0.0.0` instead of `127.0.0.1` | Other local users / processes can drive edits | Bind `127.0.0.1` (or `::1`) only; refuse wildcard; document |
| No auth on the localhost bridge | Any local process (including a malicious skill) can apply patches | Auth token in `.bw-brain/daemon.token` (0600), required on every frame; daemon refuses unauthenticated connections |
| Loading a third-party genre profile without review | Profile contains heuristics that mutate aggressively or exfiltrate project state | Profiles are read-only declarative config; the daemon sandbox marks them untrusted; no I/O from profile code |
| `state-cache.json` world-readable | Project structure (genre, arrangement, intent) leaks on shared machine | Create `.bw-brain/` with 0700; files 0600; document the local threat model |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Confidence stripped in the rendered output | User treats a 0.6 section label as ground truth; bad decisions cascade | Always render confidence; hedge below threshold; refuse below floor |
| "Applied!" with no diff shown | User trusts something they didn't see | Diff is mandatory before apply; "applied" message includes the diff hash |
| `/vary` returns variants on anything, including a clip it can't identify | Trust death on first misidentified motif | Refuse with a reason when motif confidence is below threshold |
| TUI pane shows stale state after Bitwig-side reorder | User acts on wrong track; edits land wrong | Re-query on focus; "live" indicator with staleness seconds |
| Silent fallback when bridge disconnected | `bw-focus export` returns last-known as if live | Always mark stale state; refuse to `apply` when stale |
| Undo label in Pi differs from Bitwig's Edit menu | User confused about what Cmd-Z will do | Show both; make `bw-edit revert` the documented authoritative undo |
| Creative suggestions dominate the read-only analysis in the UI | User learns to distrust the assistant before accuracy lands | M1 ships only read-only commands; `/vary` is hidden until the M2 gate passes |
| Error messages with no JSON shape | Scripts/skills can't classify failures | Every error is a JSON object with `code`, `message`, `retryable`; exit codes per Pitfall 11 |

## "Looks Done But Isn't" Checklist

Things that demo well but ship with a hidden hole.

- [ ] **Bridge:** "exports selection" — but does it survive a reload + reconcile? Verify: reload extension, then `bw-focus export` matches pre-reload selection.
- [ ] **Bridge:** "applies a patch" — but does it work on the user's *real* 60-track project, not just a 4-track demo? Verify: stress test on a representative large project.
- [ ] **Stable IDs:** "tracks have IDs" — but do they survive a reorder + rename? Verify: rename+move a track, confirm `roles.json` re-binds correctly.
- [ ] **Undo:** "patches are reversible" — but does `bw-edit revert` work after Bitwig-side edits *between* apply and revert? Verify: apply patch, manually edit the clip in Bitwig, then revert.
- [ ] **Motif preservation:** "preserve identity mode" — but does it actually re-check the post-patch signature? Verify: assert the test would fail if the check is stubbed.
- [ ] **Scope:** "patch stays in scope" — but is scope verified *post-apply*, not just pre? Verify: inject an op that touches an out-of-scope clip and confirm hard error.
- [ ] **JSON contract:** "commands emit JSON" — but under error paths too? Verify: kill the daemon mid-call, confirm stdout is still valid JSON (or empty) and exit code is non-zero.
- [ ] **Patch-history:** "appends forever" — but rotates? Verify: write 10k patches, confirm current file is bounded and archives exist.
- [ ] **state-cache.json:** "writes on snapshot" — but atomically? Verify: kill -9 mid-write, confirm next launch loads cleanly from `.tmp`+rename or backup.
- [ ] **Analysis confidence:** "emits confidence" — but the Pi skill renders it? Verify: end-to-end fixture where confidence < 0.5 and the rendered output hedges.
- [ ] **TUI pane:** "shows live state" — but re-queries after focus? Verify: reorder tracks in Bitwig, focus the pane, confirm it updates.
- [ ] **Bridge thread discipline:** "callbacks are fast" — but measured? Verify: 99th-percentile callback duration < 1ms on a large project with DrivenByMoss co-resident.

## Recovery Strategies

When a pitfall occurs despite prevention.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Patch applied to wrong clip (ID rot) | MEDIUM | `bw-edit revert <patchId>` using fingerprint re-resolution; if revert fails, restore from Bitwig's native undo history one step at a time using patch-history as a map; surface the incident in patch-history as `recovery_needed` |
| `state-cache.json` corrupted | LOW (if atomic writes) | Daemon refuses start, points at `.tmp`/backup; user runs `bw-migrate --restore-backup` or deletes cache for a full re-snapshot from Bitwig |
| Bridge stuck / extension disabled | LOW | Reload extension in Bitwig Preferences; daemon auto-reconciles on reconnect; outstanding patches replay with idempotency keys |
| Multi-op patch partially applied (host undo didn't group) | MEDIUM | Use `bw-edit revert` (authoritative), not Cmd-Z; if revert path itself is broken, fall back to manual diff application from patch-history |
| Motif wrecked by a transform that should have refused | HIGH (creative loss) | `bw-edit revert`; then file the case as a fixture; the transform's refusal threshold is a bug, not a tuning issue |
| Patch-history unbounded, commands slow | LOW | Run `bw-history rotate --enforce`; archives remain queryable; current file shrinks |
| Schema migration broke old caches | MEDIUM | `bw-migrate --dry-run` first, always writes backup; rollback = restore `.bw-brain/pre-migrate/` snapshot |
| TUI pane drifted, user acted on stale state | HIGH (trust) | Make staleness visible retroactively; if an edit landed on stale scope, treat as Pitfall 7 scope violation and refuse/auto-revert |
| Prose leaked into stdout, skill misparsed | LOW (after fix) | Pin skill to a cliVersion; add the leak to the CI schema-validation fixtures; regenerate skills from contract |

## Pitfall-to-Phase Mapping

Mapped to the four-milestone plan in PROJECT.md. "Prevention Phase" is where the mitigation must land; "Verification" is how to prove it landed.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Edit surface API can't fulfill | M1 P1 — bridge capability probe | `docs/bitwig-capabilities.md` exists; every patch op type maps to a verified API call |
| 2. No stable IDs | M1 P2 — state normalization | Fingerprint+reconciliation contract defined; reorder+rename fixture re-binds IDs |
| 3. Undo-label promise unfulfillable | M2 P1 — patch schema + reversibility | Honest reversibility contract documented; `bw-edit revert` tested after intervening edits |
| 4. Reload/restart drops bridge | M1 P3 — bridge reliability | Reconnect-after-reload reconciliation test; idempotency keys on every patch |
| 5. Controller-thread stalls | M1 P3 — bridge reliability | Off-thread rule in bridge README; p99 callback duration < 1ms with DrivenByMoss co-resident |
| 6. Casino MIDI / creative-first | M1 gate before M2 begins | Read-only accuracy bar met; transforms refuse-below-threshold tested |
| 7. Multi-track scope escape | M2 P2 — scope enforcement | Three-layer scope check; adversarial test injects out-of-scope op, expects hard error |
| 8. JSON-Lines partial frames / backpressure | M1 P2 — protocol design | `messages.md` defines framing/version/backpressure; partial-line + BOM + `\r` fixtures |
| 9. Cache corruption / unbounded history | M1 P4 — durable storage (atomic writes + versioning); M2 — rotation | kill -9 mid-write recovers; 10k-patch rotation keeps current file bounded |
| 10. Over-confident heuristics | M3 / M4 — but contract seeded in M1 schema | Every derived claim carries confidence to user; null-genre-profile test exists; below-threshold = refuse |
| 11. CLI contract drift | M1 P5 — CLI contract | CI schema-validates every command's output; exit-code matrix tested; no stdout prose |
| 12. Skills/TUI drift from daemon | M1 — skill codegen + TUI re-query; reinforced each milestone | Skill version-pinned; TUI pane re-queries on focus; session-reset flush test |

## Sources

Primary (HIGH confidence — first-party or canonical reference):
- `bitwig/bitwig-extensions` (official Bitwig controller extensions repo, MIT, Java 99.9%) — https://github.com/bitwig/bitwig-extensions — confirms extension path, in-app-only scripting guide, API surface under `com.bitwig.extensions.{controllers,framework,util}`.
- `git-moss/DrivenByMoss` (763★, 980 commits, LGPL-3.0, ships OSC) — https://github.com/git-moss/DrivenByMoss — proves networking-from-extension is feasible; demonstrates version-gating per Bitwig minor.
- mossgrabers.de Bitwig page — https://www.mossgrabers.de/Software/Bitwig/Bitwig.html — confirms 10+ parallel release lines (Bitwig 2.3 through 5.3+) and that the manual "covers also many pitfalls."
- jsonlines.org — https://jsonlines.org/ — canonical framing rules (complete JSON per line, `\n` terminator, no BOM, UTF-8).
- docs.openclaw.ai/reference/session-management-compaction — OpenClaw session model (Gateway-as-source-of-truth, mutable store vs append-only transcript, write locks, reset boundaries, pre-compaction flush, retention limits).
- bitwig/bitwig-extensions issues #53 ("Where is the Scripting Guide?"), #109 ("WASM support?"), #99 ("[API feature request] Master recording API") — confirm in-app-only docs and that the API is actively request-driven.
- Mario Zechner, "What if you don't need MCP at all?" (2025-11-02) — https://mariozechner.at/posts/2025-11-02-what-if-you-dont-need-mcp/ — CLI-as-contract, token efficiency, README-as-toolbelt, composability.

Project-internal (HIGH — directly cited context):
- `.planning/PROJECT.md` — guardrails, risk classes, memory classes, milestone plan, sequencing stance ("accurate first; creative later").
- `docs/seed.md` — data model, protocol examples, undo-label expectation, "casino MIDI" warning, durable-vs-ephemeral memory split.

Cross-checked (HIGH — multiple sources agree):
- Bitwig API has cursor + paged-bank model, no public stable GUIDs, no fine-grained undo grouping — consistent across the official repo structure, DrivenByMoss' extensive workaround patterns, and the in-app-only scripting-guide reality.

MEDIUM (not fetched directly, derived from the well-established community API surface):
- Specific method names (`CursorClip.addNote`, `Parameter.setValue`, `TrackBank` paging size semantics, controller-thread scheduling) — consistent with the public `com.bitwig.extension.controller.api` package used by both official and DrivenByMoss extensions; should be re-verified against the in-app scripting guide in M1 P1 (see Pitfall 1 capability probe).

---
*Pitfalls research for: local-first Bitwig DAW intelligence layer (bw-brain)*
*Researched: 2026-06-25*
