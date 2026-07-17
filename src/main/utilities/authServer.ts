import { createServer, Server, ServerResponse } from "http";

let serverInstance: Server | null = null;
let pendingReject: ((err: Error) => void) | null = null;
const OAUTH_TIMEOUT_MS = 2 * 60 * 1000;
const OAUTH_PORT = 53213;

export type OAuthCallbackProvider =
  | "microsoft"
  | "discord"
  | "elyby"
  | "twitch"
  | "github";

function parseExpectedState(expectedState: string): OAuthCallbackProvider {
  const [provider, nonce] = expectedState.split(":", 2);

  if (!nonce || !/^[a-zA-Z0-9-]{16,}$/.test(nonce)) {
    throw new Error("Invalid OAuth state.");
  }

  if (
    provider === "microsoft" ||
    provider === "discord" ||
    provider === "elyby" ||
    provider === "twitch" ||
    provider === "github"
  ) {
    return provider;
  }

  throw new Error("Invalid OAuth provider.");
}

function redirect(res: ServerResponse, location: string) {
  res.statusCode = 302;
  res.setHeader("Location", location);
  res.end();
}

function closeServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!serverInstance) return resolve();

    const s = serverInstance;
    serverInstance = null;

    try {
      s.close(() => resolve());
    } catch {
      resolve();
    }
  });
}

export async function stopOAuthServer(
  reason = "OAuth server was stopped.",
): Promise<void> {
  const rejectPending = pendingReject;
  pendingReject = null;

  await closeServer();

  rejectPending?.(new Error(reason));
}

export function startOAuthServer(expectedState: string): Promise<{
  code: string;
  provider: OAuthCallbackProvider;
}> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId: NodeJS.Timeout | null = null;
    let expectedProvider: OAuthCallbackProvider;

    try {
      expectedProvider = parseExpectedState(expectedState);
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    const safeResolve = (data: {
      code: string;
      provider: OAuthCallbackProvider;
    }) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      pendingReject = null;
      resolve(data);
    };

    const safeReject = (err: Error) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      pendingReject = null;
      reject(err);
    };

    (async () => {
      if (pendingReject) {
        pendingReject(new Error("OAuth server was restarted."));
      }

      pendingReject = safeReject;

      await closeServer();

      timeoutId = setTimeout(async () => {
        await closeServer();
        safeReject(new Error("OAuth callback timed out."));
      }, OAUTH_TIMEOUT_MS);

      const server = createServer(async (req, res) => {
        let url: URL;
        try {
          url = new URL(req.url || "/", `http://localhost:${OAUTH_PORT}`);
        } catch {
          res.statusCode = 400;
          res.end();
          return;
        }

        if (url.pathname !== "/callback") {
          res.statusCode = 404;
          res.end();
          return;
        }

        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");

        if (state !== expectedState) {
          res.statusCode = 400;
          res.end();
          return;
        }

        if (!code) {
          redirect(res, "https://grubielauncher.com/auth/failed");
          await closeServer();
          return safeReject(new Error("Invalid request. Missing code."));
        }

        safeResolve({
          code,
          provider: expectedProvider,
        });

        redirect(res, "https://grubielauncher.com/auth/success");
        void closeServer();
      });

      serverInstance = server;

      server.on("error", async (err: any) => {
        await closeServer();
        safeReject(err instanceof Error ? err : new Error(String(err)));
      });

      server.listen(OAUTH_PORT, "localhost");
    })().catch((err) =>
      safeReject(err instanceof Error ? err : new Error(String(err))),
    );
  });
}
