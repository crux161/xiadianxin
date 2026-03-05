import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
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
    return invoke<CallResult>("dial_code", { code, audioOnly });
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
  ): Promise<DownloadedFileEntry> {
    return invoke<DownloadedFileEntry>("save_received_file", {
      filename,
      dataB64,
      expectedSha256,
    });
  }

  async listReceivedFiles(): Promise<DownloadedFileEntry[]> {
    return invoke<DownloadedFileEntry[]>("list_received_files");
  }

  async readReceivedFile(path: string): Promise<ReadReceivedFilePayload> {
    return invoke<ReadReceivedFilePayload>("read_received_file", { path });
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
}

export default SankakuBridge;
