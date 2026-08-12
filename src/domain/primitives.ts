import { z } from "zod";

export const sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const immutableIdSchema = z.string().min(1).regex(/^[a-z]+:[A-Za-z0-9._-]+$/);
export const isoDateTimeSchema = z.iso.datetime({ offset: true });
export const httpsUrlSchema = z.url().refine((url) => url.startsWith("https://"), "HTTPS URL required");
