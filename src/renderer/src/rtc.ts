import {
  RTC_BUFFER_HIGH,
  RTC_BUFFER_LOW,
  RTC_CONTROL_LABEL,
  channelLabel,
  parseChannelLabel,
  type RtcCommand,
  type RtcData,
  type RtcEvent,
  type RtcPathStats,
  type RtcReply,
  type RtcRequest,
  type RtcRole,
} from "@/shared/rtcBridge";

interface RtcBridge {
  onRequest: (listener: (request: RtcRequest) => void) => void;
  onSend: (listener: (data: RtcData) => void) => void;
  reply: (reply: RtcReply) => void;
  event: (event: RtcEvent) => void;
  data: (data: RtcData) => void;
  ready: () => void;
}

interface Peer {
  pc: RTCPeerConnection;
  role: RtcRole;
  channels: Map<number, RTCDataChannel>;
  control: RTCDataChannel | null;
}

const GATHER_TIMEOUT_MS = 2500;
const GATHER_SETTLE_MS = 300;
const SETTLING_CANDIDATES = new Set(["srflx", "relay"]);

const bridge = (window as unknown as { rtcBridge: RtcBridge }).rtcBridge;
const peers = new Map<string, Peer>();

function emit(event: RtcEvent): void {
  bridge.event(event);
}

function waitForGathering(
  pc: RTCPeerConnection,
  needsServerCandidate: boolean,
): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(finish, GATHER_TIMEOUT_MS);
    let settle: ReturnType<typeof setTimeout> | null = null;
    function finish() {
      clearTimeout(timer);
      if (settle) clearTimeout(settle);
      pc.removeEventListener("icegatheringstatechange", onChange);
      pc.removeEventListener("icecandidate", onCandidate);
      resolve();
    }
    function onChange() {
      if (pc.iceGatheringState === "complete") finish();
    }
    function onCandidate(event: RTCPeerConnectionIceEvent) {
      const type = event.candidate?.type;
      if (settle || !type) return;
      if (needsServerCandidate && !SETTLING_CANDIDATES.has(type)) return;
      settle = setTimeout(finish, GATHER_SETTLE_MS);
    }
    pc.addEventListener("icegatheringstatechange", onChange);
    pc.addEventListener("icecandidate", onCandidate);
  });
}

function hasIceServers(pc: RTCPeerConnection): boolean {
  return (pc.getConfiguration().iceServers ?? []).length > 0;
}

function wireChannel(peerId: string, channelId: number, channel: RTCDataChannel): void {
  const peer = peers.get(peerId);
  if (!peer) {
    channel.close();
    return;
  }
  peer.channels.set(channelId, channel);
  channel.binaryType = "arraybuffer";
  channel.bufferedAmountLowThreshold = RTC_BUFFER_LOW;

  const announceOpen = () => emit({ type: "channelOpen", peerId, channelId });
  if (channel.readyState === "open") announceOpen();
  else channel.addEventListener("open", announceOpen, { once: true });

  channel.addEventListener("message", (event: MessageEvent) => {
    const payload = event.data;
    if (payload instanceof ArrayBuffer) {
      bridge.data({ peerId, channelId, data: new Uint8Array(payload) });
    }
  });
  channel.addEventListener("bufferedamountlow", () => {
    emit({ type: "buffered", peerId, channelId, amount: channel.bufferedAmount });
  });
  channel.addEventListener("close", () => {
    if (peers.get(peerId)?.channels.get(channelId) === channel) {
      peers.get(peerId)?.channels.delete(channelId);
    }
    emit({ type: "channelClose", peerId, channelId });
  });
}

function createPeer(peerId: string, role: RtcRole, iceServers: RTCIceServer[]): void {
  closePeer(peerId);
  const pc = new RTCPeerConnection({ iceServers, bundlePolicy: "max-bundle" });
  const peer: Peer = { pc, role, channels: new Map(), control: null };
  peers.set(peerId, peer);

  pc.addEventListener("connectionstatechange", () => {
    emit({ type: "state", peerId, state: pc.connectionState });
  });

  if (role === "host") {
    pc.addEventListener("datachannel", (event: RTCDataChannelEvent) => {
      const { channel } = event;
      if (channel.label === RTC_CONTROL_LABEL) {
        peer.control = channel;
        return;
      }
      const channelId = parseChannelLabel(channel.label);
      if (channelId === null) {
        channel.close();
        return;
      }
      wireChannel(peerId, channelId, channel);
    });
  }
}

function closePeer(peerId: string): void {
  const peer = peers.get(peerId);
  if (!peer) return;
  peers.delete(peerId);
  for (const channel of peer.channels.values()) channel.close();
  peer.control?.close();
  peer.pc.close();
}

function requirePeer(peerId: string): Peer {
  const peer = peers.get(peerId);
  if (!peer) throw new Error("unknown_peer");
  return peer;
}

async function readPathStats(pc: RTCPeerConnection): Promise<RtcPathStats> {
  const report = await pc.getStats();
  let pairId: string | undefined;
  report.forEach((stat) => {
    if (stat.type === "transport" && stat.selectedCandidatePairId) {
      pairId = stat.selectedCandidatePairId;
    }
  });

  let pair = pairId ? report.get(pairId) : undefined;
  if (!pair) {
    report.forEach((stat) => {
      if (stat.type === "candidate-pair" && stat.nominated && stat.state === "succeeded") {
        pair = stat;
      }
    });
  }
  if (!pair) return {};

  const local = report.get(pair.localCandidateId);
  const remote = report.get(pair.remoteCandidateId);
  return {
    localCandidateType: local?.candidateType,
    remoteCandidateType: remote?.candidateType,
    rttSeconds:
      typeof pair.currentRoundTripTime === "number" ? pair.currentRoundTripTime : undefined,
  };
}

async function run(command: RtcCommand): Promise<unknown> {
  switch (command.cmd) {
    case "create":
      createPeer(command.peerId, command.role, command.iceServers);
      return null;
    case "offer": {
      const peer = requirePeer(command.peerId);
      peer.control = peer.pc.createDataChannel(RTC_CONTROL_LABEL, { ordered: true });
      await peer.pc.setLocalDescription(await peer.pc.createOffer());
      await waitForGathering(peer.pc, hasIceServers(peer.pc));
      return peer.pc.localDescription?.sdp ?? "";
    }
    case "answer": {
      const peer = requirePeer(command.peerId);
      await peer.pc.setRemoteDescription({ type: "offer", sdp: command.sdp });
      await peer.pc.setLocalDescription(await peer.pc.createAnswer());
      await waitForGathering(peer.pc, hasIceServers(peer.pc));
      return peer.pc.localDescription?.sdp ?? "";
    }
    case "accept": {
      const peer = requirePeer(command.peerId);
      await peer.pc.setRemoteDescription({ type: "answer", sdp: command.sdp });
      return null;
    }
    case "open": {
      const peer = requirePeer(command.peerId);
      const channel = peer.pc.createDataChannel(channelLabel(command.channelId), {
        ordered: true,
      });
      wireChannel(command.peerId, command.channelId, channel);
      return null;
    }
    case "closeChannel":
      peers.get(command.peerId)?.channels.get(command.channelId)?.close();
      return null;
    case "close":
      closePeer(command.peerId);
      return null;
    case "stats":
      return await readPathStats(requirePeer(command.peerId).pc);
  }
}

bridge.onRequest((request) => {
  run(request.command).then(
    (result) => bridge.reply({ id: request.id, ok: true, result }),
    (error: unknown) =>
      bridge.reply({
        id: request.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
  );
});

bridge.onSend(({ peerId, channelId, data }) => {
  const channel = peers.get(peerId)?.channels.get(channelId);
  if (!channel || channel.readyState !== "open") return;
  try {
    channel.send(data);
  } catch {
    channel.close();
    return;
  }
  if (channel.bufferedAmount > RTC_BUFFER_HIGH) {
    emit({ type: "buffered", peerId, channelId, amount: channel.bufferedAmount });
  }
});

bridge.ready();
