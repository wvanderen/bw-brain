// daemon/src/cli/commands/arrange.ts
//
// `bw-arrange` — STUB (ships in M3: arrangement intelligence). Emits a structured
// not_implemented JSON result + exits 0 (CLI-01). The bare invocation runs the
// program-level action → emitStub. `--help` is intercepted by commander first.
//
// Self-contained: registers + parses process.argv.
import { program } from "commander";
import { emitStub } from "../stubs.js";

program
  .name("bw-arrange")
  .description("Arrangement intelligence (stub — ships in M3)")
  .action(() => emitStub({ name: "bw-arrange", availableFrom: "M3" }));

program.parse(process.argv);
