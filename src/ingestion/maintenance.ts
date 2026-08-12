import "server-only";

import { RawDeletionWorker, UploadIntentSweeper } from "./deletion";
import type { BlobUploadProvider } from "./service";
import type { CareerIngestionOperationalStatus, CareerIngestionStore } from "./store";

export class CareerIngestionMaintenance {
  readonly #store: CareerIngestionStore;
  readonly #sweeper: UploadIntentSweeper;
  readonly #deletion: RawDeletionWorker;

  constructor(input: {
    store: CareerIngestionStore;
    blob: BlobUploadProvider;
    now?: () => Date;
  }) {
    this.#store = input.store;
    this.#sweeper = new UploadIntentSweeper({ store: input.store, now: input.now });
    this.#deletion = new RawDeletionWorker({ store: input.store, blob: input.blob, now: input.now });
  }

  async run(): Promise<{
    expiredIntents: number;
    deletionId: string | null;
    deletionState: "pending" | "leased" | "applied" | "stuck" | null;
  }> {
    const expiredIntents = await this.#sweeper.run();
    const deletion = await this.#deletion.runOne();
    return {
      expiredIntents,
      deletionId: deletion?.id ?? null,
      deletionState: deletion?.state ?? null,
    };
  }

  status(): Promise<CareerIngestionOperationalStatus> {
    return this.#store.ingestionStatus();
  }
}
