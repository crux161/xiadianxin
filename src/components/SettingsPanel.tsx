import React, { useState, useEffect, useRef } from "react";
import { Button, Input, Typography, Toast, Radio, RadioGroup, Avatar } from "@douyinfe/semi-ui";
import { IconClose, IconUpload } from "@douyinfe/semi-icons";
import { QRCodeSVG } from "qrcode.react";
import { useI18n } from "../i18n/index";
import type {
  DownloadDirectoryInfo,
  UserProfile,
  LocaleCode,
} from "../types/call";
import SankakuBridge from "../services/SankakuBridge";

import foxImg from "../../reference/images/kyu-kun/fox.jpg";
import foxOkImg from "../../reference/images/kyu-kun/fox-maru-green-OK.jpeg";
import foxBeachImg from "../../reference/images/kyu-kun/fox-beach.jpeg";
import foxValentineImg from "../../reference/images/kyu-kun/fox-valentines.jpeg";
import kenRedImg from "../../reference/images/ken-chan/koken-CNY-red.jpeg";
import kenRed2Img from "../../reference/images/ken-chan/koken-CNY-red-2.jpeg";
import pentaroImg from "../../reference/images/pentaro-san/OIG2.AB3fp4AoIltcenw1pKtq.jpeg";
import pentaro2Img from "../../reference/images/pentaro-san/OIG2.Pf7UKiaLAR_Vi97TVPr_.jpeg";

const { Title, Text } = Typography;

const AVATARS = [
  { id: "kyu-kun", label: "Kyu-kun", src: foxImg },
  { id: "kyu-ok", label: "Kyu OK", src: foxOkImg },
  { id: "kyu-beach", label: "Beach", src: foxBeachImg },
  { id: "kyu-valentine", label: "Love", src: foxValentineImg },
  { id: "ken-chan", label: "Ken-chan", src: kenRedImg },
  { id: "ken-chan-2", label: "Ken 2", src: kenRed2Img },
  { id: "pentaro", label: "Pentaro", src: pentaroImg },
  { id: "pentaro-2", label: "Pentaro 2", src: pentaro2Img },
];

export const AVATAR_MAP: Record<string, string> = Object.fromEntries(
  AVATARS.map((a) => [a.id, a.src]),
);

interface Props {
  open: boolean;
  profile: UserProfile | null;
  onClose: () => void;
  onProfileChanged: (p: UserProfile) => void;
  downloadDirectoryInfo: DownloadDirectoryInfo | null;
  onDownloadDirectoryChanged: () => void;
  uiScale: number;
  onUiScaleChange: (value: number) => void;
}

const SettingsPanel: React.FC<Props> = ({
  open,
  profile,
  onClose,
  onProfileChanged,
  downloadDirectoryInfo,
  onDownloadDirectoryChanged,
  uiScale,
  onUiScaleChange,
}) => {
  const { t } = useI18n();
  const [displayName, setDisplayName] = useState("");
  const [avatarId, setAvatarId] = useState("kyu-kun");
  const [language, setLanguage] = useState<LocaleCode>("en");
  const [codeCopied, setCodeCopied] = useState(false);
  const [customAvatarUrl, setCustomAvatarUrl] = useState<string | null>(null);
  const [downloadLocation, setDownloadLocation] = useState("");
  const [downloadManaged, setDownloadManaged] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName);
      setAvatarId(profile.avatarId);
      setLanguage(profile.language);
    }
  }, [profile]);

  useEffect(() => {
    if (open) {
      SankakuBridge.getInstance()
        .loadCustomAvatar()
        .then((data) => {
          if (data) setCustomAvatarUrl(data);
        })
        .catch(() => {});

      SankakuBridge.getInstance()
        .getDownloadDirectory()
        .then((info) => {
          setDownloadLocation(info.path);
          setDownloadManaged(info.mobileManaged);
        })
        .catch(() => {});
    }
  }, [open]);

  useEffect(() => {
    if (!downloadDirectoryInfo) return;
    setDownloadLocation(downloadDirectoryInfo.path);
    setDownloadManaged(downloadDirectoryInfo.mobileManaged);
  }, [downloadDirectoryInfo]);

  const handleSave = async () => {
    try {
      const updated = await SankakuBridge.getInstance().updateProfile({
        displayName,
        avatarId,
        language,
      });
      const trimmedDownloadPath = downloadLocation.trim();
      if (!downloadManaged) {
        if (!trimmedDownloadPath) {
          Toast.warning({ content: t("settings.downloadLocationRequired") });
          return;
        }
        if (trimmedDownloadPath !== (downloadDirectoryInfo?.path ?? "")) {
          await SankakuBridge.getInstance().setDownloadDirectory(
            trimmedDownloadPath,
          );
          onDownloadDirectoryChanged();
        }
      }
      onProfileChanged(updated);
      Toast.success({ content: t("toast.profileSaved") });
      onClose();
    } catch (err) {
      Toast.error({ content: String(err) });
    }
  };

  const handleCopyCode = () => {
    if (profile?.callingCode) {
      navigator.clipboard.writeText(profile.callingCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setCustomAvatarUrl(dataUrl);
      setAvatarId("custom");
      try {
        await SankakuBridge.getInstance().saveCustomAvatar(dataUrl);
      } catch (err) {
        console.error("[XDX] save avatar failed:", err);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  if (!open) return null;

  return (
    <div className="xdx-settings-overlay" onClick={onClose}>
      <div className="xdx-settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="xdx-settings-header">
          <Title heading={5} style={{ color: "#fff", margin: 0 }}>
            {t("settings.title")}
          </Title>
          <button className="xdx-settings-close" onClick={onClose}>
            <IconClose />
          </button>
        </div>

        <div className="xdx-settings-body">
          {/* Calling Code (read-only) */}
          <div className="xdx-settings-section">
            <Text className="xdx-settings-label">{t("settings.callingCode")}</Text>
            <div className="xdx-calling-code-display">
              <span className="xdx-code-value">{profile?.callingCode ?? "---"}</span>
              <button className="xdx-code-copy" onClick={handleCopyCode}>
                {codeCopied ? t("idle.copied") : t("idle.copyCode")}
              </button>
            </div>
          </div>

          <div className="xdx-settings-section">
            <Text className="xdx-settings-label">{t("settings.quicdialQr")}</Text>
            <div className="xdx-quicdial-qr-card">
              <div className="xdx-quicdial-qr-image">
                <QRCodeSVG
                  value={profile?.callingCode || "unavailable"}
                  size={148}
                  bgColor="#ffffff"
                  fgColor="#111827"
                  level="M"
                  includeMargin={true}
                />
              </div>
              <Text className="xdx-quicdial-qr-code">
                {profile?.callingCode ?? "---"}
              </Text>
              <Text size="small" className="xdx-quicdial-qr-hint">
                {t("settings.quicdialHint")}
              </Text>
            </div>
          </div>

          {/* Display Name */}
          <div className="xdx-settings-section">
            <Text className="xdx-settings-label">{t("settings.displayName")}</Text>
            <Input
              value={displayName}
              onChange={(v) => setDisplayName(v)}
              className="xdx-settings-input"
              size="large"
            />
          </div>

          {/* Avatar */}
          <div className="xdx-settings-section">
            <Text className="xdx-settings-label">{t("settings.avatar")}</Text>
            <div className="xdx-avatar-grid">
              {AVATARS.map((av) => (
                <button
                  key={av.id}
                  className={`xdx-avatar-option ${avatarId === av.id ? "selected" : ""}`}
                  onClick={() => setAvatarId(av.id)}
                >
                  <Avatar src={av.src} size="default" />
                  <Text size="small" style={{ color: "rgba(255,255,255,0.6)" }}>
                    {av.label}
                  </Text>
                </button>
              ))}
              {/* Custom upload option */}
              <button
                className={`xdx-avatar-option ${avatarId === "custom" ? "selected" : ""}`}
                onClick={() => fileInputRef.current?.click()}
              >
                {customAvatarUrl ? (
                  <Avatar src={customAvatarUrl} size="default" />
                ) : (
                  <div className="xdx-avatar-upload-placeholder">
                    <IconUpload style={{ color: "rgba(255,255,255,0.4)" }} />
                  </div>
                )}
                <Text size="small" style={{ color: "rgba(255,255,255,0.6)" }}>
                  {t("settings.uploadAvatar")}
                </Text>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleAvatarUpload}
              />
            </div>
          </div>

          {/* Language */}
          <div className="xdx-settings-section">
            <Text className="xdx-settings-label">{t("settings.language")}</Text>
            <RadioGroup
              value={language}
              onChange={(e) => setLanguage(e.target.value as LocaleCode)}
              direction="horizontal"
              className="xdx-lang-radio"
            >
              <Radio value="en">{t("settings.langEnglish")}</Radio>
              <Radio value="zh">{t("settings.langChinese")}</Radio>
            </RadioGroup>
          </div>

          {/* UI Scale */}
          <div className="xdx-settings-section">
            <Text className="xdx-settings-label">{t("settings.uiScale")}</Text>
            <div className="xdx-scale-control">
              <input
                type="range"
                min={0.9}
                max={1.2}
                step={0.02}
                value={uiScale}
                className="xdx-scale-slider"
                onChange={(e) => onUiScaleChange(Number(e.target.value))}
              />
              <div className="xdx-scale-row">
                <Text size="small" style={{ color: "rgba(255,255,255,0.45)" }}>
                  {t("settings.uiScaleHint")}
                </Text>
                <Text className="xdx-scale-value">
                  {Math.round(uiScale * 100)}%
                </Text>
              </div>
            </div>
          </div>

          <div className="xdx-settings-section">
            <Text className="xdx-settings-label">{t("settings.downloadLocation")}</Text>
            {downloadManaged ? (
              <div className="xdx-settings-static">{downloadLocation}</div>
            ) : (
              <Input
                value={downloadLocation}
                onChange={(v) => setDownloadLocation(v)}
                className="xdx-settings-input"
                size="large"
                placeholder={t("settings.downloadLocationPlaceholder")}
              />
            )}
            <Text
              size="small"
              style={{
                color: "rgba(255,255,255,0.45)",
                display: "block",
                marginTop: 6,
              }}
            >
              {downloadManaged
                ? t("settings.downloadManagedHint")
                : t("settings.downloadLocationHint")}
            </Text>
          </div>

          {/* About */}
          <div className="xdx-settings-section">
            <Text className="xdx-settings-label">{t("settings.about")}</Text>
            <Text size="small" style={{ color: "rgba(255,255,255,0.55)", display: "block" }}>
              下点心 TREAT v0.1.0
            </Text>
            <Text size="small" style={{ color: "rgba(255,255,255,0.35)", display: "block", marginTop: 4 }}>
              Sankaku/RT · QUIC + Wirehair FEC
            </Text>
            <Text
              size="small"
              style={{
                color: "rgba(255,255,255,0.3)",
                display: "block",
                marginTop: 10,
                fontSize: 10,
                lineHeight: "15px",
              }}
            >
              {t("settings.fontCredit")}
              {" "}HarmonyOS Sans is a trademark of Huawei Device (Shenzhen) Co., Ltd.
            </Text>
          </div>
        </div>

        <div className="xdx-settings-footer">
          <Button theme="borderless" style={{ color: "rgba(255,255,255,0.5)" }} onClick={onClose}>
            {t("settings.cancel")}
          </Button>
          <Button className="xdx-btn-save" onClick={handleSave}>
            {t("settings.save")}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
