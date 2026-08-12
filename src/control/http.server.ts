import "server-only";

import { getOwnerAccessRuntime } from "./auth/runtime.server";
import { OwnerAccessHttpController } from "./http";

export const ownerAccessHttp = new OwnerAccessHttpController(getOwnerAccessRuntime);
