import { timingSafeEqual } from "node:crypto";

export function isAuthorizedCronRequest(request: Request, secret: string | undefined): boolean {
  const authorization = request.headers.get("authorization");
  if (!secret || !authorization) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(authorization);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
