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
//   - TrackBank.getTrack(i).name().addValueObserver(cb)[DeviceChain.name() via Track->Channel]
//
// Each observer carries its own skipFirstFire guard: Bitwig value observers fire
// once on registration with the boot state (spike lines 73-77); skip that initial
// fire so the daemon's first received line is a REAL change, not a boot snapshot.
package com.bwbrain.bridge;

import com.bitwig.extension.callback.BooleanValueChangedCallback;
import com.bitwig.extension.callback.DoubleValueChangedCallback;
import com.bitwig.extension.callback.IntegerValueChangedCallback;
import com.bitwig.extension.callback.StringValueChangedCallback;
import com.bitwig.extension.controller.api.ControllerHost;
import com.bitwig.extension.controller.api.CursorDevice;
import com.bitwig.extension.controller.api.CursorTrack;
import com.bitwig.extension.controller.api.PinnableCursorClip;
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
        // NOTE: the public Clip/CursorClip surface has no name() accessor (Clip
        // extends ObjectProxy; the launcher-clip NAME accessor is pending Task-3
        // live verification). getLoopLength() (Clip) changes whenever a different
        // clip is selected/pinned, so it serves as the clip-selection-change proxy
        // that emits clip.name_changed — the event TYPE is emitted; the human
        // name string is filled in by the Task-3 live probe.
        final AtomicBoolean skip = new AtomicBoolean(true);
        cursorClip.getLoopLength().addValueObserver((DoubleValueChangedCallback) (double len) -> {
            if (skip.getAndSet(false)) { return; }
            outbox.offer(LineJson.event("clip.name_changed", mapOf(), ts()));
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
        // Windowed TrackBank[N=8] (D-01). In-window getTrack(int) is non-deprecated
        // (capabilities doc §4); the deprecated form is the cursor-following 0-arg.
        for (int i = 0; i < bankSize; i++) {
            final Track t = trackBank.getTrack(i);
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

    // --- snapshot getters for PullHandlers (get.project_summary) ---

    public int getCursorSlot() { return cursorSlot; }
    public String getCursorTrackName() { return cursorTrackName; }
    public String getCursorDeviceName() { return cursorDeviceName; }
    public boolean isPlaying() { return playing; }
    public Map<Integer, String> getBankTrackNames() { return bankTrackNames; }
    public int getBankSize() { return bankSize; }

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
