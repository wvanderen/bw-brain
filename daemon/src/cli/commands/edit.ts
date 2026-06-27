// daemon/src/cli/commands/edit.ts
//
// `bw-edit` — STUB (ships in M2: reversible MIDI patching). Emits a structured
// not_implemented JSON result + exits 0 (CLI-01). The bare invocation runs the
// program-level action → emitStub. `--help` is intercepted first.
//
// Self-contained: registers + parses process.argv.
import { program } from "commander";
import { emitStub } from "../stubs.js";

program
  .name("bw-edit")
  .description("Reversible MIDI patching (stub — ships in M2)")
  .action(() => emitStub({ name: "bw-edit", availableFrom: "M2" }));

program.parse(process.argv);
