import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Socket } from "phoenix";
import type {
  CallResult,
  DiscoveredPeer,
  DownloadDirectoryInfo,
  DownloadedFileEntry,
  Friend,
  IncomingCallPayload,
  ReadReceivedFilePayload,
  SignalMessage,
  StoredMessage,
  UserProfile,
  VoicemailResult,
} from "../types/call";

export type IncomingCallHandler = (payload: IncomingCallPayload) => void;
export type PeerDiscoveredHandler = (peer: DiscoveredPeer) => void;
export type PeerLostHandler = (code: string) => void;
export type SignalingMessageHandler = (msg: SignalMessage) => void;
export type SignalingDisconnectHandler = () => void;
export interface Kyu2TransferInitPayload {
  transferId: string;
  fileName: string;
  totalBytes: number;
  kind: "file" | "voicemail";
  peerCode?: string;
}
export interface Kyu2TransferProgressPayload {
  transferId: string;
  sentChunks: number;
  totalChunks: number;
  sentBytes: number;
}
export interface Kyu2TransferCompletePayload {
  transferId: string;
  totalBytes: number;
  sha256?: string;
}
export type Kyu2TransferInitHandler = (payload: Kyu2TransferInitPayload) => void;
export type Kyu2TransferProgressHandler = (
  payload: Kyu2TransferProgressPayload,
) => void;
export type Kyu2TransferCompleteHandler = (
  payload: Kyu2TransferCompletePayload,
) => void;

interface QuicdialResolveResult {
  ip: string;
}

class SankakuBridge {
  private static instance: SankakuBridge;

  private incomingListeners: IncomingCallHandler[] = [];
  private discoveredListeners: PeerDiscoveredHandler[] = [];
  private lostListeners: PeerLostHandler[] = [];
  private signalingListeners: SignalingMessageHandler[] = [];
  private disconnectListeners: SignalingDisconnectHandler[] = [];
  private kyu2InitListeners: Kyu2TransferInitHandler[] = [];
  private kyu2ProgressListeners: Kyu2TransferProgressHandler[] = [];
  private kyu2CompleteListeners: Kyu2TransferCompleteHandler[] = [];
  private unlistenFns: UnlistenFn[] = [];
  private ready = false;
  private omiaiSocket: any = null;
  private omiaiChannel: any = null;
  private omiaiJoinPromise: Promise<void> | null = null;

  private constructor() {}

  static getInstance(): SankakuBridge {
    if (!SankakuBridge.instance) {
      SankakuBridge.instance = new SankakuBridge();
    }
    return SankakuBridge.instance;
  }

  get isReady(): boolean {
    return this.ready;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  async initialize(): Promise<CallResult> {
    if (this.ready) {
      return { success: true, message: "Already initialised", sessionId: null };
    }

    const u1 = await listen<IncomingCallPayload>("incoming-call", (e) => {
      for (const h of this.incomingListeners) {
        try {
          h(e.payload);
        } catch (err) {
          console.error("[Bridge] incoming handler error:", err);
        }
      }
    });

    const u2 = await listen<DiscoveredPeer>("peer-discovered", (e) => {
      for (const h of this.discoveredListeners) {
        try {
          h(e.payload);
        } catch (err) {
          console.error("[Bridge] discovered handler error:", err);
        }
      }
    });

    const u3 = await listen<string>("peer-lost", (e) => {
      for (const h of this.lostListeners) {
        try {
          h(e.payload);
        } catch (err) {
          console.error("[Bridge] lost handler error:", err);
        }
      }
    });

    const u4 = await listen<string>("signaling-message", (e) => {
      try {
        const msg = JSON.parse(e.payload) as SignalMessage;
        for (const h of this.signalingListeners) {
          try {
            h(msg);
          } catch (err) {
            console.error("[Bridge] signaling handler error:", err);
          }
        }
      } catch {
        console.warn("[Bridge] unparseable signaling message:", e.payload);
      }
    });

    const u5 = await listen<void>("signaling-disconnected", () => {
      for (const h of this.disconnectListeners) {
        try {
          h();
        } catch (err) {
          console.error("[Bridge] disconnect handler error:", err);
        }
      }
    });

    const u6 = await listen<Kyu2TransferInitPayload>("kyu2-transfer-init", (e) => {
      for (const h of this.kyu2InitListeners) {
        try {
          h(e.payload);
        } catch (err) {
          console.error("[Bridge] kyu2 init handler error:", err);
        }
      }
    });

    const u7 = await listen<Kyu2TransferProgressPayload>(
      "kyu2-transfer-progress",
      (e) => {
        for (const h of this.kyu2ProgressListeners) {
          try {
            h(e.payload);
          } catch (err) {
            console.error("[Bridge] kyu2 progress handler error:", err);
          }
        }
      },
    );

    const u8 = await listen<Kyu2TransferCompletePayload>(
      "kyu2-transfer-complete",
      (e) => {
        for (const h of this.kyu2CompleteListeners) {
          try {
            h(e.payload);
          } catch (err) {
            console.error("[Bridge] kyu2 complete handler error:", err);
          }
        }
      },
    );

    this.unlistenFns = [u1, u2, u3, u4, u5, u6, u7, u8];

    const result = await invoke<CallResult>("init_sankaku_core");
    this.ready = result.success;
    return result;
  }

  async destroy(): Promise<void> {
    for (const fn of this.unlistenFns) fn();
    this.unlistenFns = [];
    this.incomingListeners = [];
    this.discoveredListeners = [];
    this.lostListeners = [];
    this.signalingListeners = [];
    this.disconnectListeners = [];
    this.kyu2InitListeners = [];
    this.kyu2ProgressListeners = [];
    this.kyu2CompleteListeners = [];
    if (this.omiaiChannel) {
      this.omiaiChannel.leave();
    }
    this.omiaiChannel = null;
    if (this.omiaiSocket) {
      this.omiaiSocket.disconnect();
    }
    this.omiaiSocket = null;
    this.omiaiJoinPromise = null;
    this.ready = false;
  }

  // -----------------------------------------------------------------------
  // Event subscriptions
  // -----------------------------------------------------------------------

  onIncomingCall(handler: IncomingCallHandler): () => void {
    this.incomingListeners.push(handler);
    return () => {
      this.incomingListeners = this.incomingListeners.filter(
        (h) => h !== handler,
      );
    };
  }

  onPeerDiscovered(handler: PeerDiscoveredHandler): () => void {
    this.discoveredListeners.push(handler);
    return () => {
      this.discoveredListeners = this.discoveredListeners.filter(
        (h) => h !== handler,
      );
    };
  }

  onPeerLost(handler: PeerLostHandler): () => void {
    this.lostListeners.push(handler);
    return () => {
      this.lostListeners = this.lostListeners.filter((h) => h !== handler);
    };
  }

  onSignalingMessage(handler: SignalingMessageHandler): () => void {
    this.signalingListeners.push(handler);
    return () => {
      this.signalingListeners = this.signalingListeners.filter(
        (h) => h !== handler,
      );
    };
  }

  onSignalingDisconnect(handler: SignalingDisconnectHandler): () => void {
    this.disconnectListeners.push(handler);
    return () => {
      this.disconnectListeners = this.disconnectListeners.filter(
        (h) => h !== handler,
      );
    };
  }

  onKyu2TransferInit(handler: Kyu2TransferInitHandler): () => void {
    this.kyu2InitListeners.push(handler);
    return () => {
      this.kyu2InitListeners = this.kyu2InitListeners.filter((h) => h !== handler);
    };
  }

  onKyu2TransferProgress(handler: Kyu2TransferProgressHandler): () => void {
    this.kyu2ProgressListeners.push(handler);
    return () => {
      this.kyu2ProgressListeners = this.kyu2ProgressListeners.filter(
        (h) => h !== handler,
      );
    };
  }

  onKyu2TransferComplete(handler: Kyu2TransferCompleteHandler): () => void {
    this.kyu2CompleteListeners.push(handler);
    return () => {
      this.kyu2CompleteListeners = this.kyu2CompleteListeners.filter(
        (h) => h !== handler,
      );
    };
  }

  // -----------------------------------------------------------------------
  // Profile
  // -----------------------------------------------------------------------

  async getProfile(): Promise<UserProfile> {
    return invoke<UserProfile>("get_profile");
  }

  async updateProfile(fields: {
    displayName?: string;
    avatarId?: string;
    language?: string;
  }): Promise<UserProfile> {
    return invoke<UserProfile>("update_profile", fields);
  }

  // -----------------------------------------------------------------------
  // Peers & Calling
  // -----------------------------------------------------------------------

  async getDiscoveredPeers(): Promise<DiscoveredPeer[]> {
    return invoke<DiscoveredPeer[]>("get_discovered_peers");
  }

  async connectToPeer(code: string): Promise<CallResult> {
    return invoke<CallResult>("connect_to_peer", { code });
  }

  async sendSignal(message: SignalMessage): Promise<void> {
    return invoke<void>("send_signal", {
      message: JSON.stringify(message),
    });
  }

  async disconnectSignal(): Promise<void> {
    return invoke<void>("disconnect_signal");
  }

  async dialCode(
    code: string,
    audioOnly: boolean = false,
  ): Promise<CallResult> {
    const normalized = code.trim();
    try {
      return await this.dialQuicdial(normalized, audioOnly);
    } catch (err) {
      console.warn(
        "[Bridge] dial_quicdial failed; falling back to local dial_code",
        err,
      );
      return invoke<CallResult>("dial_code", { code: normalized, audioOnly });
    }
  }

  async dialQuicdial(
    code: string,
    audioOnly: boolean = false,
  ): Promise<CallResult> {
    const normalized = code.trim();
    const { ip } = await this.resolveQuicdial(normalized);
    return invoke<CallResult>("dial_quicdial", {
      code: normalized,
      ip,
      audioOnly,
    });
  }

  async startCall(
    peerId: string,
    audioOnly: boolean = false,
  ): Promise<CallResult> {
    return invoke<CallResult>("start_call", { peerId, audioOnly });
  }

  async acceptCall(): Promise<CallResult> {
    return invoke<CallResult>("accept_call");
  }

  async endCall(): Promise<CallResult> {
    return invoke<CallResult>("end_call");
  }

  async recordVoicemail(): Promise<VoicemailResult> {
    return invoke<VoicemailResult>("record_voicemail");
  }

  async stopVoicemail(): Promise<VoicemailResult> {
    return invoke<VoicemailResult>("stop_voicemail");
  }

  // -----------------------------------------------------------------------
  // Friends
  // -----------------------------------------------------------------------

  async getFriends(): Promise<Friend[]> {
    return invoke<Friend[]>("get_friends");
  }

  async addFriend(
    callingCode: string,
    displayName: string,
    avatarId?: string,
    publicKey?: string,
    voicemailKey?: string,
  ): Promise<Friend> {
    return invoke<Friend>("add_friend", {
      callingCode,
      displayName,
      avatarId,
      publicKey,
      voicemailKey,
    });
  }

  async removeFriend(callingCode: string): Promise<void> {
    return invoke<void>("remove_friend", { callingCode });
  }

  async isFriend(callingCode: string): Promise<boolean> {
    return invoke<boolean>("is_friend", { callingCode });
  }

  // -----------------------------------------------------------------------
  // Conversations
  // -----------------------------------------------------------------------

  async saveMessages(
    peerCode: string,
    messages: StoredMessage[],
  ): Promise<void> {
    return invoke<void>("save_messages", { peerCode, messages });
  }

  async loadMessages(peerCode: string): Promise<StoredMessage[]> {
    return invoke<StoredMessage[]>("load_messages", { peerCode });
  }

  async listConversations(): Promise<string[]> {
    return invoke<string[]>("list_conversations");
  }

  // -----------------------------------------------------------------------
  // File Transfer
  // -----------------------------------------------------------------------

  async saveReceivedFile(
    filename: string,
    dataB64: string,
    expectedSha256?: string,
    kind?: "file" | "voicemail",
  ): Promise<DownloadedFileEntry> {
    return invoke<DownloadedFileEntry>("save_received_file", {
      filename,
      dataB64,
      expectedSha256,
      kind,
    });
  }

  async listReceivedFiles(): Promise<DownloadedFileEntry[]> {
    return invoke<DownloadedFileEntry[]>("list_received_files");
  }

  async readReceivedFile(path: string): Promise<ReadReceivedFilePayload> {
    return invoke<ReadReceivedFilePayload>("read_received_file", { path });
  }

  async deleteReceivedFile(path: string): Promise<void> {
    return invoke<void>("delete_received_file", { path });
  }

  async getDownloadDirectory(): Promise<DownloadDirectoryInfo> {
    return invoke<DownloadDirectoryInfo>("get_download_directory");
  }

  async setDownloadDirectory(path: string): Promise<void> {
    return invoke<void>("set_download_directory", { path });
  }

  async initKyu2Transfer(payload: Kyu2TransferInitPayload): Promise<void> {
    return invoke<void>("init_kyu2_transfer", { ...payload });
  }

  async updateKyu2TransferProgress(payload: Kyu2TransferProgressPayload): Promise<void> {
    return invoke<void>("update_kyu2_transfer_progress", { ...payload });
  }

  async completeKyu2Transfer(payload: Kyu2TransferCompletePayload): Promise<void> {
    return invoke<void>("complete_kyu2_transfer", { ...payload });
  }

  // -----------------------------------------------------------------------
  // Custom Avatar
  // -----------------------------------------------------------------------

  async saveCustomAvatar(dataB64: string): Promise<void> {
    return invoke<void>("save_custom_avatar", { dataB64 });
  }

  async loadCustomAvatar(): Promise<string | null> {
    return invoke<string | null>("load_custom_avatar");
  }

  async resolveQuicdial(code: string): Promise<QuicdialResolveResult> {
    const normalized = code.trim();
    if (!normalized) {
      throw new Error("missing_quicdial_code");
    }

    const channel = await this.ensureOmiaiChannel();
    return new Promise((resolve, reject) => {
      channel
        .push("resolve_quicdial", { code: normalized })
        .receive("ok", (payload: unknown) => {
          const maybeMap =
            typeof payload === "object" && payload !== null
              ? (payload as Record<string, unknown>)
              : {};
          const ip =
            typeof maybeMap.ip === "string" ? maybeMap.ip.trim() : "";
          if (!ip) {
            reject(new Error("resolve_quicdial_empty_ip"));
            return;
          }
          resolve({ ip });
        })
        .receive("error", (payload: unknown) => {
          reject(
            new Error(
              this.extractErrorReason(payload, "resolve_quicdial_failed"),
            ),
          );
        })
        .receive("timeout", () => reject(new Error("resolve_quicdial_timeout")));
    });
  }

  private async ensureOmiaiChannel(): Promise<any> {
    if (this.omiaiChannel) {
      return this.omiaiChannel;
    }
    if (this.omiaiJoinPromise) {
      await this.omiaiJoinPromise;
      if (this.omiaiChannel) {
        return this.omiaiChannel;
      }
      throw new Error("omiai_channel_unavailable");
    }

    this.omiaiJoinPromise = (async () => {
      const profile = await this.getProfile();
      const endpoint = this.resolveOmiaiEndpoint();
      const socket = new Socket(endpoint, {
        params: {
          public_key: profile.callingCode,
          event_contract: "dual",
        },
        timeout: 7000,
      });

      socket.onClose(() => {
        this.omiaiChannel = null;
        this.omiaiSocket = null;
      });

      socket.onError(() => {
        this.omiaiChannel = null;
      });

      socket.connect();

      const channel = socket.channel(`peer:${profile.callingCode}`, {});

      await new Promise<void>((resolve, reject) => {
        channel
          .join()
          .receive("ok", () => resolve())
          .receive("error", (payload: unknown) => {
            reject(new Error(this.extractErrorReason(payload, "omiai_join_failed")));
          })
          .receive("timeout", () => reject(new Error("omiai_join_timeout")));
      });

      this.omiaiSocket = socket;
      this.omiaiChannel = channel;
    })();

    try {
      await this.omiaiJoinPromise;
    } finally {
      this.omiaiJoinPromise = null;
    }

    if (!this.omiaiChannel) {
      throw new Error("omiai_channel_unavailable");
    }
    return this.omiaiChannel;
  }

  private resolveOmiaiEndpoint(): string {
    const fromEnv = (import.meta.env.VITE_OMIAI_WS_URL as string | undefined)?.trim();
    if (fromEnv) {
      return fromEnv;
    }
    if (typeof window === "undefined") {
      return "ws://127.0.0.1:4000/ws/sankaku";
    }
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const host = window.location.hostname || "127.0.0.1";
    return `${proto}://${host}:4000/ws/sankaku`;
  }

  private extractErrorReason(payload: unknown, fallback: string): string {
    if (typeof payload !== "object" || payload === null) {
      return fallback;
    }
    const maybeMap = payload as Record<string, unknown>;
    const reasonValue = maybeMap.reason ?? maybeMap["reason"];
    if (typeof reasonValue === "string" && reasonValue.trim()) {
      return reasonValue;
    }
    return fallback;
  }
}

export default SankakuBridge;
