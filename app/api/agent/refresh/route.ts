import { isAuthorizedCronRequest } from "@/src/agentic/cron-auth";
import { runProductionPortfolioAgent } from "@/src/agentic/server";

export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request, process.env.CRON_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return Response.json(await runProductionPortfolioAgent());
  } catch (error) {
    console.error("Portfolio agent refresh failed", error);
    return Response.json({ error: "agent-refresh-failed" }, { status: 503 });
  }
}
