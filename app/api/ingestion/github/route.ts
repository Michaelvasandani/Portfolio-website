import { githubIngestionHttp } from "@/src/github/http.server";

export async function POST(request: Request) {
  return githubIngestionHttp.post(request);
}
