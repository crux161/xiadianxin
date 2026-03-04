import type { ChatMessage } from "../types/call";

export interface WebRTCMetricsSnapshot {
  bytesReceived: number;
  packetsReceived: number;
  packetsLost: number;
  packetsDropped: number;
  rttMs: number;
  fps: number;
}

export class WebRTCService {
  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;

  onRemoteStream: ((stream: MediaStream) => void) | null = null;
  onChatMessage: ((msg: ChatMessage) => void) | null = null;
  onIceCandidate: ((candidate: string) => void) | null = null;
  onConnectionStateChange: ((state: RTCPeerConnectionState) => void) | null =
    null;

  init(localStream: MediaStream, isCaller: boolean) {
    this.pc = new RTCPeerConnection({
      iceServers: [],
    });

    localStream.getTracks().forEach((track) => {
      this.pc!.addTrack(track, localStream);
    });

    this.pc.ontrack = (event) => {
      if (event.streams[0]) {
        this.onRemoteStream?.(event.streams[0]);
      }
    };

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.onIceCandidate?.(JSON.stringify(event.candidate));
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (this.pc) {
        this.onConnectionStateChange?.(this.pc.connectionState);
      }
    };

    if (isCaller) {
      this.dataChannel = this.pc.createDataChannel("chat", { ordered: true });
      this.setupDataChannel(this.dataChannel);
    } else {
      this.pc.ondatachannel = (event) => {
        this.dataChannel = event.channel;
        this.setupDataChannel(this.dataChannel);
      };
    }
  }

  private setupDataChannel(ch: RTCDataChannel) {
    ch.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as ChatMessage;
        msg.from = "remote";
        this.onChatMessage?.(msg);
      } catch {
        /* ignore malformed */
      }
    };
  }

  async createOffer(): Promise<string> {
    if (!this.pc) throw new Error("PeerConnection not initialized");
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return JSON.stringify(offer);
  }

  async handleOffer(sdpStr: string): Promise<string> {
    if (!this.pc) throw new Error("PeerConnection not initialized");
    await this.pc.setRemoteDescription(JSON.parse(sdpStr));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return JSON.stringify(answer);
  }

  async handleAnswer(sdpStr: string): Promise<void> {
    if (!this.pc) throw new Error("PeerConnection not initialized");
    await this.pc.setRemoteDescription(JSON.parse(sdpStr));
  }

  async addIceCandidate(candidateStr: string): Promise<void> {
    if (!this.pc) return;
    try {
      await this.pc.addIceCandidate(JSON.parse(candidateStr));
    } catch {
      /* late candidates may fail — safe to ignore */
    }
  }

  sendChat(msg: ChatMessage) {
    if (this.dataChannel?.readyState === "open") {
      this.dataChannel.send(JSON.stringify(msg));
    }
  }

  async getMetricsSnapshot(): Promise<WebRTCMetricsSnapshot | null> {
    if (!this.pc) return null;

    const stats = await this.pc.getStats();
    let bytesReceived = 0;
    let packetsReceived = 0;
    let packetsLost = 0;
    let packetsDropped = 0;
    let fps = 0;
    let hasVideoSample = false;
    let rttMs = 0;

    stats.forEach((report) => {
      if (report.type === "inbound-rtp" && !report.isRemote) {
        const kind = (report as RTCInboundRtpStreamStats).kind;
        bytesReceived += report.bytesReceived ?? 0;
        packetsReceived += report.packetsReceived ?? 0;
        packetsLost += report.packetsLost ?? 0;
        packetsDropped +=
          report.packetsDiscarded ??
          report.framesDropped ??
          0;
        if (kind === "video") {
          hasVideoSample = true;
          fps = report.framesPerSecond ?? fps;
        }
      }
    });

    if (!hasVideoSample) {
      fps = 0;
    }

    // Prefer a nominated/succeeded candidate pair for RTT.
    stats.forEach((report) => {
      if (
        report.type === "candidate-pair" &&
        (report.nominated || report.selected) &&
        report.state === "succeeded" &&
        typeof report.currentRoundTripTime === "number"
      ) {
        rttMs = Math.round(report.currentRoundTripTime * 1000);
      }
    });

    if (rttMs === 0) {
      stats.forEach((report) => {
        if (
          report.type === "remote-inbound-rtp" &&
          typeof report.roundTripTime === "number"
        ) {
          rttMs = Math.round(report.roundTripTime * 1000);
        }
      });
    }

    return {
      bytesReceived,
      packetsReceived,
      packetsLost,
      packetsDropped,
      rttMs,
      fps,
    };
  }

  get connectionState(): RTCPeerConnectionState | null {
    return this.pc?.connectionState ?? null;
  }

  close() {
    this.dataChannel?.close();
    this.pc?.close();
    this.pc = null;
    this.dataChannel = null;
    this.onRemoteStream = null;
    this.onChatMessage = null;
    this.onIceCandidate = null;
    this.onConnectionStateChange = null;
  }
}
