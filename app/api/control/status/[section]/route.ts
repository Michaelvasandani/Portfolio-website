import { ownerAccessHttp } from "@/src/control/http.server";

export async function GET(
  request: Request,
  context: { params: Promise<{ section: string }> },
) {
  const { section } = await context.params;
  return ownerAccessHttp.status(request, section);
}
