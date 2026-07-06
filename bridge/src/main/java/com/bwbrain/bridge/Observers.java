// bridge/src/main/java/com/bwbrain/bridge/Observers.java
//
// The full Phase-2 push observer set (D-01): CursorTrack + PinnableCursorClip +
// CursorDevice + Transport + windowed TrackBank[N=8]. Every observer fires on
// the Bitwig controller thread, updates a thread-safe snapshot cache, and offers
// a JSON-Lines event line to the Outbox — it NEVER writes to the socket directly
// (Pitfall 3 / capabilities doc §5 — blocking an observer stalls the audio
// engine; grep-verifiable: zero socket writes in this file).
//
// Observer surface verified against the in-app extension-api:21 Javadoc
// (capabilities doc §5 + this session's javap):
//   - CursorTrack.position().addValueObserver(cb, 1)   [IntegerValue, proven in spike]
//   - CursorTrack.name().addValueObserver(cb)          [DeviceChain.name() -> SettableStringValue]
//   - CursorClip.getLoopLength().addValueObserver(cb)  [Clip accessor; clip-name accessor is
//                                                       pending Task-3 live verification — loopLength
//                                                       change is the clip-selection proxy]
//   - CursorDevice.name().addValueObserver(cb)         [Device.name() -> StringValue]
//   - Transport.isPlaying().addValueObserver(cb)       [BooleanValue; NOT playState() — confirmed]
//   - TrackBank.getItemAt(i).name().addValueObserver(cb) [DeviceChain.name() via Track->Channel;
//                                                       inherited from Bank<Track>. getItemAt(int)
//                                                       is the terminal non-deprecated accessor —
//                                                       the int-arg AND 0-arg TrackBank indexers
//                                                       (getTrack/getChannel) are BOTH @Deprecated
//                                                       since API v2 (capabilities doc §4); Bitwig
//                                                       6.0.6 enforces deprecation-as-error at runtime]
//
// Each observer carries its own skipFirstFire guard: Bitwig value observers fire
// once on registration with the boot state (spike lines 73-77); skip that initial
// fire so the daemon's first received line is a REAL change, not a boot snapshot.
package com.bwbrain.bridge;

import com.bitwig.extension.callback.BooleanValueChangedCallback;
import com.bitwig.extension.callback.DoubleValueChangedCallback;
import com.bitwig.extension.callback.IntegerValueChangedCallback;
import com.bitwig.extension.callback.StringValueChangedCallback;
import com.bitwig.extension.controller.api.ClipLauncherSlotBank;
import com.bitwig.extension.controller.api.ControllerHost;
import com.bitwig.extension.controller.api.CursorDevice;
import com.bitwig.extension.controller.api.CursorTrack;
import com.bitwig.extension.controller.api.PinnableCursorClip;
import com.bitwig.extension.controller.api.Scene;
import com.bitwig.extension.controller.api.SceneBank;
import com.bitwig.extension.controller.api.Track;
import com.bitwig.extension.controller.api.TrackBank;
import com.bitwig.extension.controller.api.Transport;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;

public final class Observers {

    private final Outbox outbox;
    private final int bankSize;

    // Snapshot cache: written from the controller thread (observers), read from
    // the pull-handler thread (get.project_summary). Volatile for scalars;
    // ConcurrentHashMap for the windowed bank map. Best-effort snapshot reads are
    // correct for M1 (the daemon reconciles stable IDs separately via STATE-04).
    private volatile int cursorSlot = -1;
    private volatile String cursorTrackName = "";
    private volatile String cursorDeviceName = "";
    private volatile boolean playing = false;
    private final Map<Integer, String> bankTrackNames = new ConcurrentHashMap<>();
    // Phase 4 Plan 04-01 — D-12 grid-response enrichment (PULL-ONLY). The
    // SceneBank name cache feeds the `sceneNames` array in the
    // get.launcher_clips response. This is NOT a new event type (D-01 pull-only;
    // Pitfall 6 — event.schema.json stays at 5 entries; OBSERVATIONAL_EVENT_TYPES
    // in the daemon reader stays unchanged). The observers fire on the
    // controller thread + cache the latest name; PullHandlers.handleLauncherGrid
    // reads the snapshot when building the response.
    private final Map<Integer, String> sceneNames = new ConcurrentHashMap<>();
    private volatile int sceneBankSize = 0;
    // Phase 4 Plan 04-01 Task 2 fix — ClipLauncherSlot.hasContent() cache
    // (PULL-ONLY). The hasContent BooleanValue returns its default `false`
    // until addValueObserver is registered (Bitwig extension-api:21 documented
    // behavior; confirmed live by the Plan 04-01 Task 2 probe — 0/128 cells
    // reported hasContent in 5-12ms, the diagnostic signature of an
    // unsubscribed observer). Pre-fix the walker called
    // slot.hasContent().get() directly on an unsubscribed value and short-
    // circuited every cell to empty; post-fix the walker reads this cache
    // (populated by wireClipLauncherSlots at register() time).
    //
    // ConcurrentHashMap<Long,Boolean> keyed by (trackIdx << 16) | sceneIdx —
    // mirrors the existing bankTrackNames/sceneNames style exactly (controller
    // thread writes, pull-handler thread reads; thread-safe by construction).
    // A plain boolean[][] would diverge from the established cache pattern AND
    // lack a happens-before relationship for element writes across threads.
    private final Map<Long, Boolean> hasContentCache = new ConcurrentHashMap<>();
    // Phase 4 Plan 04-01 — trackBank reference retained so the pull-handler can
    // build the LauncherGridWalker's SlotSelector/HasContentReader bindings
    // (trackBank.getItemAt(t).clipLauncherSlotBank()...). Set in register();
    // null in tests.
    private TrackBank trackBankRef;
    // Phase 4 Plan 04-01 — D-01 cursor-walk ready-signal. The walker arms a
    // one-shot CountDownLatch before each slot.select(); the cursorClip
    // loopLength observer (NO skipFirstFire — every fire is a real move)
    // counts it down. Stored as AtomicReference so the observer (registered
    // once in register()) can read the latest latch across requests without
    // re-registering (re-registering would leak observers). PullHandlers
    // publishes its per-request latch via setWalkerReadyLatch; the observer
    // calls countDown() + clears the slot so a stale fire never bleeds into
    // the next cell.
    private final java.util.concurrent.atomic.AtomicReference<java.util.concurrent.CountDownLatch> walkerReadyLatch =
            new java.util.concurrent.atomic.AtomicReference<>(null);

    public Observers(final Outbox outbox, final int bankSize) {
        this.outbox = outbox;
        this.bankSize = bankSize;
    }

    /** Wire all 5 observer groups. Idempotent (call once from BridgeExtension.init). */
    public void register(final ControllerHost host,
                         final CursorTrack cursorTrack,
                         final PinnableCursorClip cursorClip,
                         final CursorDevice cursorDevice,
                         final Transport transport,
                         final TrackBank trackBank) {
        wireCursorTrack(cursorTrack);
        wireCursorClip(cursorClip);
        wireCursorDevice(cursorDevice);
        wireTransport(transport);
        wireTrackBank(trackBank);
    }

    /**
     * Phase 4 Plan 04-01 overload — also wires the SceneBank name observers
     * (PULL-ONLY enrichment for the D-12 {@code get.launcher_clips} response
     * {@code sceneNames} array). The 5-event protocol enum is UNCHANGED —
     * these observers NEVER offer an event line (Pitfall 6 — D-01 is pull-only).
     *
     * <p>ALSO wires the cursor-clip walker ready-signal observer (a SEPARATE
     * loopLength observer distinct from {@link #wireCursorClip}: that one
     * carries a skipFirstFire guard because it emits a push event; the walker
     * observer NEVER skips because every fire — boot or rename — is a real
     * cursor-clip move the walker is awaiting).</p>
     */
    public void register(final ControllerHost host,
                         final CursorTrack cursorTrack,
                         final PinnableCursorClip cursorClip,
                         final CursorDevice cursorDevice,
                         final Transport transport,
                         final TrackBank trackBank,
                         final SceneBank sceneBank,
                         final int sceneCount) {
        register(host, cursorTrack, cursorClip, cursorDevice, transport, trackBank);
        wireSceneBank(sceneBank, sceneCount);
        wireClipLauncherSlots(trackBank, sceneCount);
        wireWalkerReadySignal(cursorClip);
    }

    /**
     * Phase 4 Plan 04-01 — wire the walker's loopLength observer. Distinct from
     * {@link #wireCursorClip}: no skipFirstFire (every fire is a real cursor
     * move the walker is awaiting). The observer reads the per-request latch
     * from {@link #walkerReadyLatch} (published by {@link #setWalkerReadyLatch}),
     * counts it down, + clears the slot so a stale fire never bleeds into the
     * next cell.
     */
    private void wireWalkerReadySignal(final PinnableCursorClip cursorClip) {
        cursorClip.getLoopLength().addValueObserver((DoubleValueChangedCallback) (double len) -> {
            final java.util.concurrent.CountDownLatch l = walkerReadyLatch.get();
            if (l != null) {
                l.countDown();
                walkerReadyLatch.compareAndSet(l, null);
            }
        });
    }

    /**
     * Phase 4 Plan 04-01 — publish a per-request {@link CountDownLatch} that the
     * walker observer counts down on the next loopLength fire. Called by
     * {@link PullHandlers#handleLauncherGrid} once per request; the walker's
     * ReadySignal.arm() publishes a fresh latch here per cell.
     */
    void setWalkerReadyLatch(final java.util.concurrent.CountDownLatch latch) {
        walkerReadyLatch.set(latch);
    }

    /** Phase 4 Plan 04-01 — clear the per-request latch slot (timeout cleanup). */
    void clearWalkerReadyLatch() {
        walkerReadyLatch.set(null);
    }

    private void wireCursorTrack(final CursorTrack cursorTrack) {
        // position() — the proven Phase-1 path (spike lines 69-80). slot is a RAW
        // Bitwig index; the daemon computes the STATE-04 fingerprint (Pitfall 2).
        final AtomicBoolean skipPos = new AtomicBoolean(true);
        cursorTrack.position().addValueObserver((IntegerValueChangedCallback) (int idx) -> {
            if (skipPos.getAndSet(false)) { return; }
            cursorSlot = idx;
            outbox.offer(LineJson.event("selection.changed",
                    mapOf("slot", idx), ts()));
        }, 1);

        // name() — inherited from DeviceChain (Track -> Channel -> DeviceChain).
        final AtomicBoolean skipName = new AtomicBoolean(true);
        cursorTrack.name().addValueObserver((StringValueChangedCallback) (String name) -> {
            if (skipName.getAndSet(false)) { return; }
            cursorTrackName = name;
            outbox.offer(LineJson.event("track.name_changed",
                    mapOf("name", name), ts()));
        });
    }

    private void wireCursorClip(final PinnableCursorClip cursorClip) {
        // D-01 / D-03a (Phase 03.1-02): the public Clip/CursorClip surface
        // still has no name() reader (javap-verified against extension-api:21
        // — see RESEARCH §D-01 + ClipSid.java javadoc). getLoopLength() (Clip)
        // changes whenever a different clip is selected/pinned, so it remains
        // the clip-selection-change proxy that emits clip.name_changed. BUT
        // the bridge now ALSO derives a V1 clipSid from the cached cursor
        // track name + the loop length (sha256(name:len).slice(0,16)) and
        // includes it in the payload. The daemon folds this into
        // selection.clipSid (D-03c) so Plan 03's apply/revert pre-flight
        // gates have a clip identity to read.
        //
        // For V1 the bridge hashes the RAW cursor track name (the daemon-side
        // STATE-04 sid map is not bridge-reachable). The daemon treats the
        // bridge-supplied clipSid as opaque — the schema enforces the OUTPUT
        // pattern only (^clip_[0-9a-f]{16}$), and ClipSid.derive produces
        // pattern-valid output regardless of whether `cursorTrackName` is a
        // sid or a raw name.
        final AtomicBoolean skip = new AtomicBoolean(true);
        cursorClip.getLoopLength().addValueObserver((DoubleValueChangedCallback) (double len) -> {
            if (skip.getAndSet(false)) { return; }
            final String clipSid = ClipSid.derive(cursorTrackName, len);
            outbox.offer(LineJson.event("clip.name_changed",
                    mapOf("clipSid", clipSid), ts()));
        });
    }

    private void wireCursorDevice(final CursorDevice cursorDevice) {
        // name() — inherited from Device (CursorDevice extends Device).
        final AtomicBoolean skip = new AtomicBoolean(true);
        cursorDevice.name().addValueObserver((StringValueChangedCallback) (String name) -> {
            if (skip.getAndSet(false)) { return; }
            cursorDeviceName = name;
            outbox.offer(LineJson.event("device.name_changed",
                    mapOf("name", name), ts()));
        });
    }

    private void wireTransport(final Transport transport) {
        // isPlaying() (BooleanValue) — confirmed; the plan's playState() does not
        // exist on Transport in extension-api:21.
        final AtomicBoolean skip = new AtomicBoolean(true);
        transport.isPlaying().addValueObserver((BooleanValueChangedCallback) (boolean isPlaying) -> {
            if (skip.getAndSet(false)) { return; }
            playing = isPlaying;
            outbox.offer(LineJson.event("transport.changed",
                    mapOf("playing", isPlaying), ts()));
        });
    }

    private void wireTrackBank(final TrackBank trackBank) {
        // Phase 4 Plan 04-01 — retain the trackBank reference so the pull-handler
        // can build LauncherGridWalker bindings (trackBank.getItemAt(t)
        // .clipLauncherSlotBank().select(s)). Set BEFORE the observer loop so a
        // pull-handler request that races register() sees a non-null ref once
        // any name observer fires (best-effort; the daemon reconciles downstream).
        this.trackBankRef = trackBank;
        // Windowed TrackBank[N=8] (D-01). The terminal non-deprecated accessor is
        // Bank.getItemAt(int) (inherited by TrackBank via ChannelBank<Track>); it
        // returns Track and supports .name() unchanged. The int-arg AND 0-arg
        // TrackBank indexers (getTrack(int) AND getChannel(int)) are BOTH
        // @Deprecated since Bitwig Control Surface API v2 — Bitwig 6.0.6 enforces
        // deprecation-as-error at runtime (compiles as a javac warning only), so
        // any deprecated call site aborts init() and fails the extension load.
        // See docs/bitwig-capabilities.md §4 for the deprecation chain + evidence.
        for (int i = 0; i < bankSize; i++) {
            final Track t = trackBank.getItemAt(i);
            final int slot = i;
            final AtomicBoolean skip = new AtomicBoolean(true);
            t.name().addValueObserver((StringValueChangedCallback) (String name) -> {
                if (skip.getAndSet(false)) { return; }
                bankTrackNames.put(slot, name);
                final Map<String, Object> payload = mapOf("slot", slot);
                payload.put("name", name);
                outbox.offer(LineJson.event("track.name_changed", payload, ts()));
            });
        }
    }

    /**
     * Phase 4 Plan 04-01 — D-12 grid-response scene-name enrichment (PULL-ONLY).
     * The SceneBank name observers feed {@link #getSceneNames()} for the
     * {@code get.launcher_clips} response {@code sceneNames} array. These
     * observers NEVER offer an event line (Pitfall 6 — D-01 pull-only; the
     * 5-event protocol enum MUST NOT grow). The accessor chain is the same
     * non-deprecated pattern as {@link #wireTrackBank}: {@code Bank.getItemAt(int)}
     * (inherited by SceneBank via Bank&lt;Scene&gt;) + {@code Scene.name()}
     * (the non-deprecated form; the no-arg getter on Scene is deprecated per the
     * in-app Javadoc 6.0.6 deprecated-list.html — RESEARCH §Bitwig Probe Probe
     * 5 + Pitfall 2).
     *
     * <p>The {@code skipFirstFire} AtomicBoolean guard mirrors the existing
     * pattern (Observers.java:86-101): Bitwig value observers fire once on
     * registration with the boot state. Unlike the 5 push observer groups
     * (which skip the boot fire to keep the daemon's first received line a
     * REAL change), the scene-name cache STILL writes the boot value on the
     * first fire — D-01 is pull-only so there is no outbox offer to suppress,
     * and the pull-handler reads whatever the latest name is (boot state OR
     * rename). The guard exists purely to skip the redundant cache write on
     * subsequent identical fires.</p>
     */
    private void wireSceneBank(final SceneBank sceneBank, final int size) {
        sceneBankSize = size;
        for (int i = 0; i < sceneBankSize; i++) {
            final Scene s = sceneBank.getItemAt(i);
            final int idx = i;
            sceneNames.put(idx, ""); // initialize so a pull before the boot fire returns "" not null
            s.name().addValueObserver((StringValueChangedCallback) (String name) -> {
                sceneNames.put(idx, name == null ? "" : name);
            });
        }
    }

    /**
     * Phase 4 Plan 04-01 Task 2 fix — wire {@code ClipLauncherSlot.hasContent()}
     * observers for every (track, scene) in the grid. PULL-ONLY (Pitfall 6 —
     * NEVER offers an event line; the 5-event protocol enum stays unchanged).
     *
     * <p><b>Why this exists.</b> {@code ClipLauncherSlot.hasContent()} returns a
     * {@code BooleanValue} that defaults to {@code false} until an observer is
     * registered. The pre-fix walker read {@code slot.hasContent().get()}
     * directly on an unsubscribed value, so every cell returned {@code false} →
     * the walker short-circuited every cell as empty, called NO {@code select()},
     * and finished in milliseconds. The live probe signature (Plan 04-01 Task 2)
     * was {@code 0/128} hasContent cells in 5–12ms across 5 requests — the
     * diagnostic of an unsubscribed observer. Post-fix, this method registers
     * the observer at {@code register()} time so the cache holds the real boot
     * state by the time the first {@code get.launcher_clips} pull arrives.</p>
     *
     * <p><b>Mirrors {@link #wireSceneBank}</b> (line 290-300): same
     * {@code Bank.getItemAt(int)} non-deprecated accessor chain, same
     * unconditional boot-state write (NO {@code skipFirstFire} — we WANT the
     * boot state populated so the very first pull is correct, unlike the 5
     * push observer groups which skip the boot fire to keep the daemon's first
     * received line a REAL change). The cache is a {@link ConcurrentHashMap}
     * keyed by {@code (trackIdx << 16) | sceneIdx} — matches the
     * {@link #bankTrackNames}/{@link #sceneNames} style exactly.</p>
     *
     * <p>Accessor chain (all non-deprecated, per RESEARCH §Bitwig Probe Javadoc
     * scan + {@code scripts/check-deprecated-bridge.mjs} gate):</p>
     * <ol>
     *   <li>{@code trackBank.getItemAt(t)} → {@link Track} (terminal
     *       non-deprecated Bank accessor; the int-arg AND 0-arg TrackBank
     *       indexers are BOTH @Deprecated — see {@link #wireTrackBank}).</li>
     *       <li>{@code track.clipLauncherSlotBank()} → {@link ClipLauncherSlotBank}
     *       (NOT {@code Track#getClipLauncherSlots()} which is @Deprecated).</li>
     *   <li>{@code slotBank.getItemAt(s)} → {@code ClipLauncherSlot}
     *       (terminal non-deprecated Bank accessor).</li>
     *   <li>{@code slot.hasContent()} → {@code BooleanValue} (the SAME
     *       non-deprecated surface as {@code transport.isPlaying()} at line 231).</li>
     * </ol>
     */
    private void wireClipLauncherSlots(final TrackBank trackBank, final int sceneCount) {
        for (int t = 0; t < bankSize; t++) {
            final int trackIdx = t;
            final Track track = trackBank.getItemAt(t);
            final ClipLauncherSlotBank slotBank = track.clipLauncherSlotBank();
            if (slotBank == null) {
                // Master / FX / Return / Group tracks do not expose a clip
                // launcher slot bank — pre-populate every scene with false so
                // the walker reads a coherent all-empty row instead of throwing
                // NPE on slotBank.getItemAt. Mirrors the pre-init default the
                // cache already holds, made explicit for readability.
                for (int s = 0; s < sceneCount; s++) {
                    hasContentCache.put(hasContentKey(trackIdx, s), Boolean.FALSE);
                }
                continue;
            }
            for (int s = 0; s < sceneCount; s++) {
                final int sceneIdx = s;
                // Initialize to false so a pre-boot pull returns false (matching
                // the unsubscribed default) rather than null — mirrors
                // wireSceneBank's `sceneNames.put(idx, "")`.
                hasContentCache.put(hasContentKey(trackIdx, sceneIdx), Boolean.FALSE);
                slotBank.getItemAt(sceneIdx).hasContent().addValueObserver(
                        (BooleanValueChangedCallback) (boolean has) ->
                                hasContentCache.put(hasContentKey(trackIdx, sceneIdx), has));
            }
        }
    }

    /** Composite key for {@link #hasContentCache}: {@code (trackIdx << 16) | sceneIdx}. */
    private static long hasContentKey(final int trackIdx, final int sceneIdx) {
        return (((long) trackIdx) << 16) | (sceneIdx & 0xFFFFL);
    }

    // --- snapshot getters for PullHandlers (get.project_summary) ---

    public int getCursorSlot() { return cursorSlot; }
    public String getCursorTrackName() { return cursorTrackName; }
    public String getCursorDeviceName() { return cursorDeviceName; }
    public boolean isPlaying() { return playing; }
    public Map<Integer, String> getBankTrackNames() { return bankTrackNames; }
    public int getBankSize() { return bankSize; }
    /** Phase 4 Plan 04-01 — scene-name cache snapshot for the D-12 grid response. */
    public Map<Integer, String> getSceneNames() { return sceneNames; }
    public int getSceneBankSize() { return sceneBankSize; }
    /**
     * Phase 4 Plan 04-01 Task 2 fix — read the cached
     * {@code ClipLauncherSlot.hasContent()} value for (trackIdx, sceneIdx).
     * The cache is populated by {@link #wireClipLauncherSlots} at
     * {@code register()} time; the walker reads this instead of calling
     * {@code slot.hasContent().get()} on an unsubscribed BooleanValue.
     *
     * <p>Defensive bounds: out-of-range indices return {@code false} (the
     * walker is null-guarded upstream; this never throws).</p>
     */
    public boolean getHasContent(final int trackIdx, final int sceneIdx) {
        if (trackIdx < 0 || trackIdx >= bankSize
                || sceneIdx < 0 || sceneIdx >= sceneBankSize) {
            return false;
        }
        final Boolean v = hasContentCache.get(hasContentKey(trackIdx, sceneIdx));
        return v == null ? false : v.booleanValue();
    }
    /** Phase 4 Plan 04-01 — the wired TrackBank reference for walker bindings. */
    TrackBank getTrackBank() { return trackBankRef; }

    private static long ts() { return System.currentTimeMillis() / 1000L; }

    /** Small LinkedHashMap builder so event payloads serialize with stable key order. */
    private static Map<String, Object> mapOf(final Object... kv) {
        final Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i + 1 < kv.length; i += 2) {
            m.put((String) kv[i], kv[i + 1]);
        }
        return m;
    }
}
