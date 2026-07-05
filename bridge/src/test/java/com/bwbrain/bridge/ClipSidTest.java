// bridge/src/test/java/com/bwbrain/bridge/ClipSidTest.java
//
// Phase 03.1-02 Task 2 (TDD RED) — D-01 V1 clipSid derivation property tests.
//
// The bridge computes a V1 clipSid as `"clip_" + sha256(trackSid:loopBeats)
// .slice(0,16)` (RESEARCH §D-01(a)). Binding invariants:
//   - matches ^clip_[0-9a-f]{16}$ (STATE-04 family)
//   - deterministic across calls with the same inputs
//   - stable across note edits (trackSid + loopBeats do not change on note
//     mutation — the M4 UAT observed failure mode)
//   - distinguishes the M4 UAT 4-bar vs 8-bar case (different loopBeats ->
//     different clipSid)
//
// Mirrors PullHandlersApplyPatchTest.java: pure JUnit 5 (no Mockito, no live
// Bitwig). RED authored BEFORE ClipSid.java exists; the test must fail with
// a compilation error until GREEN lands the helper.
package com.bwbrain.bridge;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class ClipSidTest {

    @Test
    void deriveIsDeterministicAndMatchesPattern() {
        // The two binding invariants: determinism (same inputs -> same output,
        // stable across note edits because trackSid + loopBeats do not change
        // on note mutation) + the STATE-04 family pattern.
        final String a = ClipSid.derive("trk_abc123def4567890", 4.0);
        final String b = ClipSid.derive("trk_abc123def4567890", 4.0);
        assertEquals(a, b, "stable across calls (stable across note edits by design)");
        assertTrue(a.matches("^clip_[0-9a-f]{16}$"),
                "matches STATE-04 pattern; got: " + a);
    }

    @Test
    void differentLoopBeatsProduceDifferentClipSids() {
        // The M4 UAT failure mode: a 4-bar clip and an 8-bar clip on the SAME
        // track produced the same identity, so 320 ops landed on the wrong clip.
        // The V1 hash input (trackSid:loopBeats) catches this: different
        // loopBeats -> different clipSid -> the pre-flight can distinguish them.
        final String fourBar  = ClipSid.derive("trk_abc123def4567890", 4.0);
        final String eightBar = ClipSid.derive("trk_abc123def4567890", 8.0);
        assertNotEquals(fourBar, eightBar,
                "different loopBeats MUST produce different clipSids (M4 UAT failure mode)");
        assertTrue(fourBar.matches("^clip_[0-9a-f]{16}$"));
        assertTrue(eightBar.matches("^clip_[0-9a-f]{16}$"));
    }

    @Test
    void differentTrackSidProducesDifferentClipSids() {
        // Different parent track -> different clipSid (the hash input includes
        // trackSid). Pinned because a same-track-only hash would be too weak.
        final String a = ClipSid.derive("trk_aaaaaaaaaaaaaaaa", 4.0);
        final String b = ClipSid.derive("trk_bbbbbbbbbbbbbbbb", 4.0);
        assertNotEquals(a, b);
        assertTrue(a.matches("^clip_[0-9a-f]{16}$"));
        assertTrue(b.matches("^clip_[0-9a-f]{16}$"));
    }

    @Test
    void noExceptionOnSha256AndFallbackMatchesPattern() {
        // JDK guarantee: SHA-256 is JDK-built-in and MessageDigest.getInstance
        // never throws NoSuchAlgorithmException for "SHA-256". The empty /
        // zero inputs must NOT crash + the (unreachable) fallback constant
        // must still match the pattern so the daemon's Ajv gate accepts the
        // line and the pre-flight catches any mismatch.
        final String emptyInput = ClipSid.derive("", 0.0);
        assertNotNull(emptyInput);
        assertTrue(emptyInput.matches("^clip_[0-9a-f]{16}$"),
                "fallback must remain pattern-valid; got: " + emptyInput);
    }
}
