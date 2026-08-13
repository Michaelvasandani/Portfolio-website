import { ownerAccessHttp } from "@/src/control/http.server";

export async function POST(request: Request) {
  return ownerAccessHttp.command(request);
}
