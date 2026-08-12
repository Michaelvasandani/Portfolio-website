import { careerIngestionHttp } from "@/src/ingestion/http.server";

export async function POST(request: Request) {
  return careerIngestionHttp.complete(request);
}
