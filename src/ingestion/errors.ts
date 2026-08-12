export const careerIngestionFailureCodes = [
  "upload-too-large",
  "declared-type-unsupported",
  "upload-intent-invalid",
  "upload-intent-expired",
  "upload-grant-invalid",
  "upload-provider-unavailable",
  "signature-mismatch",
  "hash-mismatch",
  "parser-incompatible",
  "encrypted-document",
  "image-only-document",
  "malformed-document",
  "ambiguous-parentage",
  "unknown-material-section",
  "duplicate-conflict",
  "dropped-text",
  "person-name-missing",
  "date-unparseable",
  "unsafe-url",
  "secret-detected",
  "phone-number-detected",
  "street-address-detected",
  "metadata-detected",
  "contact-not-allowlisted",
  "macro-detected",
  "linked-resource-detected",
  "sandbox-network-enabled",
  "sandbox-time-limit",
  "sandbox-memory-limit",
  "sandbox-file-count-limit",
  "sandbox-expansion-limit",
  "sandbox-text-size-limit",
  "sandbox-policy-mismatch",
  "sandbox-report-invalid",
  "sandbox-unavailable",
  "normalization-invalid",
] as const;

export type CareerIngestionFailureCode = (typeof careerIngestionFailureCodes)[number];

export class CareerIngestionError extends Error {
  constructor(readonly code: CareerIngestionFailureCode) {
    super("Career upload was rejected. Review the private diagnostic code and submit a complete replacement.");
    this.name = "CareerIngestionError";
  }
}
