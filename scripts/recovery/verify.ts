import { runLocalRecoveryHarness } from "../../src/recovery/local-harness";

console.log(JSON.stringify(await runLocalRecoveryHarness(), null, 2));
