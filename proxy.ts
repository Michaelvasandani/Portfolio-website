import type { NextRequest } from "next/server";

import { concealedPrivateResponse } from "@/src/control/security";

export function proxy(request: NextRequest) {
  const session = request.cookies.get("__Host-portfolio-session")?.value ?? "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(session)) {
    return concealedPrivateResponse();
  }
}

export const config = {
  matcher: ["/control/:path*"],
};
