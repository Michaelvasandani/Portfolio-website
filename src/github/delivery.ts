import { createHmac, timingSafeEqual } from "node:crypto";

const signaturePattern = /^sha256:([a-f0-9]{64})$/;

export function signGitHubDelivery(rawBody: string, secret: string): `sha256:${string}` {
  return `sha256:${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

export function verifyGitHubDeliverySignature(rawBody: string, signature: string, secret: string): boolean {
  const received = signaturePattern.exec(signature)?.[1];
  if (!received) return false;
  const expected = signGitHubDelivery(rawBody, secret).slice(7);
  return timingSafeEqual(Buffer.from(received, "hex"), Buffer.from(expected, "hex"));
}
