import { ownerAccessHttp } from "@/src/control/http.server";

export async function GET() {
  return ownerAccessHttp.start();
}
