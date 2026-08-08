import net from "net";

const CHECK_TIMEOUT_MS = 1500;

export function isPortAvailable(port: number): Promise<boolean> {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const server = net.createServer();
    let settled = false;

    const settle = (available: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      server.removeAllListeners();
      server.close(() => resolve(available));
    };

    const timer = setTimeout(() => settle(false), CHECK_TIMEOUT_MS);

    server.once("error", () => settle(false));
    server.once("listening", () => settle(true));

    try {
      server.listen({ port, host: "127.0.0.1", exclusive: true });
    } catch {
      settle(false);
    }
  });
}
