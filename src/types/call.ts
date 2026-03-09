export enum CallState {
  Idle = "IDLE",
  IncomingCall = "INCOMING_CALL",
  Connecting = "CONNECTING",
  InCallVideo = "IN_CALL_VIDEO",
  InCallAudio = "IN_CALL_AUDIO",
  Voicemail = "VOICEMAIL",
}

export type LocaleCode = "en" | "zh";

export interface UserProfile {
  displayName: string;
  callingCode: string;
  avatarId: string;
  language: LocaleCode;
}

export interface DiscoveredPeer {
  callingCode: string;
  displayName: string;
  addresses: string[];
  port: number;
}

export interface IncomingCallPayload {
  peerId: string;
  peerName: string;
  peerAvatar: string | null;
  audioOnly: boolean;
  timestamp: number;
}

export interface CallResult {
  success: boolean;
  message: string;
  sessionId: string | null;
}

export interface VoicemailResult {
  success: boolean;
  message: string;
  recordingId: string | null;
  durationMs: number;
}

export interface ActiveCallInfo {
  peerId: string;
  peerName: string;
  peerAvatar?: string;
  audioOnly: boolean;
  sessionId?: string;
  startTime: number;
}

export interface ChatMessage {
  id: string;
  from: "local" | "remote";
  text?: string;
  sticker?: string;
  fileName?: string;
  timestamp: number;
}

export interface Friend {
  callingCode: string;
  displayName: string;
  avatarId: string;
  publicKey: string | null;
  voicemailKey?: string | null;
  approved: boolean;
  addedAt: number;
}

export interface StoredMessage {
  id: string;
  from: string;
  text?: string;
  sticker?: string;
  fileName?: string;
  timestamp: number;
}

export interface FileTransferProgress {
  fileId: string;
  fileName: string;
  byteSize: number;
  totalSize: number;
  received: number;
  kind?: "file" | "voicemail";
  peerCode?: string;
  voicemailNonce?: string;
  sha256?: string;
  verified?: boolean;
  error?: string;
  direction: "send" | "receive";
  status: "offering" | "transferring" | "complete" | "rejected";
}

export interface DownloadedFileEntry {
  fileName: string;
  path: string;
  sizeBytes: number;
  modifiedAt: number;
  sha256: string;
  kind: "file" | "voicemail";
}

export interface DownloadDirectoryInfo {
  path: string;
  mobileManaged: boolean;
}

export interface ReadReceivedFilePayload {
  dataB64: string;
  mimeType: string;
}

export interface CallNetworkMetrics {
  rttMs: number;
  bitrateBps: number;
  packetLossPercent: number;
  packetsDropped: number;
  fps: number;
}

export interface VoicemailCheckEntry {
  id: string;
  from_quicdial_id: string;
  metadata: Record<string, unknown>;
  inserted_at: number;
}

export interface VoicemailFetchResult {
  id: string;
  from_quicdial_id: string;
  data_b64: string;
  metadata: Record<string, unknown>;
  inserted_at: number;
}

// ---------------------------------------------------------------------------
// Omiai server types (accounts, friends, presence)
// ---------------------------------------------------------------------------

export interface OmiaiUser {
  quicdialId: string;
  displayName: string;
  avatarId: string;
}

export interface OmiaiFriend {
  friendshipId: string;
  quicdialId: string;
  displayName: string;
  avatarId: string;
}

export interface OmiaiFriendRequest {
  friendshipId: string;
  fromQuicdialId: string;
  fromDisplayName: string;
  fromAvatarId: string;
  createdAt?: string;
}

export interface PresencePeer {
  quicdialId: string;
  displayName: string;
  avatarId: string;
  deviceUuid?: string;
  ip?: string;
  onlineAt?: number;
}

export interface DeviceIdentity {
  deviceUuid: string;
  quicdialId: string | null;
  displayName: string | null;
  avatarId: string | null;
  serverHost: string | null;
}

// ---------------------------------------------------------------------------
// Signal messages (P2P)
// ---------------------------------------------------------------------------

export type SignalMessage =
  | {
      type: "offer";
      callingCode: string;
      displayName: string;
      audioOnly: boolean;
      sdp: string;
      targetCode?: string;
    }
  | { type: "answer"; sdp: string }
  | { type: "ice"; candidate: string }
  | { type: "decline" }
  | { type: "hangup" }
  | {
      type: "chat";
      id: string;
      text?: string;
      sticker?: string;
      timestamp: number;
    }
  | { type: "typing"; displayName: string }
  | {
      type: "hello";
      callingCode: string;
      displayName: string;
      avatarId?: string;
      publicKey?: string;
      voicemailKey?: string;
    }
  | {
      type: "friend-request";
      callingCode: string;
      displayName: string;
      avatarId?: string;
    }
  | {
      type: "friend-accept";
      callingCode: string;
      displayName: string;
      avatarId?: string;
      publicKey?: string;
      voicemailKey?: string;
    }
  | {
      type: "file-offer";
      fileId: string;
      fileName: string;
      fileSize: number;
      fromCode?: string;
      kind?: "file" | "voicemail";
      voicemailAuth?: string;
      voicemailTicket?: string;
      voicemailNonce?: string;
      voicemailIssuedAt?: number;
      transport?: "legacy-signal-v1" | "kyu2-webrtc-v1";
      totalChunks?: number;
      sha256?: string;
    }
  | { type: "file-accept"; fileId: string }
  | { type: "file-reject"; fileId: string }
  | {
      type: "file-chunk";
      fileId: string;
      offset: number;
      data: string;
      total: number;
    }
  | { type: "file-complete"; fileId: string; sha256?: string };
