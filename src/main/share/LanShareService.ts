import {
  ActiveFriendShare,
  ResolvedFriendShareConnection,
  ShareCommandResult,
  ShareLanCandidate,
  SharePeerInfo,
  ShareState,
  ShareStateError,
  ShareVisibility,
} from "@/types/Share";
import { Backend } from "../services/Backend";
import { app } from "electron";
import { EventEmitter } from "events";
import {
  gameProcesses,
  gameRuntime,
  GameProcessCloseEvent,
  GameStdoutEvent,
} from "../utilities/runtime";
import { getSelectedAccessToken } from "../utilities/accounts";
import { IVersionConf } from "@/types/IVersion";
import {
  isValidPublicShareHost,
  isValidShareSlug,
  isValidTicketShareHost,
} from "./shareProtocol";
import {
  applyAuthOkState,
  applyTunnelDisconnectedState,
  getReconnectDelay,
  resolveFriendShareConnection,
} from "./shareClientLogic";
import {
  createShareError,
  ShareServiceError,
  toShareStateError,
} from "./errors";
import { ShareStateStore } from "./ShareStateStore";
import { LocalProxyManager } from "./LocalProxyManager";
import { TunnelClient } from "./TunnelClient";
import fs from "fs-extra";
import { jwtDecode } from "jwt-decode";
import path from "path";
import net from "net";

type ShareEvents = {
  stateChanged: (state: ShareState) => void;
  shareError: (error: ShareStateError) => void;
  peersChanged: (peers: SharePeerInfo[]) => void;
};

const LAN_PORT_PATTERNS = [
  /Local game hosted on port (\d{2,5})/i,
  /Started serving on (\d{2,5})/i,
];

export class LanShareService extends EventEmitter {
  private readonly stateStore = new ShareStateStore();
  private readonly proxyManager = new LocalProxyManager();
  private readonly tunnelClient = new TunnelClient(this.proxyManager);
  private readonly candidates = new Map<string, ShareLanCandidate>();

  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private probeTimer: NodeJS.Timeout | null = null;
  private operationQueue: Promise<unknown> = Promise.resolve();

  private peers: SharePeerInfo[] = [];
  private activeGatewayUrl = "";
  private activeGatewayToken = "";
  private activeGatewayTokenExpMs = 0;
  private activeHostAccessToken = "";
  private hasAuthenticatedOnce = false;
  private disposed = false;

  constructor() {
    super();

    this.stateStore.on("change", (state: ShareState) => {
      this.emit("stateChanged", state);
    });

    this.proxyManager.onPeersChanged((peers) => {
      this.peers = peers;
      this.emit("peersChanged", [...peers]);
    });

    this.tunnelClient.on("connected", () => {
      const state = this.stateStore.getState();
      if (!state.sessionId) return;

      this.stateStore.patch({
        phase: "pending",
        isTunnelConnected: true,
      });
    });

    this.tunnelClient.on("authOk", (message) => {
      this.handleAuthOk(message).catch((error) => {
        this.handleShareError(
          toShareStateError(
            error,
            "tunnel_protocol_error",
            "Failed to handle AUTH_OK",
          ),
        );
      });
    });

    this.tunnelClient.on("disconnected", (reason) => {
      void this.handleTunnelDisconnected(reason);
    });

    this.tunnelClient.on("controlError", (message) => {
      const code =
        message.code === "UNAUTHORIZED"
          ? "tunnel_auth_failed"
          : "tunnel_protocol_error";
      this.handleShareError(createShareError(code, message.message));
      if (code === "tunnel_auth_failed") {
        void this.forceLocalStop("error");
      }
    });

    this.tunnelClient.on("protocolError", (error) => {
      this.handleShareError(
        toShareStateError(
          error,
          "tunnel_protocol_error",
          "Tunnel protocol error",
        ),
      );
    });

    gameRuntime.on("started", this.handleGameStarted);
    gameRuntime.on("stdout", this.handleGameStdout);
    gameRuntime.on("close", this.handleGameClose);

    this.probeTimer = setInterval(() => {
      void this.probeLanTargets();
    }, 5000);
  }

  public override on<K extends keyof ShareEvents>(
    eventName: K,
    listener: ShareEvents[K],
  ): this {
    return super.on(eventName, listener);
  }

  public override off<K extends keyof ShareEvents>(
    eventName: K,
    listener: ShareEvents[K],
  ): this {
    return super.off(eventName, listener);
  }

  public getState(): ShareState {
    return this.stateStore.getState();
  }

  public getPeers(): SharePeerInfo[] {
    return [...this.peers];
  }

  public async startShare(
    visibility: ShareVisibility,
  ): Promise<ShareCommandResult<ShareState>> {
    return this.runExclusive(async () => {
      const state = this.stateStore.getState();
      if (
        ["share_starting", "tunnel_connecting", "pending"].includes(state.phase)
      ) {
        return {
          ok: false,
          error: createShareError("share_busy", "Share is already starting"),
        };
      }

      if (["online", "reconnecting"].includes(state.phase)) {
        return {
          ok: false,
          error: createShareError(
            "share_already_running",
            "Share is already active",
          ),
        };
      }

      const candidate = this.getPreferredCandidate();
      if (!candidate) {
        const error = createShareError(
          "lan_not_found",
          "LAN world was not found",
        );
        this.stateStore.setError(error, "lan_not_found");
        this.emit("shareError", error);
        return { ok: false, error };
      }

      const processRecord = gameProcesses.get(candidate.key);
      if (!processRecord?.accessToken) {
        const error = createShareError(
          "not_authenticated",
          "Unable to resolve host account token",
        );
        this.stateStore.setError(error);
        this.emit("shareError", error);
        return { ok: false, error };
      }

      const isReachable = await this.verifyLocalPort(candidate.localPort);
      if (!isReachable) {
        this.candidates.delete(candidate.key);
        const error = createShareError(
          "local_port_unreachable",
          "Detected LAN port is not reachable on 127.0.0.1",
        );
        this.stateStore.setError(error, "lan_not_found");
        this.emit("shareError", error);
        return { ok: false, error };
      }

      this.activeHostAccessToken = processRecord.accessToken;
      this.proxyManager.setLocalPort(candidate.localPort);
      this.hasAuthenticatedOnce = false;

      this.stateStore.patch({
        phase: "share_starting",
        visibility,
        candidate,
        target: candidate,
        isTunnelConnected: false,
        isAuthenticated: false,
        isHeartbeatActive: false,
        isDegraded: false,
        reconnectAttempt: 0,
        lastError: undefined,
      });

      try {
        const backend = new Backend(processRecord.accessToken);
        const mcVersion = await this.readMcVersion(processRecord.versionPath);

        const response = await backend.startShare({
          localPort: candidate.localPort,
          visibility,
          mcVersion: mcVersion || undefined,
          launcherVersion: app.getVersion(),
        });

        if (
          !isValidShareSlug(response.slug) ||
          !isValidPublicShareHost(response.publicAddress)
        ) {
          throw new ShareServiceError(
            "invalid_response",
            "Share API returned invalid slug or public address",
          );
        }

        this.activeGatewayUrl = response.gatewayUrl;
        this.activeGatewayToken = response.gatewayToken;
        this.activeGatewayTokenExpMs = this.decodeTokenExpiration(
          response.gatewayToken,
        );

        this.stateStore.patch({
          phase: "tunnel_connecting",
          sessionId: response.sessionId,
          slug: response.slug,
          publicAddress: response.publicAddress,
          visibility: response.visibility,
          heartbeatIntervalSec: response.heartbeatIntervalSec,
          joinTicketTtlSec: response.joinTicketTtlSec,
          isTunnelConnected: false,
          isAuthenticated: false,
          isHeartbeatActive: false,
        });

        await this.tunnelClient.connect({
          gatewayUrl: response.gatewayUrl,
          token: response.gatewayToken,
          sessionId: response.sessionId,
          slug: response.slug,
        });

        return {
          ok: true,
          data: this.stateStore.getState(),
        };
      } catch (error) {
        const shareError = toShareStateError(
          error,
          "unknown",
          "Failed to start share",
        );
        const phase =
          shareError.code === "active_share_exists" ? "conflict" : "error";
        this.stateStore.setError(shareError, phase);
        this.emit("shareError", shareError);
        return {
          ok: false,
          error: shareError,
        };
      }
    });
  }

  public async stopShare(): Promise<ShareCommandResult<ShareState>> {
    return this.runExclusive(async () => {
      const state = this.stateStore.getState();
      if (!state.sessionId) {
        return {
          ok: false,
          error: createShareError(
            "share_not_started",
            "Share session is not active",
          ),
        };
      }

      let stopError: ShareStateError | undefined;
      if (this.activeHostAccessToken) {
        try {
          const backend = new Backend(this.activeHostAccessToken);
          await backend.stopShare(state.sessionId);
        } catch (error) {
          stopError = toShareStateError(
            error,
            "unknown",
            "Failed to stop share on API",
          );
        }
      }

      await this.forceLocalStop(stopError ? "error" : "stopped");

      if (stopError) {
        this.handleShareError(stopError);
        return {
          ok: false,
          error: stopError,
          data: this.stateStore.getState(),
        };
      }

      return {
        ok: true,
        data: this.stateStore.getState(),
      };
    });
  }

  public async updateVisibility(
    visibility: ShareVisibility,
  ): Promise<ShareCommandResult<ShareState>> {
    return this.runExclusive(async () => {
      const state = this.stateStore.getState();
      if (!state.sessionId || !this.activeHostAccessToken) {
        return {
          ok: false,
          error: createShareError(
            "share_not_started",
            "Share session is not active",
          ),
        };
      }

      try {
        const backend = new Backend(this.activeHostAccessToken);
        await backend.updateShareVisibility(state.sessionId, visibility);

        this.stateStore.patch({
          visibility,
        });

        return {
          ok: true,
          data: this.stateStore.getState(),
        };
      } catch (error) {
        const shareError = toShareStateError(
          error,
          "unknown",
          "Failed to update share visibility",
        );
        this.handleShareError(shareError);
        return {
          ok: false,
          error: shareError,
        };
      }
    });
  }

  public async fetchActiveFriendShares(): Promise<
    ShareCommandResult<ActiveFriendShare[]>
  > {
    try {
      const backend = await this.getGuestBackend();
      if (!backend) {
        return {
          ok: false,
          error: createShareError(
            "not_authenticated",
            "User token is not available",
          ),
        };
      }

      const items = await backend.getActiveFriendShares();
      return {
        ok: true,
        data: items,
      };
    } catch (error) {
      return {
        ok: false,
        error: toShareStateError(
          error,
          "unknown",
          "Failed to fetch active friend shares",
        ),
      };
    }
  }

  public async requestJoinTicket(
    slug: string,
  ): Promise<ShareCommandResult<ResolvedFriendShareConnection>> {
    try {
      const backend = await this.getGuestBackend();
      if (!backend) {
        return {
          ok: false,
          error: createShareError(
            "not_authenticated",
            "User token is not available",
          ),
        };
      }

      const response = await backend.createJoinTicket(slug);
      if (!isValidTicketShareHost(response.connectHost)) {
        throw new ShareServiceError(
          "invalid_response",
          "Join ticket connectHost has invalid format",
        );
      }

      return {
        ok: true,
        data: {
          slug,
          sessionId: response.sessionId,
          visibility: "friends",
          connectHost: response.connectHost,
          source: "join_ticket",
          expiresInSec: response.expiresInSec,
        },
      };
    } catch (error) {
      return {
        ok: false,
        error: toShareStateError(
          error,
          "unknown",
          "Failed to request join ticket",
        ),
      };
    }
  }

  public async connectToFriendShare(
    slug: string,
  ): Promise<ShareCommandResult<ResolvedFriendShareConnection>> {
    try {
      const backend = await this.getGuestBackend();
      if (!backend) {
        return {
          ok: false,
          error: createShareError(
            "not_authenticated",
            "User token is not available",
          ),
        };
      }

      const activeShares = await backend.getActiveFriendShares();
      const activeShare = activeShares.find((item) => item.slug === slug);
      if (!activeShare) {
        return {
          ok: false,
          error: createShareError(
            "join_share_not_found",
            "Active share session was not found",
            404,
          ),
        };
      }

      if (activeShare.visibility === "public") {
        const connection = resolveFriendShareConnection(activeShare);
        if (!connection || !isValidPublicShareHost(connection.connectHost)) {
          return {
            ok: false,
            error: createShareError(
              "invalid_response",
              "Public share address has invalid format",
            ),
          };
        }

        return {
          ok: true,
          data: connection,
        };
      }

      try {
        const response = await backend.createJoinTicket(slug);
        if (!isValidTicketShareHost(response.connectHost)) {
          throw new ShareServiceError(
            "invalid_response",
            "Join ticket connectHost has invalid format",
          );
        }

        return {
          ok: true,
          data: resolveFriendShareConnection(activeShare, response) || {
            slug,
            sessionId: response.sessionId,
            visibility: "friends",
            connectHost: response.connectHost,
            source: "join_ticket",
            expiresInSec: response.expiresInSec,
          },
        };
      } catch (error) {
        const shareError = toShareStateError(
          error,
          "unknown",
          "Failed to connect to friend share",
        );
        if (shareError.code === "use_public_address") {
          const connection = resolveFriendShareConnection(
            activeShare,
            undefined,
            shareError.code,
          );
          if (!connection || !isValidPublicShareHost(connection.connectHost)) {
            return {
              ok: false,
              error: createShareError(
                "invalid_response",
                "Public share address has invalid format",
              ),
            };
          }

          return {
            ok: true,
            data: connection,
          };
        }

        return {
          ok: false,
          error: shareError,
        };
      }
    } catch (error) {
      return {
        ok: false,
        error: toShareStateError(
          error,
          "unknown",
          "Failed to connect to friend share",
        ),
      };
    }
  }

  public async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;

    gameRuntime.off("started", this.handleGameStarted);
    gameRuntime.off("stdout", this.handleGameStdout);
    gameRuntime.off("close", this.handleGameClose);

    this.stopHeartbeat();
    this.clearReconnectTimer();

    if (this.probeTimer) {
      clearInterval(this.probeTimer);
      this.probeTimer = null;
    }

    const state = this.stateStore.getState();
    if (state.sessionId && this.activeHostAccessToken) {
      try {
        const backend = new Backend(this.activeHostAccessToken);
        await backend.stopShare(state.sessionId);
      } catch {}
    }

    await this.tunnelClient.disconnect("app_shutdown", true);
    this.proxyManager.dispose("app_shutdown");
  }

  private readonly handleGameStarted = () => {
    const state = this.stateStore.getState();
    if (state.sessionId) return;

    if (!this.getPreferredCandidate()) {
      this.stateStore.patch({
        phase: "lan_not_found",
      });
    }
  };

  private readonly handleGameStdout = (event: GameStdoutEvent) => {
    this.detectLanCandidate(event).catch(() => {});
  };

  private readonly handleGameClose = (event: GameProcessCloseEvent) => {
    this.candidates.delete(event.key);

    const target = this.stateStore.getState().target;
    if (target?.key === event.key) {
      void this.forceLocalStop(
        gameProcesses.size > 0 ? "lan_not_found" : "idle",
      );
      return;
    }

    this.refreshPassiveState();
  };

  private async detectLanCandidate(event: GameStdoutEvent): Promise<void> {
    const port = this.extractLanPort(event.message);
    if (!port) return;

    const isReachable = await this.verifyLocalPort(port);
    if (!isReachable) return;

    const existing = this.candidates.get(event.key);
    const nextCandidate: ShareLanCandidate = {
      key: event.key,
      versionName: event.versionName,
      instance: event.instance,
      localPort: port,
      detectedAt: new Date().toISOString(),
      isReachable: true,
    };

    this.candidates.set(event.key, nextCandidate);
    this.proxyManager.setLocalPort(nextCandidate.localPort);

    const state = this.stateStore.getState();
    if (
      state.target?.key === event.key &&
      existing &&
      existing.localPort !== port
    ) {
      await this.stopShare();
      this.stateStore.patch({
        candidate: nextCandidate,
        phase: "lan_ready",
      });
      return;
    }

    if (!state.sessionId) {
      this.stateStore.patch({
        candidate: nextCandidate,
        phase: "lan_ready",
      });
      return;
    }

    if (state.target?.key === event.key) {
      this.stateStore.patch({
        candidate: nextCandidate,
        target: nextCandidate,
      });
      this.proxyManager.setLocalPort(nextCandidate.localPort);
    }
  }

  private async handleAuthOk(message: {
    connectionId: string;
    sessionId: string;
    slug: string;
  }): Promise<void> {
    const state = this.stateStore.getState();
    if (
      !state.sessionId ||
      state.sessionId !== message.sessionId ||
      state.slug !== message.slug
    ) {
      throw new ShareServiceError(
        "tunnel_protocol_error",
        "AUTH_OK does not match local share session",
      );
    }

    this.hasAuthenticatedOnce = true;

    this.stateStore.setState(applyAuthOkState(this.stateStore.getState()));

    await this.startHeartbeat();
  }

  private async handleTunnelDisconnected(reason: string): Promise<void> {
    const state = this.stateStore.getState();
    if (!state.sessionId || this.disposed) return;

    this.stopHeartbeat();

    this.stateStore.setState(
      applyTunnelDisconnectedState(
        this.stateStore.getState(),
        reason,
        this.hasAuthenticatedOnce,
      ),
    );

    this.scheduleReconnect();
  }

  private async startHeartbeat(): Promise<void> {
    this.stopHeartbeat();

    const state = this.stateStore.getState();
    if (!state.sessionId || !this.activeHostAccessToken) return;

    const intervalMs = Math.max(
      (state.heartbeatIntervalSec || 10) * 1000,
      1000,
    );
    const backend = new Backend(this.activeHostAccessToken);

    const beat = async () => {
      try {
        await backend.heartbeatShare(state.sessionId || "");
        this.stateStore.patch({
          isHeartbeatActive: true,
          lastHeartbeatAt: new Date().toISOString(),
        });
      } catch (error) {
        const shareError = toShareStateError(
          error,
          "unknown",
          "Share heartbeat failed",
        );
        this.handleShareError(shareError);
        this.stopHeartbeat();
      }
    };

    await beat();

    this.heartbeatTimer = setInterval(() => {
      void beat();
    }, intervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    const state = this.stateStore.getState();
    if (state.isHeartbeatActive) {
      this.stateStore.patch({
        isHeartbeatActive: false,
      });
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();

    const state = this.stateStore.getState();
    if (
      !state.sessionId ||
      !state.slug ||
      !this.activeGatewayUrl ||
      !this.activeGatewayToken
    ) {
      return;
    }

    if (
      this.activeGatewayTokenExpMs &&
      Date.now() >= this.activeGatewayTokenExpMs
    ) {
      this.handleShareError(
        createShareError(
          "tunnel_auth_failed",
          "Gateway token expired, restart share is required",
        ),
      );
      return;
    }

    const nextAttempt = state.reconnectAttempt + 1;
    const delay = getReconnectDelay(nextAttempt);

    this.stateStore.patch({
      reconnectAttempt: nextAttempt,
    });

    this.reconnectTimer = setTimeout(() => {
      void this.tunnelClient.connect({
        gatewayUrl: this.activeGatewayUrl,
        token: this.activeGatewayToken,
        sessionId: state.sessionId || "",
        slug: state.slug || "",
      });
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private async probeLanTargets(): Promise<void> {
    if (this.disposed) return;

    const state = this.stateStore.getState();
    const target = state.target;
    if (!target) {
      this.refreshPassiveState();
      return;
    }

    const processRecord = gameProcesses.get(target.key);
    if (!processRecord) {
      if (state.sessionId) {
        await this.forceLocalStop(
          gameProcesses.size > 0 ? "lan_not_found" : "idle",
        );
      } else {
        this.candidates.delete(target.key);
        this.refreshPassiveState();
      }
      return;
    }

    const reachable = await this.verifyLocalPort(target.localPort);
    if (reachable) return;

    this.candidates.delete(target.key);

    if (state.sessionId) {
      await this.stopShare();
      this.stateStore.patch({
        phase: "lan_not_found",
      });
      return;
    }

    this.refreshPassiveState();
  }

  private refreshPassiveState(): void {
    const state = this.stateStore.getState();
    if (state.sessionId) return;

    const candidate = this.getPreferredCandidate();
    if (candidate) {
      const nextPhase =
        state.phase === "stopped" && state.target?.key === candidate.key
          ? "stopped"
          : "lan_ready";

      this.stateStore.patch({
        phase: nextPhase,
        candidate,
        target: candidate,
      });
      return;
    }

    this.stateStore.patch({
      phase: gameProcesses.size > 0 ? "lan_not_found" : "idle",
      candidate: null,
      target: null,
    });
  }

  private async forceLocalStop(phase: ShareState["phase"]): Promise<void> {
    this.stopHeartbeat();
    this.clearReconnectTimer();
    await this.tunnelClient.disconnect("share_stopped", true);
    this.proxyManager.dispose("share_stopped");
    this.activeGatewayToken = "";
    this.activeGatewayUrl = "";
    this.activeGatewayTokenExpMs = 0;
    this.activeHostAccessToken = "";
    this.hasAuthenticatedOnce = false;

    const candidate = this.getPreferredCandidate();

    this.stateStore.reset({
      phase,
      candidate,
      target: candidate,
    });
  }

  private handleShareError(error: ShareStateError): void {
    const state = this.stateStore.getState();
    const phase = state.phase === "reconnecting" ? "reconnecting" : "error";
    this.stateStore.setError(error, phase);
    this.emit("shareError", error);
  }

  private getPreferredCandidate(): ShareLanCandidate | null {
    const candidates = [...this.candidates.values()];
    if (candidates.length === 0) return null;

    candidates.sort((a, b) => {
      return (
        new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime()
      );
    });

    return candidates[0];
  }

  private async getGuestBackend(): Promise<Backend | null> {
    const token = await getSelectedAccessToken();
    if (!token) return null;
    return new Backend(token);
  }

  private extractLanPort(message: string): number | null {
    for (const pattern of LAN_PORT_PATTERNS) {
      const match = message.match(pattern);
      if (!match?.[1]) continue;

      const port = Number(match[1]);
      if (port > 0 && port <= 65535) {
        return port;
      }
    }

    return null;
  }

  private verifyLocalPort(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = net.createConnection({
        host: "127.0.0.1",
        port,
      });

      const finish = (result: boolean) => {
        try {
          socket.destroy();
        } catch {}
        resolve(result);
      };

      socket.setTimeout(1000);
      socket.once("connect", () => finish(true));
      socket.once("timeout", () => finish(false));
      socket.once("error", () => finish(false));
    });
  }

  private decodeTokenExpiration(token: string): number {
    try {
      const decoded = jwtDecode<{ exp?: number }>(token);
      if (!decoded?.exp) return 0;
      return decoded.exp * 1000;
    } catch {
      return 0;
    }
  }

  private async readMcVersion(versionPath: string): Promise<string | null> {
    try {
      const versionJsonPath = path.join(versionPath, "version.json");
      if (!(await fs.pathExists(versionJsonPath))) return null;

      const versionConf = (await fs.readJSON(
        versionJsonPath,
        "utf-8",
      )) as IVersionConf;
      return versionConf.version.id || null;
    } catch {
      return null;
    }
  }

  private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.operationQueue.then(operation, operation);
    this.operationQueue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}
