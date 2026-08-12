import { z } from "zod";

import { runWithBoundedRetries } from "./retry";

export const PINNED_REPOSITORIES_QUERY = `
  query PortfolioEvidence($login: String!) {
    user(login: $login) {
      login
      databaseId
      pinnedItems(first: 6, types: REPOSITORY) {
        nodes { ...RepositoryEvidence }
      }
      repositories(first: 100, privacy: PUBLIC, ownerAffiliations: OWNER, orderBy: { field: NAME, direction: ASC }) {
        nodes { ...RepositoryEvidence }
        pageInfo { hasNextPage endCursor }
      }
    }
  }

  fragment RepositoryEvidence on Repository {
    id
    name
    nameWithOwner
    url
    description
    homepageUrl
    isArchived
    isDisabled
    isFork
    defaultBranchRef {
      name
      target {
        ... on Commit {
          oid
          history(first: 20) {
            nodes {
              oid
              committedDate
              messageHeadline
              author { user { login } }
            }
          }
        }
      }
    }
  }
`;

const commitSchema = z
  .object({
    oid: z.string().min(1),
    committedDate: z.iso.datetime({ offset: true }),
    messageHeadline: z.string(),
    author: z.object({ user: z.object({ login: z.string() }).nullable() }).nullable().optional(),
    authorLogin: z.string().nullable().optional(),
  })
  .passthrough()
  .transform((commit) => ({
    oid: commit.oid,
    committedDate: commit.committedDate,
    messageHeadline: commit.messageHeadline,
    authorLogin: commit.authorLogin ?? commit.author?.user?.login ?? null,
  }));

const repositoryGraphSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    nameWithOwner: z.string().min(1),
    url: z.url(),
    description: z.string().nullable(),
    homepageUrl: z.string().nullable(),
    isArchived: z.boolean(),
    isDisabled: z.boolean(),
    isFork: z.boolean(),
    defaultBranchRef: z
      .object({
        name: z.string().min(1),
        target: z.object({
          oid: z.string().optional(),
          history: z.object({ nodes: z.array(commitSchema.nullable()) }),
        }),
      })
      .nullable(),
  })
  .passthrough();

const graphResponseSchema = z.object({
  data: z.object({
    user: z
      .object({
        login: z.string().min(1),
        databaseId: z.number().int().positive(),
        pinnedItems: z.object({ nodes: z.array(repositoryGraphSchema.nullable()) }),
        repositories: z.object({
          nodes: z.array(repositoryGraphSchema.nullable()),
          pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }),
        }),
      })
      .nullable(),
  }),
  errors: z.array(z.object({ message: z.string() }).passthrough()).optional(),
});

export type RepositoryGraph = z.infer<typeof repositoryGraphSchema>;

export interface PublicRepositoryGraph {
  owner: { login: string; numericId: string };
  pinnedRepositories: RepositoryGraph[];
  repositories: RepositoryGraph[];
}

export interface ConditionalRepresentation {
  etag: string;
  body: unknown;
}

export type RestFetchResult =
  | {
      status: "success" | "not-modified";
      httpStatus: 200 | 304;
      etag?: string;
      body: unknown;
      attempts: number;
    }
  | {
      status: "failed";
      httpStatus: number | null;
      attempts: number;
      errorCode: string;
    };

type ProviderOptions = {
  token?: string;
  fetch?: (request: Request) => Promise<Response>;
  wait?: (milliseconds: number) => Promise<void>;
  maxAttempts?: number;
};

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export class GitHubHttpProvider {
  readonly #token?: string;
  readonly #fetch: (request: Request) => Promise<Response>;
  readonly #wait: (milliseconds: number) => Promise<void>;
  readonly #maxAttempts: number;

  constructor(options: ProviderOptions = {}) {
    this.#token = options.token;
    this.#fetch = options.fetch ?? fetch;
    this.#wait = options.wait ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.#maxAttempts = options.maxAttempts ?? 3;
  }

  async fetchRepositoryGraph(login: string): Promise<PublicRepositoryGraph> {
    const response = await this.#requestWithRetries(
      new Request("https://api.github.com/graphql", {
        method: "POST",
        headers: this.#headers({ "content-type": "application/json" }),
        body: JSON.stringify({ query: PINNED_REPOSITORIES_QUERY, variables: { login } }),
      }),
    );
    if (!response?.ok) throw new Error("github-graphql-unavailable");
    const parsed = graphResponseSchema.parse(await response.json());
    if (parsed.errors?.length || !parsed.data.user) throw new Error("github-graphql-invalid-response");
    if (parsed.data.user.repositories.pageInfo.hasNextPage) throw new Error("github-repository-graph-truncated");
    return {
      owner: { login: parsed.data.user.login, numericId: String(parsed.data.user.databaseId) },
      pinnedRepositories: parsed.data.user.pinnedItems.nodes.filter((item): item is RepositoryGraph => item !== null),
      repositories: parsed.data.user.repositories.nodes.filter((item): item is RepositoryGraph => item !== null),
    };
  }

  async fetchRest(endpoint: string, prior?: ConditionalRepresentation): Promise<RestFetchResult> {
    const url = endpoint.startsWith("https://") ? endpoint : `https://api.github.com${endpoint}`;
    const headers: Record<string, string> = {};
    if (prior) headers["if-none-match"] = prior.etag;
    const attempted = await runWithBoundedRetries(
      () => this.#fetch(new Request(url, { headers: this.#headers(headers) })),
      (response) => RETRYABLE_STATUS.has(response.status),
      { maxAttempts: this.#maxAttempts, initialDelayMs: 100, wait: this.#wait },
    );
    const response = attempted.value;
    if (response?.status === 304 && prior) {
      return {
        status: "not-modified",
        httpStatus: 304,
        etag: response.headers.get("etag") ?? prior.etag,
        body: prior.body,
        attempts: attempted.attempts,
      };
    }
    if (response?.ok) {
      return {
        status: "success",
        httpStatus: 200,
        etag: response.headers.get("etag") ?? undefined,
        body: await response.json(),
        attempts: attempted.attempts,
      };
    }
    const lastStatus = response?.status ?? null;
    return {
      status: "failed",
      httpStatus: lastStatus,
      attempts: attempted.attempts,
      errorCode: lastStatus === 404 ? "not-found" : "github-unavailable",
    };
  }

  #headers(extra: Record<string, string> = {}): Headers {
    const headers = new Headers({
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "agentic-portfolio-evidence-collector/1.0",
      ...extra,
    });
    if (this.#token) headers.set("authorization", `Bearer ${this.#token}`);
    return headers;
  }

  async #requestWithRetries(request: Request): Promise<Response | null> {
    const attempted = await runWithBoundedRetries(
      () => this.#fetch(request.clone()),
      (response) => RETRYABLE_STATUS.has(response.status),
      { maxAttempts: this.#maxAttempts, initialDelayMs: 100, wait: this.#wait },
    );
    return attempted.value;
  }
}
