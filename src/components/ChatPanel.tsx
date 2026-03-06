import React, { useState, useRef, useEffect } from "react";
import { Typography } from "@douyinfe/semi-ui";
import { IconClose, IconImage, IconUpload } from "@douyinfe/semi-icons";
import { useI18n } from "../i18n/index";
import type { ChatMessage, FileTransferProgress } from "../types/call";

import foxDefault from "../../reference/images/kyu-kun/fox.jpg";
import foxOk from "../../reference/images/kyu-kun/fox-maru-green-OK.jpeg";
import foxSleeping from "../../reference/images/kyu-kun/fox-sleeping.jpeg";
import foxCelebrate from "../../reference/images/kyu-kun/fox-celebrate-recovery.jpeg";
import foxBatsu from "../../reference/images/kyu-kun/fox-batsu-X.jpeg";
import foxValentine from "../../reference/images/kyu-kun/fox-valentines.jpeg";
import foxBirthday from "../../reference/images/kyu-kun/fox-birthday.jpeg";
import foxHanabi from "../../reference/images/kyu-kun/fox-hanabi-summer.jpeg";
import foxHanami from "../../reference/images/kyu-kun/fox-hanami.jpeg";
import foxLunar from "../../reference/images/kyu-kun/fox-lunar-new-year.jpeg";
import foxEaster from "../../reference/images/kyu-kun/fox-easter.jpeg";
import foxWater from "../../reference/images/kyu-kun/fox-water.jpeg";
import kenRed from "../../reference/images/ken-chan/koken-CNY-red.jpeg";
import kenRed2 from "../../reference/images/ken-chan/koken-CNY-red-2.jpeg";
import pentaro from "../../reference/images/pentaro-san/OIG2.AB3fp4AoIltcenw1pKtq.jpeg";
import pentaro2 from "../../reference/images/pentaro-san/OIG2.Pf7UKiaLAR_Vi97TVPr_.jpeg";
import izakaya from "../../reference/images/izakaya/OIG1.926SucZQi9p5mEil9SD4.jpeg";
import izakaya2 from "../../reference/images/izakaya/OIG2.x4B3R2gC_OBoI6MSfCAT.jpeg";

const { Text } = Typography;

const STICKERS: { id: string; src: string; label: string }[] = [
  { id: "fox", src: foxDefault, label: "Fox" },
  { id: "fox-ok", src: foxOk, label: "OK!" },
  { id: "fox-sleeping", src: foxSleeping, label: "Zzz" },
  { id: "fox-celebrate", src: foxCelebrate, label: "Yay!" },
  { id: "fox-batsu", src: foxBatsu, label: "No" },
  { id: "fox-valentine", src: foxValentine, label: "Love" },
  { id: "fox-birthday", src: foxBirthday, label: "Party" },
  { id: "fox-hanabi", src: foxHanabi, label: "Summer" },
  { id: "fox-hanami", src: foxHanami, label: "Hanami" },
  { id: "fox-lunar", src: foxLunar, label: "Lunar" },
  { id: "fox-easter", src: foxEaster, label: "Easter" },
  { id: "fox-water", src: foxWater, label: "Water" },
  { id: "ken-red", src: kenRed, label: "Ken" },
  { id: "ken-red-2", src: kenRed2, label: "Ken 2" },
  { id: "pentaro", src: pentaro, label: "Pentaro" },
  { id: "pentaro-2", src: pentaro2, label: "Pentaro 2" },
  { id: "izakaya", src: izakaya, label: "Izakaya" },
  { id: "izakaya-2", src: izakaya2, label: "Izakaya 2" },
];

export const STICKER_MAP: Record<string, string> = Object.fromEntries(
  STICKERS.map((s) => [s.id, s.src]),
);

interface Props {
  messages: ChatMessage[];
  onSendText: (text: string) => void;
  onSendSticker: (stickerId: string) => void;
  onSendFile?: (file: File) => void;
  onAcceptFile?: (fileId: string) => void;
  onRejectFile?: (fileId: string) => void;
  fileTransfers?: Map<string, FileTransferProgress>;
  onClose: () => void;
  remoteTyping?: string | null;
  onTyping?: () => void;
}

const ChatPanel: React.FC<Props> = ({
  messages,
  onSendText,
  onSendSticker,
  onSendFile,
  onAcceptFile,
  onRejectFile,
  fileTransfers,
  onClose,
  remoteTyping,
  onTyping,
}) => {
  const { t } = useI18n();
  const [input, setInput] = useState("");
  const [showStickers, setShowStickers] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    onSendText(text);
    setInput("");
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="xdx-chat-panel">
      <div className="xdx-chat-header">
        <Text strong style={{ color: "#fff" }}>
          {t("chat.title")}
        </Text>
        <button className="xdx-chat-close" onClick={onClose}>
          <IconClose size="small" />
        </button>
      </div>

      <div className="xdx-chat-messages">
        {messages.length === 0 && (
          <div className="xdx-chat-empty">
            <Text size="small" style={{ color: "rgba(255,255,255,0.3)" }}>
              {t("chat.noMessages")}
            </Text>
          </div>
        )}
        {messages.map((msg) => {
          const fileId = msg.id.startsWith("file-offer-")
            ? msg.id.replace("file-offer-", "")
            : null;
          const transfer = fileId ? fileTransfers?.get(fileId) : null;

          return (
            <div
              key={msg.id}
              className={`xdx-chat-msg ${msg.from === "local" ? "local" : "remote"}`}
            >
              {msg.sticker ? (
                <img
                  src={STICKER_MAP[msg.sticker] ?? foxDefault}
                  alt={msg.sticker}
                  className="xdx-chat-sticker"
                  draggable={false}
                />
              ) : msg.fileName && transfer ? (
                <div className="xdx-chat-file">
                  <div className="xdx-chat-file-icon">📎</div>
                  <div className="xdx-chat-file-info">
                    <div className="xdx-chat-file-name">{msg.fileName}</div>
                    {transfer.status === "offering" &&
                      transfer.direction === "receive" && (
                        <div className="xdx-file-actions">
                          <button
                            className="xdx-file-action-btn accept"
                            onClick={() => onAcceptFile?.(transfer.fileId)}
                          >
                            {t("chat.accept")}
                          </button>
                          <button
                            className="xdx-file-action-btn reject"
                            onClick={() => onRejectFile?.(transfer.fileId)}
                          >
                            {t("chat.reject")}
                          </button>
                        </div>
                      )}
                    {transfer.status === "transferring" && (
                      <div className="xdx-file-progress-bar">
                        <div
                          className="xdx-file-progress-fill"
                          style={{
                            width: `${Math.min(
                              100,
                              transfer.totalSize > 0
                                ? (transfer.received / transfer.totalSize) *
                                    100
                                : 0,
                            )}%`,
                          }}
                        />
                      </div>
                    )}
                    {transfer.status === "complete" && (
                      <Text
                        size="small"
                        style={{ color: "#00c853", fontSize: 10 }}
                      >
                        ✓ {t("chat.fileReceived")}
                      </Text>
                    )}
                    {transfer.status === "rejected" && (
                      <Text
                        size="small"
                        style={{ color: "#ff4757", fontSize: 10 }}
                      >
                        {t("chat.reject")}
                      </Text>
                    )}
                  </div>
                </div>
              ) : (
                <div className="xdx-chat-bubble xdx-chat-bubble-pill">
                  <Text size="small" style={{ color: "#fff" }}>
                    {msg.text}
                  </Text>
                </div>
              )}
              <Text
                size="small"
                className="xdx-chat-time"
                style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}
              >
                {new Date(msg.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
            </div>
          );
        })}
        {remoteTyping && (
          <div className="xdx-chat-typing">
            <span className="xdx-typing-dots">
              <span /><span /><span />
            </span>
            <Text size="small" style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>
              {remoteTyping}
            </Text>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {showStickers && (
        <div className="xdx-sticker-picker">
          {STICKERS.map((s) => (
            <button
              key={s.id}
              className="xdx-sticker-btn"
              onClick={() => {
                onSendSticker(s.id);
                setShowStickers(false);
              }}
              title={s.label}
            >
              <img src={s.src} alt={s.label} draggable={false} />
            </button>
          ))}
        </div>
      )}

      <div className="xdx-chat-input-bar">
        <button
          className={`xdx-sticker-toggle ${showStickers ? "active" : ""}`}
          onClick={() => setShowStickers(!showStickers)}
        >
          <IconImage size="small" />
        </button>
        {onSendFile && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onSendFile(file);
                e.target.value = "";
              }}
            />
            <button
              className="xdx-sticker-toggle"
              onClick={() => fileInputRef.current?.click()}
              title={t("chat.sendFile")}
            >
              <IconUpload size="small" />
            </button>
          </>
        )}
        <input
          className="xdx-chat-input"
          placeholder={t("chat.placeholder")}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            if (e.target.value.length > 0) onTyping?.();
          }}
          onKeyDown={handleKey}
        />
        <button
          className="xdx-chat-send"
          onClick={handleSend}
          disabled={!input.trim()}
        >
          {t("chat.send")}
        </button>
      </div>
    </div>
  );
};

export default ChatPanel;
