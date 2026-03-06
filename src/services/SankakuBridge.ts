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
  OmiaiFriend,
  OmiaiFriendRequest,
  OmiaiUser,
  PresencePeer,
  ReadReceivedFilePayload,
  SignalMessage,
  StoredMessage,
  UserProfile,
  VoicemailCheckEntry,
  VoicemailFetchResult,
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
export type VoicemailAvailableHandler = (entry: {
  id: string;
  from_quicdial_id: string;
  metadata: Record<string, unknown>;
}) => void;

export type PresenceUpdateHandler = (peers: PresencePeer[]) => void;
export type FriendEventHandler = (data: Record<string, unknown>) => void;
export const OMIAI_AUTH_TOKEN_KEY = "OMIAI_AUTH_TOKEN";
export const OMIAI_WS_URL_STORAGE_KEY = "OMIAI_WS_URL";
export const OMIAI_WS_URL_CHANGED_EVENT = "xdx-omiai-ws-url-changed";
export const DEFAULT_OMIAI_WS_URL =
  "ws://localhost:4000/ws/sankaku/websocket";

interface QuicdialResolveResult {
  ip: string;
}

interface OmiaiDiscoveryResult {
  wsUrl: string;
  ip: string;
  port: number;
  instanceName?: string;
}

interface OmiaiStartupRegistrationPayload {
  public_key: string;
  session_token: string;
  sig_ts: string;
  sig_nonce: string;
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
  private voicemailAvailableListeners: VoicemailAvailableHandler[] = [];
  private unlistenFns: UnlistenFn[] = [];
  private ready = false;
  private omiaiSocket: any = null;
  private omiaiChannel: any = null;
  private omiaiJoinPromise: Promise<void> | null = null;
  private omiaiEndpoint: string | null = null;
  private discoveredOmiaiEndpoint: string | null = null;
  private omiaiDiscoveryPromise: Promise<string | null> | null = null;
  private omiaiSessionToken: string | null = null;

  // Omiai relay signaling state
  private signalingMode: "tcp" | "omiai" | null = null;
  private omiaiCallContext: {
    callerCode: string;
    callerDeviceUuid: string;
  } | null = null;
  private deviceUuid: string = "";
  private omiaiSignalingBound = false;

  // Auth & presence state
  public authToken: string | null = null;
  private lobbyChannel: any = null;
  private presencePeers: Map<string, PresencePeer> = new Map();
  private presenceUpdateListeners: PresenceUpdateHandler[] = [];
  private friendRequestReceivedListeners: FriendEventHandler[] = [];
  private friendAcceptedListeners: FriendEventHandler[] = [];
  private friendRemovedListeners: FriendEventHandler[] = [];

  private constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener(
        OMIAI_WS_URL_CHANGED_EVENT,
        this.handleOmiaiUrlChanged as EventListener,
      );
      // Persist a stable device UUID in localStorage
      const stored = window.localStorage.getItem("OMIAI_DEVICE_UUID");
      if (stored) {
        this.deviceUuid = stored;
      } else {
        this.deviceUuid =
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
        window.localStorage.setItem("OMIAI_DEVICE_UUID", this.deviceUuid);
      }
    }
  }

  static getInstance(): SankakuBridge {
    if (!SankakuBridge.instance) {
      SankakuBridge.instance = new SankakuBridge();
    }
    return SankakuBridge.instance;
  }

  get isReady(): boolean {
    return this.ready;
  }

  // ---------------------------------------------------------------------------
  // Omiai HTTP API (auth, friends, profile)
  // ---------------------------------------------------------------------------

  private async getOmiaiHttpBaseUrl(): Promise<string> {
    const wsUrl = await this.resolveOmiaiEndpoint();
    // Convert ws://host:port/ws/sankaku/websocket → http://host:port
    return wsUrl
      .replace(/^wss:/, "https:")
      .replace(/^ws:/, "http:")
      .replace(/\/ws\/sankaku.*$/, "");
  }

  async signup(params: {
    quicdialId: string;
    displayName: string;
    password: string;
    avatarId?: string;
  }): Promise<{ token: string; user: OmiaiUser }> {
    const base = await this.getOmiaiHttpBaseUrl();
    const resp = await fetch(`${base}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quicdial_id: params.quicdialId,
        display_name: params.displayName,
        password: params.password,
        avatar_id: params.avatarId || "kyu-kun",
      }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `signup_failed_${resp.status}`);
    }
    const data = await resp.json();
    return {
      token: data.token,
      user: {
        quicdialId: data.user.quicdial_id,
        displayName: data.user.display_name,
        avatarId: data.user.avatar_id,
      },
    };
  }

  async login(params: {
    quicdialId: string;
    password: string;
  }): Promise<{ token: string; user: OmiaiUser }> {
    const base = await this.getOmiaiHttpBaseUrl();
    const resp = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quicdial_id: params.quicdialId,
        password: params.password,
      }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `login_failed_${resp.status}`);
    }
    const data = await resp.json();
    return {
      token: data.token,
      user: {
        quicdialId: data.user.quicdial_id,
        displayName: data.user.display_name,
        avatarId: data.user.avatar_id,
      },
    };
  }

  async fetchMe(): Promise<OmiaiUser | null> {
    if (!this.authToken) return null;
    const base = await this.getOmiaiHttpBaseUrl();
    const resp = await fetch(`${base}/api/auth/me`, {
      headers: { Authorization: `Bearer ${this.authToken}` },
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return {
      quicdialId: data.user.quicdial_id,
      displayName: data.user.display_name,
      avatarId: data.user.avatar_id,
    };
  }

  async updateOmiaiProfile(params: {
    displayName?: string;
    avatarId?: string;
  }): Promise<OmiaiUser | null> {
    if (!this.authToken) return null;
    const base = await this.getOmiaiHttpBaseUrl();
    const resp = await fetch(`${base}/api/profile`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.authToken}`,
      },
      body: JSON.stringify({
        display_name: params.displayName,
        avatar_id: params.avatarId,
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return {
      quicdialId: data.user.quicdial_id,
      displayName: data.user.display_name,
      avatarId: data.user.avatar_id,
    };
  }

  async fetchOmiaiFriends(): Promise<OmiaiFriend[]> {
    if (!this.authToken) return [];
    const base = await this.getOmiaiHttpBaseUrl();
    const resp = await fetch(`${base}/api/friends`, {
      headers: { Authorization: `Bearer ${this.authToken}` },
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data.friends || []).map(
      (f: Record<string, string>) =>
        ({
          friendshipId: f.friendship_id,
          quicdialId: f.quicdial_id,
          displayName: f.display_name,
          avatarId: f.avatar_id,
        }) as OmiaiFriend,
    );
  }

  async fetchPendingRequests(): Promise<OmiaiFriendRequest[]> {
    if (!this.authToken) return [];
    const base = await this.getOmiaiHttpBaseUrl();
    const resp = await fetch(`${base}/api/friends/requests`, {
      headers: { Authorization: `Bearer ${this.authToken}` },
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data.requests || []).map(
      (r: Record<string, string>) =>
        ({
          friendshipId: r.friendship_id,
          fromQuicdialId: r.from_quicdial_id,
          fromDisplayName: r.from_display_name,
          fromAvatarId: r.from_avatar_id,
          createdAt: r.created_at,
        }) as OmiaiFriendRequest,
    );
  }

  async sendOmiaiFriendRequest(quicdialId: string): Promise<string | null> {
    if (!this.authToken) return null;
    const base = await this.getOmiaiHttpBaseUrl();
    const resp = await fetch(`${base}/api/friends/request`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.authToken}`,
      },
      body: JSON.stringify({ quicdial_id: quicdialId }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || "request_failed");
    }
    const data = await resp.json();
    return data.friendship_id || null;
  }

  async acceptOmiaiFriendRequest(friendshipId: string): Promise<void> {
    if (!this.authToken) return;
    const base = await this.getOmiaiHttpBaseUrl();
    const resp = await fetch(`${base}/api/friends/${friendshipId}/accept`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.authToken}` },
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || "accept_failed");
    }
  }

  async declineOmiaiFriendRequest(friendshipId: string): Promise<void> {
    if (!this.authToken) return;
    const base = await this.getOmiaiHttpBaseUrl();
    const resp = await fetch(`${base}/api/friends/${friendshipId}/decline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.authToken}` },
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || "decline_failed");
    }
  }

  async removeOmiaiFriend(quicdialId: string): Promise<void> {
    if (!this.authToken) return;
    const base = await this.getOmiaiHttpBaseUrl();
    const resp = await fetch(`${base}/api/friends/${quicdialId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${this.authToken}` },
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || "remove_failed");
    }
  }

  logout(): void {
    this.authToken = null;
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(OMIAI_AUTH_TOKEN_KEY);
    }
    this.resetOmiaiSocket();
  }

  // ---------------------------------------------------------------------------
  // Lobby presence (Omiai-dictated peer list)
  // ---------------------------------------------------------------------------

  onPresenceUpdate(handler: PresenceUpdateHandler): () => void {
    this.presenceUpdateListeners.push(handler);
    return () => {
      this.presenceUpdateListeners = this.presenceUpdateListeners.filter(
        (h) => h !== handler,
      );
    };
  }

  onFriendRequestReceived(handler: FriendEventHandler): () => void {
    this.friendRequestReceivedListeners.push(handler);
    return () => {
      this.friendRequestReceivedListeners =
        this.friendRequestReceivedListeners.filter((h) => h !== handler);
    };
  }

  onFriendAccepted(handler: FriendEventHandler): () => void {
    this.friendAcceptedListeners.push(handler);
    return () => {
      this.friendAcceptedListeners = this.friendAcceptedListeners.filter(
        (h) => h !== handler,
      );
    };
  }

  onFriendRemoved(handler: FriendEventHandler): () => void {
    this.friendRemovedListeners.push(handler);
    return () => {
      this.friendRemovedListeners = this.friendRemovedListeners.filter(
        (h) => h !== handler,
      );
    };
  }

  getPresencePeers(): PresencePeer[] {
    return Array.from(this.presencePeers.values());
  }

  private notifyPresenceUpdate(): void {
    const peers = this.getPresencePeers();
    for (const handler of this.presenceUpdateListeners) {
      try {
        handler(peers);
      } catch {
        /* ignore */
      }
    }
  }

  private syncPresenceState(state: Record<string, { metas: Array<Record<string, unknown>> }>): void {
    this.presencePeers.clear();
    for (const [quicdialId, { metas }] of Object.entries(state)) {
      if (metas.length > 0) {
        const m = metas[metas.length - 1];
        this.presencePeers.set(quicdialId, {
          quicdialId,
          displayName: (m.display_name as string) || quicdialId,
          avatarId: (m.avatar_id as string) || "default",
          deviceUuid: m.device_uuid as string | undefined,
          ip: m.ip as string | undefined,
          onlineAt: m.online_at as number | undefined,
        });
      }
    }
    this.notifyPresenceUpdate();
  }

  private applyPresenceDiff(diff: {
    joins: Record<string, { metas: Array<Record<string, unknown>> }>;
    leaves: Record<string, { metas: Array<Record<string, unknown>> }>;
  }): void {
    for (const [quicdialId, { metas }] of Object.entries(diff.joins || {})) {
      if (metas.length > 0) {
        const m = metas[metas.length - 1];
        this.presencePeers.set(quicdialId, {
          quicdialId,
          displayName: (m.display_name as string) || quicdialId,
          avatarId: (m.avatar_id as string) || "default",
          deviceUuid: m.device_uuid as string | undefined,
          ip: m.ip as string | undefined,
          onlineAt: m.online_at as number | undefined,
        });
      }
    }
    for (const quicdialId of Object.keys(diff.leaves || {})) {
      this.presencePeers.delete(quicdialId);
    }
    this.notifyPresenceUpdate();
  }

  private async joinLobby(socket: any): Promise<void> {
    if (this.lobbyChannel) return;
    const lobby = socket.channel("lobby:sankaku", {});
    await new Promise<void>((resolve, reject) => {
      lobby
        .join()
        .receive("ok", () => resolve())
        .receive("error", (e: unknown) =>
          reject(new Error(`lobby_join_failed: ${JSON.stringify(e)}`)),
        )
        .receive("timeout", () => reject(new Error("lobby_join_timeout")));
    });

    lobby.on("presence_state", (state: any) => this.syncPresenceState(state));
    lobby.on("presence_diff", (diff: any) => this.applyPresenceDiff(diff));

    // Listen for friend events relayed via the signaling channel
    lobby.on("friend_request_received", (data: any) => {
      for (const h of this.friendRequestReceivedListeners) {
        try { h(data); } catch { /* ignore */ }
      }
    });
    lobby.on("friend_accepted", (data: any) => {
      for (const h of this.friendAcceptedListeners) {
        try { h(data); } catch { /* ignore */ }
      }
    });
    lobby.on("friend_removed", (data: any) => {
      for (const h of this.friendRemovedListeners) {
        try { h(data); } catch { /* ignore */ }
      }
    });

    this.lobbyChannel = lobby;
    console.info("[Bridge] Joined lobby:sankaku for presence tracking");
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
    if (result.success) {
      void this.bootstrapOmiaiRegistration();
    }
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
    this.voicemailAvailableListeners = [];
    this.resetOmiaiSocket();
    this.omiaiDiscoveryPromise = null;
    this.signalingMode = null;
    this.omiaiCallContext = null;
    this.omiaiSignalingBound = false;
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

  onVoicemailAvailable(handler: VoicemailAvailableHandler): () => void {
    this.voicemailAvailableListeners.push(handler);
    return () => {
      this.voicemailAvailableListeners = this.voicemailAvailableListeners.filter(
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
    if (this.signalingMode === "omiai") {
      return this.sendSignalViaOmiai(message);
    }
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

    // 1. Try Quicdial resolution + TCP
    try {
      const result = await this.dialQuicdial(normalized, audioOnly);
      this.signalingMode = "tcp";
      return result;
    } catch (err) {
      console.warn("[Bridge] dial_quicdial failed; trying local mDNS", err);
    }

    // 2. Try direct mDNS TCP
    try {
      const result = await invoke<CallResult>("dial_code", {
        code: normalized,
        audioOnly,
      });
      if (result.success) {
        this.signalingMode = "tcp";
        return result;
      }
    } catch (err) {
      console.warn("[Bridge] dial_code (mDNS) failed; falling back to Omiai relay", err);
    }

    // 3. Fall back to Omiai relay signaling
    try {
      await this.ensureOmiaiChannel();
      this.signalingMode = "omiai";
      this.omiaiCallContext = null;
      console.info("[Bridge] Using Omiai relay signaling for call to", normalized);
      return {
        success: true,
        message: `relay(${normalized})`,
        sessionId: null,
      };
    } catch (err) {
      this.signalingMode = null;
      throw new Error(`all_dial_methods_failed: ${err}`);
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

  // -----------------------------------------------------------------------
  // Omiai Relay Signaling
  // -----------------------------------------------------------------------

  resetSignalingMode(): void {
    this.signalingMode = null;
    this.omiaiCallContext = null;
  }

  getSignalingMode(): "tcp" | "omiai" | null {
    return this.signalingMode;
  }

  private async sendSignalViaOmiai(message: SignalMessage): Promise<void> {
    const channel = await this.ensureOmiaiChannel();

    if (message.type === "offer") {
      const targetCode = message.targetCode;
      if (!targetCode) {
        throw new Error("omiai_relay_missing_target_code");
      }
      return new Promise<void>((resolve, reject) => {
        channel
          .push("sdp_offer", {
            to_quicdial_id: targetCode,
            sdp: message.sdp,
            audio_only: message.audioOnly,
            calling_code: message.callingCode,
            display_name: message.displayName,
          })
          .receive("ok", () => resolve())
          .receive("error", (payload: unknown) => {
            reject(new Error(this.extractErrorReason(payload, "omiai_offer_failed")));
          })
          .receive("timeout", () => reject(new Error("omiai_offer_timeout")));
      });
    }

    if (message.type === "answer") {
      if (!this.omiaiCallContext) {
        throw new Error("omiai_relay_no_call_context");
      }
      return new Promise<void>((resolve, reject) => {
        channel
          .push("sdp_answer", {
            sdp: message.sdp,
            to_quicdial_id: this.omiaiCallContext!.callerCode,
            to_device_uuid: this.omiaiCallContext!.callerDeviceUuid,
          })
          .receive("ok", () => resolve())
          .receive("error", (payload: unknown) => {
            reject(new Error(this.extractErrorReason(payload, "omiai_answer_failed")));
          })
          .receive("timeout", () => reject(new Error("omiai_answer_timeout")));
      });
    }

    if (message.type === "ice") {
      if (!this.omiaiCallContext) {
        throw new Error("omiai_relay_no_call_context_for_ice");
      }
      return new Promise<void>((resolve, reject) => {
        channel
          .push("ice_candidate", {
            candidate: message.candidate,
            to_quicdial_id: this.omiaiCallContext!.callerCode,
            to_device_uuid: this.omiaiCallContext!.callerDeviceUuid,
          })
          .receive("ok", () => resolve())
          .receive("error", (payload: unknown) => {
            reject(new Error(this.extractErrorReason(payload, "omiai_ice_failed")));
          })
          .receive("timeout", () => reject(new Error("omiai_ice_timeout")));
      });
    }

    if (message.type === "decline" || message.type === "hangup") {
      // For decline/hangup in relay mode, just clean up locally
      this.resetSignalingMode();
      return;
    }

    // Other message types (chat, file-offer, etc.) are not supported over Omiai relay
    console.warn("[Bridge] Unsupported signal type for Omiai relay:", message.type);
  }

  private bindOmiaiSignalingListeners(channel: any): void {
    if (this.omiaiSignalingBound) return;
    this.omiaiSignalingBound = true;

    channel.on("sdp_offer", (payload: Record<string, unknown>) => {
      const fromCode = payload.from_quicdial_id as string;
      const fromDeviceUuid = payload.from_device_uuid as string;
      const sdp = payload.sdp as string;
      const audioOnly = !!payload.audio_only;
      const callingCode = (payload.calling_code as string) || fromCode;
      const displayName = (payload.display_name as string) || fromCode;

      // Store the caller context for routing answers/ICE back
      this.omiaiCallContext = {
        callerCode: fromCode,
        callerDeviceUuid: fromDeviceUuid,
      };
      this.signalingMode = "omiai";

      const msg: SignalMessage = {
        type: "offer",
        callingCode,
        displayName,
        audioOnly,
        sdp,
      };
      for (const h of this.signalingListeners) {
        try { h(msg); } catch (err) { console.error("[Bridge] Omiai offer handler error:", err); }
      }
    });

    channel.on("sdp_answer", (payload: Record<string, unknown>) => {
      // Filter: only accept answers targeted to our device
      const targetDevice = payload.target_device_uuid as string;
      if (targetDevice && targetDevice !== this.deviceUuid) return;

      const fromCode = payload.from_quicdial_id as string;
      const fromDeviceUuid = payload.from_device_uuid as string;
      const sdp = payload.sdp as string;

      // Update call context to route ICE to the answering device
      this.omiaiCallContext = {
        callerCode: fromCode,
        callerDeviceUuid: fromDeviceUuid,
      };

      const msg: SignalMessage = { type: "answer", sdp };
      for (const h of this.signalingListeners) {
        try { h(msg); } catch (err) { console.error("[Bridge] Omiai answer handler error:", err); }
      }
    });

    channel.on("ice_candidate", (payload: Record<string, unknown>) => {
      const targetDevice = payload.target_device_uuid as string;
      if (targetDevice && targetDevice !== this.deviceUuid) return;

      const candidate = payload.candidate as string;
      const msg: SignalMessage = { type: "ice", candidate };
      for (const h of this.signalingListeners) {
        try { h(msg); } catch (err) { console.error("[Bridge] Omiai ICE handler error:", err); }
      }
    });

    channel.on("call_resolved", (payload: Record<string, unknown>) => {
      const answeredBy = payload.answered_by_device_uuid as string;
      if (answeredBy === this.deviceUuid) return; // We answered, ignore
      // Another device answered — stop ringing locally
      for (const h of this.disconnectListeners) {
        try { h(); } catch (err) { console.error("[Bridge] call_resolved handler error:", err); }
      }
    });

    channel.on("peer_offline", (payload: Record<string, unknown>) => {
      console.warn("[Bridge] Peer offline via Omiai:", payload.to, payload.reason);
      for (const h of this.disconnectListeners) {
        try { h(); } catch (err) { console.error("[Bridge] peer_offline handler error:", err); }
      }
    });

    channel.on("voicemail_available", (payload: Record<string, unknown>) => {
      const entry = {
        id: payload.id as string,
        from_quicdial_id: payload.from_quicdial_id as string,
        metadata: (payload.metadata as Record<string, unknown>) ?? {},
      };
      for (const h of this.voicemailAvailableListeners) {
        try { h(entry); } catch (err) { console.error("[Bridge] voicemail_available handler error:", err); }
      }
    });
  }

  // -----------------------------------------------------------------------
  // Voicemail Dropbox (Omiai relay)
  // -----------------------------------------------------------------------

  async depositVoicemail(opts: {
    toCode: string;
    dataB64: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ id: string }> {
    const channel = await this.ensureOmiaiChannel();
    return new Promise((resolve, reject) => {
      channel
        .push("voicemail_deposit", {
          to_quicdial_id: opts.toCode,
          data_b64: opts.dataB64,
          metadata: opts.metadata ?? {},
        })
        .receive("ok", (resp: Record<string, unknown>) => {
          resolve({ id: resp.id as string });
        })
        .receive("error", (payload: unknown) => {
          reject(new Error(this.extractErrorReason(payload, "voicemail_deposit_failed")));
        })
        .receive("timeout", () => reject(new Error("voicemail_deposit_timeout")));
    });
  }

  async checkVoicemails(): Promise<VoicemailCheckEntry[]> {
    const channel = await this.ensureOmiaiChannel();
    return new Promise((resolve, reject) => {
      channel
        .push("voicemail_check", {})
        .receive("ok", (resp: Record<string, unknown>) => {
          resolve((resp.voicemails as VoicemailCheckEntry[]) ?? []);
        })
        .receive("error", (payload: unknown) => {
          reject(new Error(this.extractErrorReason(payload, "voicemail_check_failed")));
        })
        .receive("timeout", () => reject(new Error("voicemail_check_timeout")));
    });
  }

  async fetchVoicemail(id: string): Promise<VoicemailFetchResult> {
    const channel = await this.ensureOmiaiChannel();
    return new Promise((resolve, reject) => {
      channel
        .push("voicemail_fetch", { id })
        .receive("ok", (resp: VoicemailFetchResult) => {
          resolve(resp);
        })
        .receive("error", (payload: unknown) => {
          reject(new Error(this.extractErrorReason(payload, "voicemail_fetch_failed")));
        })
        .receive("timeout", () => reject(new Error("voicemail_fetch_timeout")));
    });
  }

  // -----------------------------------------------------------------------
  // Quicdial
  // -----------------------------------------------------------------------

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
    const endpoint = await this.resolveOmiaiEndpoint();
    if (this.omiaiEndpoint && this.omiaiEndpoint !== endpoint) {
      this.resetOmiaiSocket();
    }

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
      const startupPayload = this.buildStartupRegistrationPayload(
        profile.callingCode,
      );
      const socket = new Socket(endpoint, {
        params: {
          ...startupPayload,
          device_uuid: this.deviceUuid,
          event_contract: "dual",
        },
        timeout: 7000,
      });

      socket.onClose(() => {
        this.omiaiChannel = null;
        this.omiaiSocket = null;
        this.omiaiEndpoint = null;
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

      try {
        await this.pushStartupRegistration(channel, startupPayload);
      } catch (err) {
        console.warn(
          "[Bridge] startup registration push failed; continuing with join state",
          err,
        );
      }

      this.omiaiSocket = socket;
      this.omiaiChannel = channel;
      this.omiaiEndpoint = endpoint;
      this.bindOmiaiSignalingListeners(channel);

      // Also join the lobby channel for presence tracking
      try {
        await this.joinLobby(socket);
      } catch (lobbyErr) {
        console.warn("[Bridge] lobby join failed; continuing without presence", lobbyErr);
      }
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

  private async resolveOmiaiEndpoint(): Promise<string> {
    const fromStorage = this.readOmiaiUrlOverride();
    if (fromStorage) {
      return fromStorage;
    }

    const fromDiscovery = await this.discoverOmiaiEndpoint();
    if (fromDiscovery) {
      return fromDiscovery;
    }

    const fromEnv = (import.meta.env.VITE_OMIAI_WS_URL as string | undefined)?.trim();
    if (fromEnv) {
      return this.normalizeOmiaiEndpoint(fromEnv);
    }

    return this.normalizeOmiaiEndpoint(DEFAULT_OMIAI_WS_URL);
  }

  private async discoverOmiaiEndpoint(): Promise<string | null> {
    if (this.discoveredOmiaiEndpoint) {
      return this.discoveredOmiaiEndpoint;
    }
    if (this.omiaiDiscoveryPromise) {
      return this.omiaiDiscoveryPromise;
    }

    this.omiaiDiscoveryPromise = (async () => {
      try {
        const discovered = await invoke<OmiaiDiscoveryResult | null>(
          "discover_omiai_service",
          { timeoutMs: 2800 },
        );
        if (!discovered?.wsUrl || !discovered.wsUrl.trim()) {
          console.info("[Bridge] Omiai mDNS discovery did not find a local service");
          return null;
        }
        const normalized = this.normalizeOmiaiEndpoint(discovered.wsUrl);
        this.discoveredOmiaiEndpoint = normalized;
        console.info(
          `[Bridge] Omiai mDNS discovered instance=${discovered.instanceName ?? "unknown"} ip=${discovered.ip} port=${discovered.port}`,
        );
        return normalized;
      } catch (err) {
        console.warn("[Bridge] Omiai mDNS discovery failed", err);
        return null;
      } finally {
        this.omiaiDiscoveryPromise = null;
      }
    })();

    return this.omiaiDiscoveryPromise;
  }

  private buildStartupRegistrationPayload(
    publicKey: string,
  ): OmiaiStartupRegistrationPayload {
    const trimmed = publicKey.trim();
    return {
      public_key: trimmed,
      session_token: this.getOrCreateSessionToken(trimmed),
      sig_ts: Date.now().toString(),
      sig_nonce: this.generateNonce(),
    };
  }

  private async pushStartupRegistration(
    channel: any,
    payload: OmiaiStartupRegistrationPayload,
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      channel
        .push("register_startup", payload)
        .receive("ok", () => resolve())
        .receive("error", (resp: unknown) => {
          reject(
            new Error(
              this.extractErrorReason(resp, "register_startup_failed"),
            ),
          );
        })
        .receive("timeout", () => reject(new Error("register_startup_timeout")));
    });
  }

  private getOrCreateSessionToken(publicKey: string): string {
    if (this.omiaiSessionToken) {
      return this.omiaiSessionToken;
    }
    this.omiaiSessionToken = `${publicKey}.${Date.now()}.${this.generateNonce()}`;
    return this.omiaiSessionToken;
  }

  private generateNonce(): string {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
  }

  private async bootstrapOmiaiRegistration(): Promise<void> {
    await this.discoverOmiaiEndpoint();
    try {
      await this.ensureOmiaiChannel();
      console.info("[Bridge] Omiai channel ready and startup registration sent");
    } catch (err) {
      console.warn("[Bridge] Omiai startup registration skipped", err);
    }
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

  private readOmiaiUrlOverride(): string | null {
    if (typeof window === "undefined") {
      return null;
    }
    const stored = window.localStorage.getItem(OMIAI_WS_URL_STORAGE_KEY);
    if (!stored || !stored.trim()) {
      return null;
    }
    return this.normalizeOmiaiEndpoint(stored);
  }

  private normalizeOmiaiEndpoint(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) {
      return "ws://localhost:4000/ws/sankaku";
    }
    const withoutWebsocketSuffix = trimmed.replace(/\/websocket\/?$/i, "");
    return withoutWebsocketSuffix.replace(/\/+$/, "");
  }

  private resetOmiaiSocket(): void {
    if (this.lobbyChannel) {
      this.lobbyChannel.leave();
    }
    this.lobbyChannel = null;
    this.presencePeers.clear();
    if (this.omiaiChannel) {
      this.omiaiChannel.leave();
    }
    this.omiaiChannel = null;
    if (this.omiaiSocket) {
      this.omiaiSocket.disconnect();
    }
    this.omiaiSocket = null;
    this.omiaiEndpoint = null;
    this.omiaiJoinPromise = null;
    this.omiaiSignalingBound = false;
  }

  private handleOmiaiUrlChanged = () => {
    this.resetOmiaiSocket();
  };
}

export default SankakuBridge;
