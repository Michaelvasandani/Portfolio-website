import "server-only";

import { GitHubIngestionHttpController } from "./http";
import { getGitHubIngestionRuntime } from "./runtime.server";

export const githubIngestionHttp = new GitHubIngestionHttpController(getGitHubIngestionRuntime);
