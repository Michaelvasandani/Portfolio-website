import { ownerAccessHttp } from "@/src/control/http.server";

export async function GET(request: Request) {
  return ownerAccessHttp.callback(request);
}
