import React, { useRef, useEffect, useState, useCallback } from "react";
import { Typography, Tag, Tooltip, Avatar, Space } from "@douyinfe/semi-ui";
import {
  IconCamera,
  IconDesktop,
  IconClose,
  IconMicrophone,
  IconStop,
  IconComment,
} from "@douyinfe/semi-icons";
import { useI18n } from "../i18n/index";
import {
  CallState,
  type ActiveCallInfo,
  type CallNetworkMetrics,
} from "../types/call";

const { Title, Text } = Typography;

interface Props {
  callState: CallState;
  activeCall: ActiveCallInfo;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  cameraOn: boolean;
  micOn: boolean;
  metrics: CallNetworkMetrics | null;
  chatOpen: boolean;
  unreadChat: number;
  onToggleCamera: () => void;
  onToggleMic: () => void;
  onEndCall: () => void;
  onRecordVoicemail: () => void;
  onToggleChat: () => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

const TallyLight: React.FC<{
  label: string;
  live: boolean;
  kind: "camera" | "mic";
}> = ({ label, live, kind }) => (
  <div className={`xdx-tally ${live ? "live" : "off"} xdx-tally-${kind}`}>
    <span className="xdx-tally-dot" />
    <Text
      size="small"
      style={{ color: live ? "#fff" : "rgba(255,255,255,0.35)" }}
    >
      {label}
    </Text>
  </div>
);

const CallView: React.FC<Props> = ({
  callState,
  activeCall,
  localStream,
  remoteStream,
  cameraOn,
  micOn,
  metrics,
  chatOpen,
  unreadChat,
  onToggleCamera,
  onToggleMic,
  onEndCall,
  onRecordVoicemail,
  onToggleChat,
}) => {
  const { t } = useI18n();
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [callDuration, setCallDuration] = useState("00:00");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, callState]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Always attach remote stream to a hidden audio element for audio playback
  useEffect(() => {
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    if (
      callState !== CallState.InCallVideo &&
      callState !== CallState.InCallAudio
    )
      return;
    const start = activeCall.startTime;
    const tick = setInterval(() => {
      setCallDuration(
        formatDuration(Math.floor((Date.now() - start) / 1000)),
      );
    }, 1000);
    return () => clearInterval(tick);
  }, [callState, activeCall.startTime]);

  useEffect(() => {
    if (!isRecording) return;
    const tick = setInterval(() => setRecordingDuration((d) => d + 1), 1000);
    return () => clearInterval(tick);
  }, [isRecording]);

  const handleStartRecording = useCallback(() => {
    setIsRecording(true);
    setRecordingDuration(0);
    onRecordVoicemail();
  }, [onRecordVoicemail]);

  const handleStopRecording = useCallback(() => {
    setIsRecording(false);
    onEndCall();
  }, [onEndCall]);

  // ===== Voicemail UI =====
  if (callState === CallState.Voicemail) {
    return (
      <div className="xdx-voicemail">
        <div className="xdx-voicemail-content">
          <Avatar
            size="extra-large"
            className="xdx-voicemail-avatar"
            style={{
              background:
                "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            }}
          >
            {activeCall.peerName.charAt(0)}
          </Avatar>
          <Title heading={4} style={{ color: "#fff", marginTop: 24 }}>
            {activeCall.peerName} {t("voicemail.unanswered")}
          </Title>
          <Text style={{ color: "rgba(255,255,255,0.45)", marginTop: 4 }}>
            {t("voicemail.leaveMessage")}
          </Text>
          {isRecording ? (
            <div className="xdx-recording-active">
              <div className="xdx-recording-indicator">
                <span className="xdx-rec-dot" />
                <Text
                  style={{
                    color: "#ff4757",
                    fontWeight: 700,
                    letterSpacing: 1,
                  }}
                >
                  {t("voicemail.rec")}
                </Text>
              </div>
              <Title
                heading={2}
                style={{
                  color: "#fff",
                  fontVariantNumeric: "tabular-nums",
                  margin: "16px 0",
                }}
              >
                {formatDuration(recordingDuration)}
              </Title>
              <div className="xdx-waveform">
                {Array.from({ length: 32 }).map((_, i) => (
                  <div
                    key={i}
                    className="xdx-waveform-bar"
                    style={{ animationDelay: `${i * 0.06}s` }}
                  />
                ))}
              </div>
              <div className="xdx-voicemail-preview">
                <video
                  ref={localVideoRef}
                  className="xdx-video-element"
                  autoPlay
                  playsInline
                  muted
                />
                {!localStream && (
                  <div className="xdx-video-placeholder-small">
                    <IconCamera
                      size="large"
                      style={{ color: "rgba(255,255,255,0.2)" }}
                    />
                  </div>
                )}
              </div>
              <button
                className="xdx-btn-stop-record"
                onClick={handleStopRecording}
              >
                <IconStop style={{ marginRight: 6 }} />
                {t("voicemail.stopRecording")}
              </button>
            </div>
          ) : (
            <div className="xdx-voicemail-start">
              <Space vertical align="center" spacing={16} style={{ marginTop: 32 }}>
                <button
                  className="xdx-btn-record"
                  onClick={handleStartRecording}
                >
                  <span className="xdx-record-circle" />
                </button>
                <Text
                  size="small"
                  style={{ color: "rgba(255,255,255,0.5)" }}
                >
                  {t("voicemail.startRecording")}
                </Text>
                <button className="xdx-link-btn" onClick={onEndCall}>
                  {t("voicemail.back")}
                </button>
              </Space>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ===== In-Call UI =====
  const hasRemoteVideo = !!remoteStream;
  const bitrateMbps = ((metrics?.bitrateBps ?? 0) / 1_000_000).toFixed(2);
  const lossPercent = (metrics?.packetLossPercent ?? 0).toFixed(2);

  return (
    <div className="xdx-call-view">
      {/* Hidden audio element — ensures remote audio always plays (especially audio-only calls) */}
      <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: "none" }} />

      {/* Tally bar */}
      <div className="xdx-tally-bar">
        <TallyLight
          label={cameraOn ? t("call.camLive") : t("call.camOff")}
          live={cameraOn}
          kind="camera"
        />
        <div className="xdx-call-info-bar">
          <Tag
            color={callState === CallState.InCallVideo ? "green" : "blue"}
            size="small"
          >
            {callState === CallState.InCallVideo
              ? t("call.videoCall")
              : t("call.audioCall")}
          </Tag>
          <Text
            style={{
              color: "rgba(255,255,255,0.6)",
              fontVariantNumeric: "tabular-nums",
              margin: "0 8px",
              fontSize: 13,
            }}
          >
            {callDuration}
          </Text>
          <Text size="small" style={{ color: "rgba(255,255,255,0.3)" }}>
            {activeCall.peerName}
          </Text>
        </div>
        <TallyLight
          label={micOn ? t("call.micLive") : t("call.micOff")}
          live={micOn}
          kind="mic"
        />
      </div>

      {/* Video grid */}
      <div className="xdx-video-grid">
        <div className="xdx-remote-video">
          {callState === CallState.InCallAudio ? (
            <div className="xdx-audio-only-display">
              {/* Liquid Glass blobs */}
              <div className="xdx-liquid-glass-container">
                <div className="xdx-liquid-blob xdx-blob-1" />
                <div className="xdx-liquid-blob xdx-blob-2" />
                <div className="xdx-liquid-blob xdx-blob-3" />
                <div className="xdx-liquid-blob xdx-blob-4" />
                <div className="xdx-liquid-blob xdx-blob-5" />
              </div>
              <div className="xdx-audio-center">
                <Avatar
                  size="extra-large"
                  style={{
                    background:
                      "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                    width: 96,
                    height: 96,
                    fontSize: 36,
                    zIndex: 2,
                    position: "relative",
                    boxShadow: "0 0 40px rgba(102,126,234,0.3)",
                  }}
                >
                  {activeCall.peerName.charAt(0)}
                </Avatar>
                <Title heading={3} style={{ color: "#fff", marginTop: 20, zIndex: 2, position: "relative" }}>
                  {activeCall.peerName}
                </Title>
                <Text style={{ color: "rgba(255,255,255,0.55)", zIndex: 2, position: "relative" }}>
                  {t("call.audioInProgress")}
                </Text>
                <div className="xdx-audio-wave" style={{ zIndex: 2, position: "relative" }}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span
                      key={i}
                      className="xdx-audio-wave-dot"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              <video
                ref={remoteVideoRef}
                className={`xdx-video-element ${hasRemoteVideo ? "active" : ""}`}
                autoPlay
                playsInline
              />
              {!hasRemoteVideo && (
                <div className="xdx-video-placeholder">
                  <Avatar
                    size="extra-large"
                    style={{
                      background:
                        "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                      width: 80,
                      height: 80,
                      fontSize: 32,
                    }}
                  >
                    {activeCall.peerName.charAt(0)}
                  </Avatar>
                  <Text
                    style={{
                      color: "rgba(255,255,255,0.35)",
                      marginTop: 12,
                      fontSize: 13,
                    }}
                  >
                    {t("call.waitingRemote")}
                  </Text>
                </div>
              )}
            </>
          )}
          {metrics && (
            <div className="xdx-metrics-overlay">
              <div className="xdx-metrics-title">Sankaku/RT Telemetry</div>
              <div className="xdx-metrics-row">
                RTT: {metrics.rttMs} ms
              </div>
              <div className="xdx-metrics-row">
                Bitrate: {bitrateMbps} Mbps
              </div>
              <div className="xdx-metrics-row">
                Loss: {lossPercent}%
              </div>
              <div className="xdx-metrics-row">
                Dropped: {metrics.packetsDropped}
              </div>
              <div className="xdx-metrics-row">
                FPS: {metrics.fps.toFixed(1)}
              </div>
            </div>
          )}
          <div className="xdx-remote-name-overlay">
            <Text
              size="small"
              style={{
                color: "#fff",
                textShadow: "0 1px 4px rgba(0,0,0,0.6)",
              }}
            >
              {activeCall.peerName}
            </Text>
          </div>
        </div>

        {/* Local PiP with real webcam feed */}
        {callState === CallState.InCallVideo && (
          <div
            className={`xdx-local-video ${!cameraOn ? "camera-off" : ""}`}
          >
            <video
              ref={localVideoRef}
              className="xdx-video-element xdx-local"
              autoPlay
              playsInline
              muted
            />
            {!cameraOn && (
              <div className="xdx-camera-off-overlay">
                <IconCamera
                  size="extra-large"
                  style={{ color: "rgba(255,255,255,0.3)" }}
                />
              </div>
            )}
            <div className="xdx-local-label">
              <Text size="small" style={{ color: "#fff" }}>
                {t("call.local")}
              </Text>
            </div>
          </div>
        )}
      </div>

      {/* Control bar */}
      <div className="xdx-control-bar">
        <div className="xdx-control-bar-inner">
          <Tooltip
            content={micOn ? t("call.mute") : t("call.unmute")}
            position="top"
          >
            <button
              className={`xdx-ctrl-btn ${!micOn ? "toggled-off" : ""}`}
              onClick={onToggleMic}
            >
              <IconMicrophone size="extra-large" />
              {!micOn && <span className="xdx-slash-overlay" />}
            </button>
          </Tooltip>
          <Tooltip
            content={cameraOn ? t("call.cameraOff") : t("call.cameraOn")}
            position="top"
          >
            <button
              className={`xdx-ctrl-btn ${!cameraOn ? "toggled-off" : ""}`}
              onClick={onToggleCamera}
            >
              <IconCamera size="extra-large" />
              {!cameraOn && <span className="xdx-slash-overlay" />}
            </button>
          </Tooltip>
          <Tooltip content={t("chat.title")} position="top">
            <button
              className={`xdx-ctrl-btn ${chatOpen ? "active" : ""}`}
              onClick={onToggleChat}
            >
              <IconComment size="extra-large" />
              {unreadChat > 0 && (
                <span className="xdx-unread-badge">{unreadChat}</span>
              )}
            </button>
          </Tooltip>
          <Tooltip content={t("call.shareScreen")} position="top">
            <button className="xdx-ctrl-btn">
              <IconDesktop size="extra-large" />
            </button>
          </Tooltip>
          <Tooltip content={t("call.endCall")} position="top">
            <button className="xdx-ctrl-btn xdx-btn-end" onClick={onEndCall}>
              <IconClose size="extra-large" />
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
};

export default CallView;
