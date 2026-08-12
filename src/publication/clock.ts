import type { PublicationClock } from "./contracts";

export class ManualPublicationClock implements PublicationClock {
  #value: Date;
  constructor(value = "2026-08-12T22:00:00.000Z") { this.#value = new Date(value); }
  now() { return new Date(this.#value); }
  advance(milliseconds: number) { this.#value = new Date(this.#value.getTime() + milliseconds); }
}
