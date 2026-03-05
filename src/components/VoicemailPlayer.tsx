import React, { useMemo, useState } from "react";
import { Avatar, Button, Typography } from "@douyinfe/semi-ui";
import type { DownloadedFileEntry, Friend } from "../types/call";
import { useI18n } from "../i18n/index";

const { Text } = Typography;

interface Props {
  entries: DownloadedFileEntry[];
  friends: Friend[];
  heardPaths: Set<string>;
  getAvatarSrc: (avatarId?: string) => string | undefined;
  resolvePlaybackUrl: (entry: DownloadedFileEntry) => Promise<string>;
  onDelete: (entry: DownloadedFileEntry) => Promise<void>;
  onMarkHeard: (path: string) => void;
}

function parseSenderCode(fileName: string): string | null {
  const match = fileName.match(/^voicemail_([^_]+)_/);
  return match?.[1] ?? null;
}

function formatDuration(seconds: number | null): string {
  if (!seconds || !Number.isFinite(seconds)) return "--:--";
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${mins}:${secs}`;
}

const VoicemailPlayer: React.FC<Props> = ({
  entries,
  friends,
  heardPaths,
  getAvatarSrc,
  resolvePlaybackUrl,
  onDelete,
  onMarkHeard,
}) => {
  const { t } = useI18n();
  const [expandedPath, setExpandedPath] = useState<string | null>(null);
  const [playbackUrls, setPlaybackUrls] = useState<Map<string, string>>(new Map());
  const [durations, setDurations] = useState<Map<string, number>>(new Map());

  const ordered = useMemo(
    () => [...entries].sort((a, b) => b.modifiedAt - a.modifiedAt),
    [entries],
  );
  const unheard = ordered.filter((entry) => !heardPaths.has(entry.path));
  const heard = ordered.filter((entry) => heardPaths.has(entry.path));

  const renderEntry = (entry: DownloadedFileEntry) => {
    const senderCode = parseSenderCode(entry.fileName);
    const friend = senderCode
      ? friends.find((candidate) => candidate.callingCode === senderCode)
      : undefined;
    const displayName = friend?.displayName ?? senderCode ?? t("voicemail.unknownSender");
    const avatarSrc = getAvatarSrc(friend?.avatarId);
    const isExpanded = expandedPath === entry.path;
    const playbackUrl = playbackUrls.get(entry.path);

    return (
      <div key={entry.path} className="xdx-voicemail-row">
        <div className="xdx-voicemail-row-main">
          <Avatar size="small" src={avatarSrc}>
            {displayName.charAt(0)}
          </Avatar>
          <div className="xdx-voicemail-row-text">
            <div className="xdx-voicemail-row-title">
              <span>{displayName}</span>
              {!heardPaths.has(entry.path) && (
                <span className="xdx-voicemail-unheard-dot" />
              )}
            </div>
            <Text size="small" className="xdx-voicemail-row-subtitle">
              {new Date(entry.modifiedAt * 1000).toLocaleString()} · {formatDuration(durations.get(entry.path) ?? null)}
            </Text>
          </div>
        </div>
        <div className="xdx-voicemail-row-actions">
          <Button
            size="small"
            onClick={async () => {
              if (isExpanded) {
                setExpandedPath(null);
                return;
              }
              if (!playbackUrl) {
                const url = await resolvePlaybackUrl(entry);
                setPlaybackUrls((prev) => new Map(prev).set(entry.path, url));
              }
              setExpandedPath(entry.path);
            }}
          >
            {isExpanded ? t("voicemail.pause") : t("voicemail.play")}
          </Button>
          <Button
            size="small"
            theme="borderless"
            className="xdx-friend-danger-btn"
            onClick={() => onDelete(entry)}
          >
            {t("voicemail.delete")}
          </Button>
        </div>
        {isExpanded && playbackUrl && (
          <audio
            className="xdx-voicemail-audio"
            controls
            preload="metadata"
            src={playbackUrl}
            onPlay={() => onMarkHeard(entry.path)}
            onLoadedMetadata={(ev) => {
              const seconds = ev.currentTarget.duration;
              if (Number.isFinite(seconds)) {
                setDurations((prev) => new Map(prev).set(entry.path, seconds));
              }
            }}
          />
        )}
      </div>
    );
  };

  return (
    <div className="xdx-voicemail-player">
      {unheard.length > 0 && (
        <>
          <Text className="xdx-voicemail-group-label">{t("voicemail.unheard")}</Text>
          {unheard.map(renderEntry)}
        </>
      )}
      {heard.length > 0 && (
        <>
          <Text className="xdx-voicemail-group-label">{t("voicemail.heard")}</Text>
          {heard.map(renderEntry)}
        </>
      )}
      {ordered.length === 0 && (
        <Text size="small" style={{ color: "rgba(255,255,255,0.45)" }}>
          {t("voicemail.empty")}
        </Text>
      )}
    </div>
  );
};

export default VoicemailPlayer;
