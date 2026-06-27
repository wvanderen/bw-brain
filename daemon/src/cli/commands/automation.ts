// daemon/src/cli/commands/automation.ts
//
// `bw-automation` — STUB (ships in M4: automation & device workflows). Emits a
// structured not_implemented JSON result + exits 0 (CLI-01). The bare invocation
// runs the program-level action → emitStub. `--help` is intercepted first.
//
// Self-contained: registers + parses process.argv.
import { program } from "commander";
import { emitStub } from "../stubs.js";

program
  .name("bw-automation")
  .description("Automation & device workflows (stub — ships in M4)")
  .action(() => emitStub({ name: "bw-automation", availableFrom: "M4" }));

program.parse(process.argv);
