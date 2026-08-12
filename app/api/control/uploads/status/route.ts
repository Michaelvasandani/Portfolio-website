import { careerIngestionHttp } from "@/src/ingestion/http.server";

export async function GET(request: Request) {
  return careerIngestionHttp.status(request);
}
