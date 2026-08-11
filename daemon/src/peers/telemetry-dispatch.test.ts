import { describe, expect, it, vi } from "vitest";
import { TelemetryDispatch } from "./telemetry-dispatch.js";

const snapshot = { type:"telemetry.snapshot", projectId:"project:1", instanceId:"instance:1", sequence:1, droppedSnapshots:0, aggregate:{ rms:[0.1], peak:[0.2], noteDensity:1, pitchClass:Array(12).fill(0), velocityBins:Array(8).fill(0), rhythmBins:Array(16).fill(0), transport:{playing:false,tempo:120,numerator:4,denominator:4}}, recentNotes:[] };
describe("TelemetryDispatch",()=>{
  it("stores only schema-valid aggregate snapshots in confirmed targeted scope",()=>{
    const requireConfirmed=vi.fn(); const dispatch=new TelemetryDispatch({requireConfirmed} as never);
    expect(dispatch.ingest("conn:1",snapshot)).toBe(true); expect(requireConfirmed).toHaveBeenCalledWith("conn:1","project:1","instance:1"); expect(dispatch.get("project:1","instance:1")).toEqual(snapshot);
  });
  it("refuses raw PCM, limit+1 notes, wrong scope, and active reasoning messages",()=>{
    const dispatch=new TelemetryDispatch({requireConfirmed:()=>({})} as never);
    expect(dispatch.ingest("c",{...snapshot,pcm:[0.1]})).toBe(false);
    expect(dispatch.ingest("c",{...snapshot,recentNotes:Array(17).fill({offset:0,port:0,channel:0,key:60,velocity:1,kind:"on"})})).toBe(false);
    expect(dispatch.ingest("c",{type:"analysis.request",requestId:"r",projectId:"project:1",instanceId:"instance:1"})).toBe(false);
    const denied=new TelemetryDispatch({requireConfirmed:()=>{throw new Error("scope_not_confirmed")}} as never); expect(denied.ingest("other",snapshot)).toBe(false);
  });
});
