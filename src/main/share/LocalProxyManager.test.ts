import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalProxyManager } from "./LocalProxyManager";
import { SharePeerInfo } from "@/types/Share";
import net from "net";

describe("LocalProxyManager peers", () => {
  let server: net.Server;
  let port: number;
  let manager: LocalProxyManager;

  beforeEach(async () => {
    server = net.createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as net.AddressInfo).port;

    manager = new LocalProxyManager();
    manager.setLocalPort(port);
    manager.setTransport({
      sendControl: () => {},
      sendBinary: () => {},
      isWritable: () => true,
      getBufferedAmount: () => 0,
    });
  });

  afterEach(async () => {
    manager.dispose("test_done");
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("carries the guest identity from OPEN_STREAM into the peer list so the host sees who joined, not just how many", async () => {
    let peers: SharePeerInfo[] = [];
    manager.onPeersChanged((next) => {
      peers = next;
    });

    await manager.openStream({
      type: "OPEN_STREAM",
      streamId: 1,
      peerIp: "203.0.113.10",
      peerPort: 51234,
      initialDataBase64: "",
      guestUserId: "64b7f0c2e1a4d9f3b2c10a55",
      guestUsername: "Steve",
    });

    expect(peers).toHaveLength(1);
    expect(peers[0]).toMatchObject({
      streamId: 1,
      peerIp: "203.0.113.10",
      guestUserId: "64b7f0c2e1a4d9f3b2c10a55",
      guestUsername: "Steve",
    });
  });

  it("still lists a guest that arrived without an identity, as a public share carries no ticket", async () => {
    let peers: SharePeerInfo[] = [];
    manager.onPeersChanged((next) => {
      peers = next;
    });

    await manager.openStream({
      type: "OPEN_STREAM",
      streamId: 2,
      peerIp: "203.0.113.11",
      peerPort: 51235,
      initialDataBase64: "",
    });

    expect(peers).toHaveLength(1);
    expect(peers[0].guestUserId).toBeUndefined();
    expect(peers[0].guestUsername).toBeUndefined();
  });

  it("keeps a server-list ping out of the guest list", async () => {
    let peers: SharePeerInfo[] = [];
    manager.onPeersChanged((next) => {
      peers = next;
    });

    await manager.openStream({
      type: "OPEN_STREAM",
      streamId: 3,
      peerIp: "203.0.113.12",
      peerPort: 51236,
      initialDataBase64: "",
      statusPing: true,
    });

    expect(peers).toHaveLength(0);

    await manager.openStream({
      type: "OPEN_STREAM",
      streamId: 4,
      peerIp: "203.0.113.13",
      peerPort: 51237,
      initialDataBase64: "",
      guestUsername: "Alex",
    });

    expect(peers.map((peer) => peer.streamId)).toEqual([4]);
  });
});
