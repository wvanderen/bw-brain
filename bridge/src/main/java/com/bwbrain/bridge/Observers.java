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
import com.bitwig.extension.callback.EnumValueChangedCallback;
import com.bitwig.extension.callback.IntegerValueChangedCallback;
import com.bitwig.extension.callback.StringValueChangedCallback;
import com.bitwig.extension.controller.api.ClipLauncherSlotBank;
import com.bitwig.extension.controller.api.ControllerHost;
import com.bitwig.extension.controller.api.CursorDevice;
import com.bitwig.extension.controller.api.CursorRemoteControlsPage;
import com.bitwig.extension.controller.api.CursorTrack;
import com.bitwig.extension.controller.api.Device;
import com.bitwig.extension.controller.api.DeviceBank;
import com.bitwig.extension.controller.api.PinnableCursorClip;
import com.bitwig.extension.controller.api.Scene;
import com.bitwig.extension.controller.api.SceneBank;
import com.bitwig.extension.controller.api.Track;
import com.bitwig.extension.controller.api.TrackBank;
import com.bitwig.extension.controller.api.Transport;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;

public final class Observers {

    // Phase 5 Plan 05-03 Task 2 — observation-window sizing (D-05-02/D-05-03).
    /** Chain window: the selected track's device chain via DeviceBank(16). */
    static final int DEVICE_BANK_SIZE = 16;
    /** Fixed cursorDevice parameter window (A1-NEGATED fallback, D-05-03). */
    static final int PARAM_WINDOW = 128;
    /** Remote-controls page knob count (8-knob page, D-05-03). */
    static final int REMOTE_PAGE_SIZE = 8;
    /** Coalescing flush interval (Pitfall 5: bounded 50-100ms drain). */
    static final long COALESCE_FLUSH_MS = 100L;
    /**
     * Movement epsilon (matches daemon fold-event.ts MOVEMENT_EPSILON): a
     * value delta <= 1e-4 is float jitter, not a movement.
     */
    static final double MOVEMENT_EPSILON = 1e-4;
    /** parameter.changed source vocabulary (event.schema.json `source` enum). */
    static final int SOURCE_DEVICE_PARAMETER = 0;
    static final int SOURCE_REMOTE_PAGE = 1;
    static final String SOURCE_DEVICE_PARAMETER_NAME = "device_parameter";
    static final String SOURCE_REMOTE_PAGE_NAME = "remote_page";

    /**
     * Composite coalescing key: {@code (sourceOrdinal << 32) | paramIndex} —
     * the hasContentKey (trackIdx&lt;&lt;16 | sceneIdx) composite-key
     * precedent, widened so the same paramIndex under different sources never
     * collides.
     */
    static long paramKey(final int sourceOrdinal, final int paramIndex) {
        return (((long) sourceOrdinal) << 32) | (paramIndex & 0xFFFFFFFFL);
    }

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
    // Phase 4 Plan 04-01 Task 2 fix — per-track "hasContent observers wired"
    // flag. Bitwig's Track proxies returned by trackBank.getItemAt(int) during
    // init() return null from clipLauncherSlotBank() (the bank is not yet
    // realized). The name observer fires LATER on the controller thread once
    // the track is populated; that's the safe moment to subscribe hasContent.
    // Idempotent guard so multiple name fires (boot + rename) wire only once.
    // Initialized in the ctor (bankSize is a ctor param).
    private final boolean[] wiredHasContent;
    // Phase 4 Plan 04-01 Task 2 diagnostic — host reference for println in
    // lazy-wiring callbacks. Set in register(); null in tests.
    private ControllerHost hostRef;
    // Phase 4 Plan 04-01 — trackBank reference retained so the pull-handler can
    // build the LauncherGridWalker's SlotSelector/HasContentReader bindings
    // (trackBank.getItemAt(t).clipLauncherSlotBank()...). Set in register();
    // null in tests.
    private TrackBank trackBankRef;
    // Phase 5 Plan 05-06 — the init-created CursorRemoteControlsPage retained
    // so the pull-handler's cursorDeviceParameterWriter can resolve the
    // LIVE-PROVEN write surface (2026-08-22 probe: page knob Parameters are
    // the only verified touch/set path — capabilities §3). Reusing the single
    // init-created page (NOT creating one per apply request) honors both the
    // eager-init-only registration constraint (capabilities §7 fix 3) and the
    // probe's creation-site finding (page created at init, knobs M1-M8).
    // volatile: assigned once in register() (controller/init thread), read by
    // the bw-brain-pull thread at apply time — the trackBankRef publication
    // pattern with the safe-publication upgrade.
    private volatile CursorRemoteControlsPage remotePageRef;
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
    // Phase 4 Plan 04.3-06 (04.3 gap closure / DEFECT A) — bank-observation
    // activity tracking for the bounded BankSyncWait settle wait. The three
    // BANK observer groups (TrackBank track names, SceneBank scene names,
    // ClipLauncherSlot hasContent) fire in a burst while Bitwig populates the
    // banks after project load; PullHandlers.handleLauncherGrid blocks on
    // BankSyncWait.awaitSettled until that burst settles (threshold met OR
    // quiet) BEFORE the cursor walk reads the caches. Root cause being closed:
    // during the 2026-08-21 live UAT the FIRST get.launcher_clips pull raced
    // the bank sync, walked still-empty banks (empty trackSids for tracks
    // 4-7, all 128 cells hasContent:false), and poisoned
    // arrangement-snapshot.json, while later populated-but-slower walks
    // exceeded the daemon's 3000ms pull timeout and were dropped.
    //
    // WHY cursor-track/cursor-clip observers are deliberately EXCLUDED: they
    // fire on SELECTION changes (which track/clip the user pointed at), not
    // on bank population — they carry no signal about whether the
    // TrackBank/SceneBank/ClipLauncherSlotBank caches are synced, so counting
    // them would let the threshold-met early return fire against unsynced
    // banks.
    //
    // Concurrency: written from the Bitwig controller thread (observer
    // callbacks), read from the pull-handler thread via the package-private
    // accessors below — atomics mirror the walkerReadyLatch precedent.
    private final java.util.concurrent.atomic.AtomicLong lastBankObservationAt =
            new java.util.concurrent.atomic.AtomicLong(0L);
    private final java.util.concurrent.atomic.AtomicInteger bankObservationCount =
            new java.util.concurrent.atomic.AtomicInteger(0);
    // Phase 5 Plan 05-03 (D-05-16) — PULL-ONLY transport meta caches (tempo +
    // time signature) feeding the get.project_meta response. These observers
    // NEVER offer an event line (the sceneNames :358-371 pull-only precedent):
    // they fire on the controller thread, cache the latest value on EVERY fire
    // (including the registration boot fire — the pull path wants the current
    // value, not just changes), and PullHandlers.handleProjectMeta reads the
    // snapshot when building the response. The honest pre-fire defaults mirror
    // the daemon's DEFAULT_PROJECT (boot.ts:127) so an unregistered/unfired
    // cache never fabricates a live value.
    private volatile double tempo = 120.0;
    private volatile String timeSignature = "4/4";
    // ------------------------------------------------------------------------
    // Phase 5 Plan 05-03 Task 2 (D-05-01/02/03) — device/parameter observation
    // caches. ALL writes happen on the Bitwig controller thread; ALL reads
    // happen from the pull-handler thread (Task 3 assembly) or the coalescing
    // flush thread. ConcurrentHashMap/volatile mirror the established cache
    // pattern (hasContentCache precedent: thread-safe by construction).
    // ------------------------------------------------------------------------
    /** Chain membership (D-05-02): cursorTrack.createDeviceBank(16) window. */
    private final Map<Integer, String> chainDeviceNames = new ConcurrentHashMap<>();
    /** VST/AU detection per chain slot (AUTO-04): Device.isPlugin() cache. */
    private final Map<Integer, Boolean> chainDeviceIsPlugin = new ConcurrentHashMap<>();
    /** Chain position per bank slot (deviceSid fingerprint input). */
    private final Map<Integer, Integer> chainDevicePositions = new ConcurrentHashMap<>();
    /** Cursor device's chain position (deviceKey fingerprint input; -1 = unfired). */
    private volatile int cursorDevicePosition = -1;
    /** Fixed 0..127 device-parameter window — exists()/binding cache. */
    private final Map<Integer, Boolean> paramBound = new ConcurrentHashMap<>();
    /** Parameter identity cache (name per window index). */
    private final Map<Integer, String> paramNames = new ConcurrentHashMap<>();
    /** Parameter last-value cache (normalized [0,1]; written on every fire). */
    private final Map<Integer, Double> paramValues = new ConcurrentHashMap<>();
    /** Remote-controls page name (native macro surface, D-05-03). */
    private volatile String remotePageName = "";
    /** Page-knob binding cache (8-slot page). */
    private final Map<Integer, Boolean> remoteBound = new ConcurrentHashMap<>();
    /** Page-knob identity cache. */
    private final Map<Integer, String> remoteNames = new ConcurrentHashMap<>();
    /** Page-knob last-value cache. */
    private final Map<Integer, Double> remoteValues = new ConcurrentHashMap<>();
    /**
     * Per-param last-value-wins coalescer (Pitfall 5 / T-05-06). Movement
     * callbacks fold here on the controller thread; the bounded flush thread
     * (below) drains it via outbox.offer — never a direct socket write.
     */
    private final ParameterCoalescer coalescer;
    /** D-05-05 automation-write state push (transport.changed automationWrite). */
    private final AutomationWriteEmitter automationWriteEmitter;
    /** Flush-thread start guard (idempotent; register() may be called once). */
    private final AtomicBoolean flushThreadStarted = new AtomicBoolean(false);

    public Observers(final Outbox outbox, final int bankSize) {
        this.outbox = outbox;
        this.bankSize = bankSize;
        this.wiredHasContent = new boolean[bankSize];
        this.coalescer = new ParameterCoalescer(outbox::offer);
        this.automationWriteEmitter = new AutomationWriteEmitter(outbox::offer);
    }

    /** Wire all 5 observer groups. Idempotent (call once from BridgeExtension.init). */
    public void register(final ControllerHost host,
                         final CursorTrack cursorTrack,
                         final PinnableCursorClip cursorClip,
                         final CursorDevice cursorDevice,
                         final Transport transport,
                         final TrackBank trackBank) {
        this.hostRef = host;
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
        // Phase 4 Plan 04-01 Task 2 — EAGER hasContent observer wiring.
        // Bitwig forbids observer registration outside init() ("ydq: This can
        // only be called during driver initialization" — live-observed when
        // we attempted lazy wiring from the track-name observer callback). So
        // all hasContent observers MUST be registered here, during init().
        // Requires createTrackBank(BANK_SIZE, 0, SCENE_COUNT) — with numScenes=0
        // every track's clipLauncherSlotBank() returns null.
        wireClipLauncherSlotsEager(host, trackBank, sceneCount);
        wireWalkerReadySignal(cursorClip);
        // Phase 5 Plan 05-03 Task 1 (D-05-16) — PULL-ONLY transport meta
        // observers (tempo + time signature). init()-time registration like
        // every other observer group (Pitfall 7 — post-init registration
        // throws at runtime).
        wireTransportMeta(transport);
        // Phase 5 Plan 05-03 Task 2 (D-05-01/02/03) — the device observation
        // spine: chain cache + fixed parameter window + remote page knobs +
        // automation-write state. ALL registered HERE (init()-only — Pitfall 7;
        // the observation set is fixed over proxies that rebind as selection
        // moves). The coalescing flush thread starts once alongside.
        wireDeviceChain(cursorTrack);
        wireParameterWindow(cursorDevice);
        wireRemotePage(cursorDevice);
        wireAutomationWrite(transport);
        startCoalescingFlushThread();
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
            cursorSlot = idx;
            if (skipPos.getAndSet(false)) { return; }
            outbox.offer(LineJson.event("selection.changed",
                    mapOf("slot", idx), ts()));
        }, 1);

        // name() — inherited from DeviceChain (Track -> Channel -> DeviceChain).
        final AtomicBoolean skipName = new AtomicBoolean(true);
        cursorTrack.name().addValueObserver((StringValueChangedCallback) (String name) -> {
            cursorTrackName = name == null ? "" : name;
            if (skipName.getAndSet(false)) { return; }
            outbox.offer(LineJson.event("track.name_changed",
                    mapOf("name", cursorTrackName), ts()));
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
            cursorDeviceName = name == null ? "" : name;
            if (skip.getAndSet(false)) { return; }
            // Phase 5 gap-closure (deferred-items 05-05): the payload carries
            // the deviceSid fingerprint computed from the SAME caches the
            // parameter.changed deviceKey uses (deriveDeviceSid), so the
            // daemon's selection.deviceSid fold and the salience-derived
            // AutomationScopes agree by construction. The 05-05
            // wrong_device_targeted pre-flight reads it as the live identity.
            outbox.offer(LineJson.event("device.name_changed",
                    mapOf(
                        "name", cursorDeviceName,
                        "deviceSid", deriveDeviceSid(cursorTrackName, cursorDeviceName, cursorDevicePosition)),
                    ts()));
        });
        // Phase 5 Plan 05-03 Task 2 — chain position of the cursor device
        // (PULL-ONLY): the third deviceSid fingerprint input. Device.position()
        // is non-deprecated (javap-verified; the addPositionObserver form IS
        // deprecated). Cached on every fire (boot value included) so the
        // deviceKey fingerprint always sees the current slot.
        cursorDevice.position().addValueObserver((IntegerValueChangedCallback) (int pos) -> {
            cursorDevicePosition = pos;
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

    /**
     * Phase 5 Plan 05-03 Task 1 (D-05-16) — wire the PULL-ONLY tempo +
     * time-signature observers. Non-deprecated accessors verified via javap
     * against extension-api:21 this session: {@code Transport.tempo()} (the
     * {@code getTempo()} form IS deprecated) returns a Parameter whose value
     * observers follow the {@code RangedValue extends
     * Value<DoubleValueChangedCallback>} surface; {@code Transport
     * .timeSignature()} (the {@code getTimeSignature()} form IS deprecated)
     * returns a {@code TimeSignatureValue extends
     * Value<StringValueChangedCallback>} whose {@code get()} renders "4/4".
     *
     * <p>PULL-ONLY (the wireSceneBank :358-371 precedent): the cache writes on
     * EVERY fire — including the registration boot fire (the pull path wants
     * the current value) — and NEVER offers an event line. There is no
     * skipFirstFire guard because there is nothing to suppress.</p>
     */
    private void wireTransportMeta(final Transport transport) {
        transport.tempo().addValueObserver((DoubleValueChangedCallback) (double bpm) -> {
            tempo = bpm;
        });
        transport.timeSignature().addValueObserver((StringValueChangedCallback) (String sig) -> {
            timeSignature = sig == null || sig.isEmpty() ? "4/4" : sig;
        });
    }

    // ------------------------------------------------------------------------
    // Phase 5 Plan 05-03 Task 2 — device observation wiring (D-05-01/02/03).
    // Every method below registers its observers EXACTLY ONCE, from the
    // register() overload above, during init() (Pitfall 7 — Bitwig forbids
    // registration outside driver initialization; live-observed). The
    // structural pin is ObserversCoalescingTest.everyNewObserverGroupIs…
    // (each wire method: exactly one declaration + one call site).
    // ------------------------------------------------------------------------

    /**
     * Chain-membership cache (D-05-02): the SELECTED track's device chain via
     * {@code cursorTrack.createDeviceBank(16)} (Track IS-A Channel IS-A
     * DeviceChain — the DeviceChain.createDeviceBank(int) surface, javap-
     * verified non-deprecated). PULL-ONLY: name/isPlugin/position observers
     * write the caches on every fire and NEVER offer events. Chain membership
     * for the Task 3 response = non-blank name (the LauncherGridWalker
     * phantom-tail-trim precedent).
     */
    private void wireDeviceChain(final CursorTrack cursorTrack) {
        final DeviceBank deviceBank = cursorTrack.createDeviceBank(DEVICE_BANK_SIZE);
        for (int i = 0; i < DEVICE_BANK_SIZE; i++) {
            final Device d = deviceBank.getItemAt(i); // Bank.getItemAt — non-deprecated terminal accessor
            final int slot = i;
            chainDeviceNames.put(slot, ""); // init so a pull before the boot fire sees "" not null
            d.name().addValueObserver((StringValueChangedCallback) (String name) -> {
                chainDeviceNames.put(slot, name == null ? "" : name);
            });
            d.isPlugin().addValueObserver((BooleanValueChangedCallback) (boolean isPlugin) -> {
                chainDeviceIsPlugin.put(slot, isPlugin);
            });
            d.position().addValueObserver((IntegerValueChangedCallback) (int pos) -> {
                chainDevicePositions.put(slot, pos);
            });
        }
    }

    /**
     * The fixed 0..127 parameter window over the cursor device — the
     * A1-NEGATED fallback surface for VST/AU parameter enumeration (D-05-03,
     * AUTO-04; 2026-06-29 A1 finding: VST params do NOT surface via
     * CursorRemoteControlsPage).
     *
     * <p><b>Deprecation finding (2026-08-22, javap -v + the official
     * deprecated-list.html):</b> the Device int-indexed parameter accessor
     * carries {@code @Deprecated}, and Bitwig 6.x enforces
     * deprecation-as-error at runtime for deprecated call sites (capabilities
     * doc §4 — the Phase-2 getTrack incident). The javadoc-recommended
     * replacement {@code getRemoteControls().getRemoteControlInSlot(i)}
     * CANNOT be used: {@code getRemoteControls()} does not exist in
     * extension-api:21 (A1-NEGATED, javap-verified). No non-deprecated
     * direct-enumeration surface exists. D-05-03 (locked) pins THIS surface,
     * so the call stays — allowlisted at the call site — behind a per-index
     * try/catch (the wireClipLauncherSlotsEager defensive-registration
     * precedent): if the host rejects the deprecated call at registration,
     * that index (or the whole window) degrades to unbound — no events, no
     * crash, init() survives — and the PENDING live A2 probe (05-02,
     * capabilities §"Parameter indexing probe") arbitrates. If the probe
     * proves the call dies live, the window stays empty and the observation
     * surface flips to page-based in a follow-up (documented in
     * 05-03-SUMMARY).</p>
     *
     * <p>Value observers feed the coalescer (last-value-wins per key; Pitfall
     * 5). Names/binding are PULL-ONLY caches consumed by Task 3's response
     * assembly.</p>
     */
    private void wireParameterWindow(final CursorDevice cursorDevice) {
        for (int i = 0; i < PARAM_WINDOW; i++) {
            final int idx = i;
            try {
                final var p = cursorDevice.getParameter(idx); // deprecated-allow: D-05-03 locked A1-NEGATED fallback — no non-deprecated direct enumeration exists in extension-api:21 (javadoc's getRemoteControls() replacement absent, javap 2026-08-22); per-index try/catch degrades the window gracefully; PENDING A2 live probe (05-02) arbitrates
                p.exists().addValueObserver((BooleanValueChangedCallback) (boolean has) -> {
                    paramBound.put(idx, has);
                });
                p.name().addValueObserver((StringValueChangedCallback) (String name) -> {
                    paramNames.put(idx, name == null ? "" : name);
                });
                p.addValueObserver((DoubleValueChangedCallback) (double v) -> {
                    paramValues.put(idx, v);
                    coalescer.onValue(paramKey(SOURCE_DEVICE_PARAMETER, idx), idx,
                            paramNames.getOrDefault(idx, ""), SOURCE_DEVICE_PARAMETER_NAME, v);
                });
            } catch (final Throwable e) {
                // Defensive registration (wireClipLauncherSlotsEager
                // precedent): a host that rejects the deprecated window
                // surface keeps this index unbound instead of killing init().
            }
        }
    }

    /**
     * One remote-controls page on the cursor device (native macro knobs —
     * first-class observation targets, D-05-03: explicit producer exposure
     * beats inference). {@code createCursorRemoteControlsPage(int)} and
     * {@code RemoteControlsPage.getParameter(int)} are NON-deprecated (javap
     * -v verified). 8-knob page; page knob values ride the SAME coalescing
     * path keyed by page-slot index with source="remote_page".
     */
    private void wireRemotePage(final CursorDevice cursorDevice) {
        final CursorRemoteControlsPage page = cursorDevice.createCursorRemoteControlsPage(0);
        // Phase 5 Plan 05-06: retain the page — the pull-handler's parameter
        // writer resolves page knobs (the live-proven write surface) from THIS
        // handle; a per-apply createCursorRemoteControlsPage call would both
        // accumulate pages across a session and exercise an unverified
        // post-init creation path.
        this.remotePageRef = page;
        page.getName().addValueObserver((StringValueChangedCallback) (String name) -> {
            remotePageName = name == null ? "" : name;
        });
        for (int i = 0; i < REMOTE_PAGE_SIZE; i++) {
            final var knob = page.getParameter(i); // RemoteControl IS-A Parameter; non-deprecated
            final int slot = i;
            try {
                knob.exists().addValueObserver((BooleanValueChangedCallback) (boolean has) -> {
                    remoteBound.put(slot, has);
                });
                knob.name().addValueObserver((StringValueChangedCallback) (String name) -> {
                    remoteNames.put(slot, name == null ? "" : name);
                });
                knob.addValueObserver((DoubleValueChangedCallback) (double v) -> {
                    remoteValues.put(slot, v);
                    coalescer.onValue(paramKey(SOURCE_REMOTE_PAGE, slot), slot,
                            remoteNames.getOrDefault(slot, ""), SOURCE_REMOTE_PAGE_NAME, v);
                });
            } catch (final Throwable e) {
                // Defensive registration — a page slot that rejects observers
                // stays unbound; init() survives.
            }
        }
    }

    /**
     * Transport automation-write state observers (D-05-05 vocabulary — the
     * daemon's future refusal-gate inputs). Each observer delegates to the
     * {@link AutomationWriteEmitter} (skipFirstFire per field; the emitter
     * pushes transport.changed carrying the full 4-field automationWrite
     * snapshot, so every consumer sees a consistent object). Non-deprecated
     * surfaces: the SettableBooleanValue/BooleanValue value observers +
     * automationWriteMode() (EnumValue); the Transport-level add*Observer
     * convenience forms are ALL deprecated (javap -v verified).
     */
    private void wireAutomationWrite(final Transport transport) {
        transport.isArrangerAutomationWriteEnabled().addValueObserver(
                (BooleanValueChangedCallback) automationWriteEmitter::onArrangerWriteEnabled);
        transport.isClipLauncherAutomationWriteEnabled().addValueObserver( // deprecated-allow: jar-verified NON-deprecated value accessor (javap -v extension-api-21 2026-08-22: no @Deprecated — only the addIsWritingClipLauncherAutomationObserver convenience form is); the HTML deprecated-list entry carries no replacement note — a javadoc artifact the gate's HTML scan flags; the schema-required launcherWriteEnabled field (D-05-05) has no other surface
                (BooleanValueChangedCallback) automationWriteEmitter::onLauncherWriteEnabled);
        transport.isAutomationOverrideActive().addValueObserver(
                (BooleanValueChangedCallback) automationWriteEmitter::onOverrideActive);
        transport.automationWriteMode().addValueObserver(
                (EnumValueChangedCallback) automationWriteEmitter::onWriteMode);
    }

    /**
     * Start the bounded coalescing flush thread (once). Drains the coalescer
     * every {@link #COALESCE_FLUSH_MS} ms and offers the folded
     * parameter.changed lines through the Outbox (never a direct socket
     * write — the enqueue-then-drain invariant). The deviceKey fingerprint is
     * computed HERE (not in the movement callbacks) so the controller thread
     * does zero hashing per fire (T-05-08: cache writes only in callbacks).
     */
    private void startCoalescingFlushThread() {
        if (!flushThreadStarted.compareAndSet(false, true)) {
            return;
        }
        final Thread t = new Thread(() -> {
            while (true) {
                try {
                    Thread.sleep(COALESCE_FLUSH_MS);
                } catch (final InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    return;
                }
                if (coalescer.hasPending()) {
                    coalescer.flush(deriveDeviceSid(cursorTrackName, cursorDeviceName, cursorDevicePosition));
                }
            }
        }, "bw-brain-param-flush");
        t.setDaemon(true);
        t.start();
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
                // 04.3 gap closure / DEFECT A — bank-activity instrumentation.
                lastBankObservationAt.set(System.currentTimeMillis());
                bankObservationCount.incrementAndGet();
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
                // 04.3 gap closure / DEFECT A — bank-activity instrumentation.
                lastBankObservationAt.set(System.currentTimeMillis());
                bankObservationCount.incrementAndGet();
            });
        }
    }

    /**
     * Phase 4 Plan 04-01 Task 2 fix — EAGERLY wire
     * {@code ClipLauncherSlot.hasContent()} observers for every (track, scene)
     * during {@code init()}. Bitwig forbids observer registration outside
     * init() ("ydq: This can only be called during driver initialization" —
     * live-observed when we attempted lazy wiring from the track-name observer
     * callback). All observers MUST be registered here.
     *
     * <p>REQUIRES {@code createTrackBank(BANK_SIZE, 0, SCENE_COUNT)} — with
     * {@code numScenes=0} every track's {@code clipLauncherSlotBank()} returns
     * null and the per-slot {@code hasContent()} call throws NPE.</p>
     *
     * <p>PULL-ONLY (Pitfall 6 — NEVER offers an event line; the 5-event
     * protocol enum stays unchanged).</p>
     */
    private void wireClipLauncherSlotsEager(final ControllerHost host,
                                            final TrackBank trackBank, final int sceneCount) {
        host.println("[bw-brain] wireClipLauncherSlotsEager: start bankSize=" + bankSize + " sceneCount=" + sceneCount);
        int registered = 0;
        int nullBanks = 0;
        for (int t = 0; t < bankSize; t++) {
            final int trackIdx = t;
            final Track track = trackBank.getItemAt(t);
            final ClipLauncherSlotBank slotBank = track.clipLauncherSlotBank();
            if (slotBank == null) {
                nullBanks++;
                host.println("[bw-brain]   track[" + t + "] name=" + trackNameSafe(trackBank, t)
                        + ": clipLauncherSlotBank()=null (numScenes arg of createTrackBank must be > 0)");
                for (int s = 0; s < sceneCount; s++) {
                    hasContentCache.put(hasContentKey(trackIdx, s), Boolean.FALSE);
                }
                continue;
            }
            for (int s = 0; s < sceneCount; s++) {
                final int sceneIdx = s;
                hasContentCache.put(hasContentKey(trackIdx, sceneIdx), Boolean.FALSE);
                try {
                    slotBank.getItemAt(sceneIdx).hasContent().addValueObserver(
                            (BooleanValueChangedCallback) (boolean has) -> {
                                hasContentCache.put(hasContentKey(trackIdx, sceneIdx), has);
                                // 04.3 gap closure / DEFECT A — bank-activity
                                // instrumentation (the densest population signal:
                                // 128 observers fire as the grid syncs).
                                lastBankObservationAt.set(System.currentTimeMillis());
                                bankObservationCount.incrementAndGet();
                                host.println("[bw-brain]   hasContent fired t=" + trackIdx
                                        + " s=" + sceneIdx + " has=" + has);
                            });
                    registered++;
                } catch (final Throwable e) {
                    host.println("[bw-brain]   hasContent observer registration FAILED t="
                            + trackIdx + " s=" + sceneIdx + ": " + e);
                }
            }
            host.println("[bw-brain]   track[" + t + "] name=" + trackNameSafe(trackBank, t)
                    + ": registered " + sceneCount + " hasContent observers");
        }
        host.println("[bw-brain] wireClipLauncherSlotsEager: done registered=" + registered
                + " nullBanks=" + nullBanks);
    }

    private static String trackNameSafe(final TrackBank trackBank, final int t) {
        try {
            return String.valueOf(trackBank.getItemAt(t).name().get());
        } catch (final Throwable e) {
            return "<" + e.getClass().getSimpleName() + ">";
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
    /**
     * Phase 5 Plan 05-03 (D-05-16) — pull-only tempo cache for the
     * {@code get.project_meta} response. Defaults to the honest 120.0
     * (DEFAULT_PROJECT mirror) until the transport observer fires.
     */
    public double getTempo() { return tempo; }
    /**
     * Phase 5 Plan 05-03 (D-05-16) — pull-only time-signature cache for the
     * {@code get.project_meta} response. Defaults to the honest "4/4".
     */
    public String getTimeSignature() { return timeSignature; }
    public Map<Integer, String> getBankTrackNames() { return bankTrackNames; }
    public int getBankSize() { return bankSize; }
    /** Phase 4 Plan 04-01 — scene-name cache snapshot for the D-12 grid response. */
    public Map<Integer, String> getSceneNames() { return sceneNames; }
    public int getSceneBankSize() { return sceneBankSize; }
    /**
     * Phase 4 Plan 04.3-06 (04.3 gap closure / DEFECT A) — total bank
     * observations fired across the three instrumented bank observer groups
     * (track names + scene names + hasContent). Read by the production
     * suppliers of {@link BankSyncWait#awaitSettled} as its observedCount.
     */
    int getBankObservationCount() { return bankObservationCount.get(); }
    /**
     * Phase 4 Plan 04.3-06 (04.3 gap closure / DEFECT A) — wall-clock ms of
     * the most recent bank observation, 0 when none has fired yet. Read by
     * the production suppliers of {@link BankSyncWait#awaitSettled} as its
     * lastObservationAtMs (0 = "no observation yet" = quiet-settle cannot
     * fire, only threshold or cap can).
     */
    long getLastBankObservationAt() { return lastBankObservationAt.get(); }
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

    /**
     * Phase 5 Plan 05-06 — the init-created remote-controls page (the
     * live-proven automation write surface, capabilities §3 2026-08-22).
     * Package-private: consumed by PullHandlers.cursorDeviceParameterWriter
     * to resolve {@code page.getParameter(i)} knobs for touch/set writes.
     * Null on the test path (no Bitwig host).
     */
    CursorRemoteControlsPage getRemotePage() { return remotePageRef; }

    // --- Phase 5 Plan 05-03 Task 3 getters: device-chain response assembly ---

    /** Chain window size (the createDeviceBank(16) sizing). */
    public int getDeviceBankSize() { return DEVICE_BANK_SIZE; }
    /** Chain slot name cache read ("" when never fired — phantom tail). */
    public String getChainDeviceName(final int slot) {
        return chainDeviceNames.getOrDefault(slot, "");
    }
    /** Chain slot VST/AU flag (false when never fired — honest native default). */
    public boolean isChainDevicePlugin(final int slot) {
        final Boolean v = chainDeviceIsPlugin.get(slot);
        return v == null ? false : v.booleanValue();
    }
    /** Chain slot position (defaults to the bank index until position() fires). */
    public int getChainDevicePosition(final int slot) {
        final Integer v = chainDevicePositions.get(slot);
        return v == null ? slot : v.intValue();
    }
    /** Cursor device chain position (-1 until the position observer fires). */
    public int getCursorDevicePosition() { return cursorDevicePosition; }
    /** Parameter-window binding (exists() cache; false = absent/walk end). */
    public boolean isParamBound(final int index) {
        final Boolean v = paramBound.get(index);
        return v == null ? false : v.booleanValue();
    }
    /** Parameter-window identity ("" when never fired). */
    public String getParamName(final int index) {
        return paramNames.getOrDefault(index, "");
    }
    /** Parameter-window last value (null when never fired — honest omission). */
    public Double getParamValue(final int index) {
        return paramValues.get(index);
    }
    /** Remote-page knob binding (exists() cache). */
    public boolean isRemoteBound(final int slot) {
        final Boolean v = remoteBound.get(slot);
        return v == null ? false : v.booleanValue();
    }
    /** Remote-page knob identity ("" when never fired). */
    public String getRemoteName(final int slot) {
        return remoteNames.getOrDefault(slot, "");
    }
    /** Remote-page knob last value (null when never fired). */
    public Double getRemoteValue(final int slot) {
        return remoteValues.get(slot);
    }
    /** Remote-controls page name ("" when never fired). */
    public String getRemotePageName() { return remotePageName; }

    private static long ts() { return System.currentTimeMillis() / 1000L; }

    /** Small LinkedHashMap builder so event payloads serialize with stable key order. */
    private static Map<String, Object> mapOf(final Object... kv) {
        final Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i + 1 < kv.length; i += 2) {
            m.put((String) kv[i], kv[i + 1]);
        }
        return m;
    }

    // ------------------------------------------------------------------------
    // Phase 5 Plan 05-03 Task 2 — testable observation cores (package-private
    // static nested classes; the PullHandlers.NoteStepWriter injectable-seam
    // precedent: pure logic over an injected line sink, no Bitwig types, so
    // ObserversCoalescingTest exercises them without a live host).
    // ------------------------------------------------------------------------

    /** One coalesced parameter movement (last-value-wins per coalescing key). */
    static final class ParamMovement {
        final int paramIndex;
        final String paramName;
        final String source;
        final double value;

        ParamMovement(final int paramIndex, final String paramName, final String source, final double value) {
            this.paramIndex = paramIndex;
            this.paramName = paramName;
            this.source = source;
            this.value = value;
        }
    }

    /**
     * Per-param last-value-wins coalescer (Pitfall 5 / T-05-06). Movement
     * callbacks ({@link #onValue}) run on the Bitwig controller thread and do
     * ONLY cache writes (T-05-08 — zero computation beyond map puts): the
     * first observation of a key is cached (registration boot fire), an
     * epsilon-equal value is a no-op, and a real movement overwrites the
     * pending slot. {@link #flush(String)} runs on the flush thread, drains
     * the pending map, and offers ONE parameter.changed line per key through
     * the injected sink (production: {@code outbox::offer}; tests: a
     * recording list) — never a direct socket write.
     *
     * <p>V1 note: when the cursor device rebinds to another device, per-key
     * last-values carry over, so each param may emit at most one spurious
     * movement on the first fire under the new device. Bounded (≤ window size
     * per switch, coalesced); reconciling device-switch resets is a
     * reconnect-reconcile responsibility documented with the deviceSid
     * fingerprint.</p>
     */
    static final class ParameterCoalescer {
        private final Consumer<String> sink;
        private final Map<Long, Double> lastValues = new ConcurrentHashMap<>();
        private final Map<Long, Long> movementCounts = new ConcurrentHashMap<>();
        private final Map<Long, ParamMovement> pending = new ConcurrentHashMap<>();

        ParameterCoalescer(final Consumer<String> sink) {
            this.sink = sink;
        }

        /**
         * A parameter value fire. {@code key} is {@link #paramKey}; the
         * source string rides the movement so the emitted event carries it.
         */
        void onValue(final long key, final int paramIndex, final String paramName,
                     final String source, final double value) {
            final Double prev = lastValues.put(key, value);
            if (prev == null) {
                return; // first observation (registration boot fire) — cached only
            }
            if (Math.abs(value - prev.doubleValue()) <= MOVEMENT_EPSILON) {
                return; // float jitter, not a movement
            }
            movementCounts.merge(key, 1L, Long::sum);
            pending.put(key, new ParamMovement(paramIndex, paramName, source, value));
        }

        /**
         * Drain the pending movements, offering one parameter.changed line
         * per key with the given deviceKey fingerprint (computed by the
         * caller on the flush thread — callbacks never hash). Returns the
         * number of events offered.
         */
        int flush(final String deviceKey) {
            int offered = 0;
            final var it = pending.entrySet().iterator();
            while (it.hasNext()) {
                final var entry = it.next();
                it.remove();
                final ParamMovement m = entry.getValue();
                final Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("deviceKey", deviceKey);
                payload.put("paramIndex", m.paramIndex);
                payload.put("paramName", m.paramName);
                payload.put("source", m.source);
                payload.put("value", m.value);
                sink.accept(LineJson.event("parameter.changed", payload, ts()));
                offered++;
            }
            return offered;
        }

        /** Total movement count for a key (diagnostics + behavior tests). */
        long movementCount(final long key) {
            final Long v = movementCounts.get(key);
            return v == null ? 0L : v.longValue();
        }

        /** Whether any movement awaits the next flush. */
        boolean hasPending() {
            return !pending.isEmpty();
        }
    }

    /**
     * D-05-05 automation-write state emitter. The four transport observers
     * delegate here; each field's FIRST fire (registration boot state) is
     * cached without emitting (the skipFirstFire precedent — the daemon's
     * first transport.changed must be a REAL change); every later fire caches
     * + pushes transport.changed carrying the FULL 4-field automationWrite
     * snapshot (schema-required fields; consumers never see a partial
     * object). writeMode values outside the schema enum (latch/touch/write)
     * keep the last known valid mode (defensive — the wire line stays
     * schema-valid).
     */
    static final class AutomationWriteEmitter {
        static final String DEFAULT_WRITE_MODE = "write";
        private final Consumer<String> sink;
        private boolean arrangerWriteEnabled;
        private boolean launcherWriteEnabled;
        private boolean overrideActive;
        private String writeMode = DEFAULT_WRITE_MODE;
        private final boolean[] skipFirstFire = {true, true, true, true};

        AutomationWriteEmitter(final Consumer<String> sink) {
            this.sink = sink;
        }

        void onArrangerWriteEnabled(final boolean v) {
            arrangerWriteEnabled = v;
            if (skipFirstFire[0]) { skipFirstFire[0] = false; return; }
            emit();
        }

        void onLauncherWriteEnabled(final boolean v) {
            launcherWriteEnabled = v;
            if (skipFirstFire[1]) { skipFirstFire[1] = false; return; }
            emit();
        }

        void onOverrideActive(final boolean v) {
            overrideActive = v;
            if (skipFirstFire[2]) { skipFirstFire[2] = false; return; }
            emit();
        }

        void onWriteMode(final String v) {
            if ("latch".equals(v) || "touch".equals(v) || "write".equals(v)) {
                writeMode = v;
            }
            if (skipFirstFire[3]) { skipFirstFire[3] = false; return; }
            emit();
        }

        private void emit() {
            final Map<String, Object> automationWrite = new LinkedHashMap<>();
            automationWrite.put("arrangerWriteEnabled", arrangerWriteEnabled);
            automationWrite.put("launcherWriteEnabled", launcherWriteEnabled);
            automationWrite.put("overrideActive", overrideActive);
            automationWrite.put("writeMode", writeMode);
            sink.accept(LineJson.event("transport.changed",
                    mapOf("automationWrite", automationWrite), ts()));
        }
    }

    /**
     * Phase 5 Plan 05-03 — V1 deviceSid fingerprint (the ClipSid.derive
     * discipline applied to devices): {@code "dev_" + sha256(cursorTrackName
     * + ":" + deviceName + ":" + position).slice(0,16)}. The
     * parameter.changed {@code deviceKey} IS the AutomationScope
     * {@code deviceSid} value (same fingerprint — the 05-05 apply path
     * compares like-for-like; T-05-07: track+device+position sensitivity
     * guards against reconnect/reorder mis-targeting). Null components fold
     * to "" so an early/unfired cache never throws; reconnect reconciliation
     * remains the daemon's responsibility (documented V1 gap, same stance as
     * ClipSid).
     */
    static String deriveDeviceSid(final String cursorTrackName, final String deviceName, final int position) {
        final String input = (cursorTrackName == null ? "" : cursorTrackName)
                + ":" + (deviceName == null ? "" : deviceName)
                + ":" + position;
        try {
            final byte[] hash = MessageDigest.getInstance("SHA-256")
                    .digest(input.getBytes(StandardCharsets.UTF_8));
            final String hex = HexFormat.of().formatHex(hash).substring(0, 16);
            return "dev_" + hex;
        } catch (final Exception e) {
            // SHA-256 is JDK-guaranteed; the pattern-valid fallback keeps the
            // wire line schema-valid (the ClipSid.derive stance).
            return "dev_0000000000000000";
        }
    }
}
