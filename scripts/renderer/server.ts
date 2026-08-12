import { spawn, type ChildProcess } from "node:child_process";

export async function startRendererServer(port: number, mode: "dev" | "start" = "start"): Promise<{ origin: string; stop: () => void }> {
  const origin = `http://127.0.0.1:${port}`;
  const server: ChildProcess = spawn("pnpm", ["next", mode, "--hostname", "127.0.0.1", "--port", String(port)], {
    stdio: "ignore",
    detached: true,
  });

  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      if ((await fetch(origin)).ok) {
        return { origin, stop: () => { if (server.pid) process.kill(-server.pid, "SIGTERM"); } };
      }
    } catch { /* server startup */ }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }

  if (server.pid) process.kill(-server.pid, "SIGTERM");
  throw new Error(`Timed out waiting for renderer server at ${origin}.`);
}
