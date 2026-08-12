import { runLocalPublicationHarness } from "../../src/publication/local-harness";

process.stdout.write(`${JSON.stringify(await runLocalPublicationHarness(), null, 2)}\n`);
