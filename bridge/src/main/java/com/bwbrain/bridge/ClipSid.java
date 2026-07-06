// bridge/src/main/java/com/bwbrain/bridge/ClipSid.java
//
// Phase 03.1-02 Task 2 (GREEN) — D-01 V1 clipSid construction.
//
// The launcher-clip NAME accessor is definitively NOT in extension-api:21
// (javap-verified: `Clip` has `setName(String)` but no reader; see
// RESEARCH §D-01 + docs/bitwig-capabilities.md §6). Given that constraint,
// the only identity signals available WITHOUT adding new observer groups
// are the parent track's STATE-04 fingerprint + the cursor clip's loop
// length in beats. This helper derives a V1 clipSid from those two inputs:
//
//   clipSid = "clip_" + sha256(`${trackSid}:${loopBeats}`).slice(0,16)
//
// Binding invariants (ClipSidTest pins these):
//   - matches ^clip_[0-9a-f]{16}$ (STATE-04 family pattern, project-state
//     .schema.json:63 + event.schema.json payload.clipSid).
//   - stable across note edits: trackSid + loopBeats do NOT change when
//     notes are added/removed/edited. This is the M4 UAT observed failure
//     (320 ops landed on an 8-bar clip when a 4-bar was previewed); the V1
//     hash catches it (different loopBeats -> different clipSid).
//
// Pure static helper (mirrors LineJson.java:16-31): package-private ctor,
// JDK-only deps (MessageDigest + HexFormat — no new Maven dep), no Bitwig
// import so it is unit-testable from a plain JUnit run.
package com.bwbrain.bridge;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;

public final class ClipSid {

    private ClipSid() {} // pure helper — never instantiated

    /**
     * D-01 V1 clipSid construction. Stable across note edits (trackSid +
     * loopBeats do not change on note mutation). Matches
     * {@code ^clip_[0-9a-f]{16}$} (STATE-04 family).
     *
     * <p>Computed in the BRIDGE (it holds the {@code PinnableCursorClip}
     * proxy; the daemon cannot reach {@code getLoopLength()}). Propagated
     * via the D-03a push event payload AND the D-03b pull response.</p>
     *
     * <p>Residual risk: same-track same-length clips collide. Documented in
     * RESEARCH.md §D-01(c); deferred to V2 (ClipLauncherSlotBank scene-index
     * disambiguates within track). Within one selection the cursor sits on
     * exactly one clip, so within-selection ambiguity is impossible — the
     * open vector is preview-clip-A then select-clip-B (same track + length)
     * then apply. The V1 hash closes the OBSERVED M4 failure (different
     * loopBeats); the residual same-length case is the documented gap.</p>
     *
     * @param trackSid  the parent track's STATE-04 fingerprint
     *                  ({@code ^trk_[0-9a-f]{16}$}). The bridge caches this
     *                  in {@link Observers#getCursorTrackName()} today; a
     *                  cached cursor-track-sid field lands alongside the V1
     *                  work when the daemon-side fingerprint map exposes it.
     *                  For V1 the bridge passes the raw cursor track NAME
     *                  here — the daemon fold is opaque on the value (the
     *                  schema only checks the output pattern, not the input
     *                  sid-vs-name distinction).
     * @param loopBeats the cursor clip's loop length in beats, from
     *                  {@code cursorClip.getLoopLength().get()}.
      * @return a 32-char clipSid matching {@code ^clip_[0-9a-f]{16}$}.
     */
    public static String derive(final String trackSid, final double loopBeats) {
        final String input = trackSid + ":" + loopBeats;
        try {
            final byte[] hash = MessageDigest.getInstance("SHA-256")
                    .digest(input.getBytes(StandardCharsets.UTF_8));
            final String hex = HexFormat.of().formatHex(hash).substring(0, 16);
            return "clip_" + hex;
        } catch (final Exception e) {
            // SHA-256 is JDK-guaranteed (NoSuchAlgorithmException is unreachable
            // for "SHA-256"); the catch exists for completeness + to keep the
            // method total. The fallback is pattern-valid so the daemon's Ajv
            // gate accepts the line and the apply pre-flight catches any
            // mismatch on the consuming side (RESEARCH §D-01 + AGENTS.md
            // §What NOT to Use forbids jakarta.xml.bind.DatatypeConverter).
            return "clip_0000000000000000";
        }
    }

    /**
     * D-12 grid-clip disambiguator overload (Phase 4 Plan 04-01). The V1
     * {@link #derive(String, double)} hash collides for same-track same-length
     * clips (RESEARCH §D-01(c) — the documented V1 gap). For launcher-grid
     * cells, the sceneIdx is a per-track-within-grid disambiguator: same track
     * + same loop length + DIFFERENT scene → different clipSid.
     *
     * <p>Implementation: re-use the existing SHA-256 hash with an extended
     * input ({@code trackSid + ":s" + sceneIdx}). The output stays
     * {@code ^clip_[0-9a-f]{16}$} (the STATE-04 family pattern). Used by
     * {@link LauncherGridWalker} when accumulating the per-cell clipSid in
     * the D-12 grid response.</p>
     *
     * @param trackSid  the parent track's identity (V1: raw cursor track name)
     * @param loopBeats the cell clip's loop length in beats
     * @param sceneIdx  the scene slot index within the track's clip-launcher column
     * @return a clipSid matching {@code ^clip_[0-9a-f]{16}$}
     */
    public static String derive(final String trackSid, final double loopBeats, final int sceneIdx) {
        return derive(trackSid + ":s" + sceneIdx, loopBeats);
    }
}
