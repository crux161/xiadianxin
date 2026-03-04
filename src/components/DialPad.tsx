import React, { useState, useCallback } from "react";
import { Typography, Toast } from "@douyinfe/semi-ui";
import { IconCamera, IconMicrophone } from "@douyinfe/semi-icons";
import { useI18n } from "../i18n/index";
import SankakuBridge from "../services/SankakuBridge";
import type { CallResult } from "../types/call";

const { Title, Text } = Typography;

interface Props {
  callingCode: string;
  onCallStarted: (result: CallResult, audioOnly: boolean) => void;
}

function formatDialInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 9);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function isValidCode(code: string): boolean {
  return /^\d{3}-\d{3}-\d{3}$/.test(code);
}

const DialPad: React.FC<Props> = ({ callingCode, onCallStarted }) => {
  const { t } = useI18n();
  const [input, setInput] = useState("");
  const [codeCopied, setCodeCopied] = useState(false);

  const formatted = formatDialInput(input);
  const valid = isValidCode(formatted);

  const handleDial = useCallback(
    async (audioOnly: boolean) => {
      if (!valid) {
        Toast.warning({ content: t("dialpad.invalidCode") });
        return;
      }
      try {
        const result = await SankakuBridge.getInstance().dialCode(formatted, audioOnly);
        if (result.success) {
          onCallStarted(result, audioOnly);
          setInput("");
        } else {
          Toast.warning({ content: result.message });
        }
      } catch (err) {
        Toast.error({ content: `${t("toast.callFailed")}: ${err}` });
      }
    },
    [formatted, valid, t, onCallStarted],
  );

  const handleCopy = () => {
    navigator.clipboard.writeText(callingCode);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && valid) handleDial(false);
  };

  return (
    <div className="xdx-dialpad">
      {/* Own calling code */}
      <div className="xdx-own-code">
        <Text size="small" style={{ color: "rgba(255,255,255,0.4)" }}>
          {t("idle.yourCode")}
        </Text>
        <div className="xdx-own-code-row">
          <span className="xdx-own-code-value">{callingCode}</span>
          <button className="xdx-code-copy-sm" onClick={handleCopy}>
            {codeCopied ? "✓" : t("idle.copyCode")}
          </button>
        </div>
      </div>

      {/* Dial input */}
      <div className="xdx-dial-input-wrap">
        <input
          className="xdx-dial-input"
          type="text"
          inputMode="numeric"
          placeholder={t("dialpad.placeholder")}
          value={formatted}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={11}
        />
      </div>

      {/* Call buttons */}
      <div className="xdx-dial-actions">
        <button
          className={`xdx-dial-btn xdx-dial-video ${!valid ? "disabled" : ""}`}
          onClick={() => handleDial(false)}
          disabled={!valid}
        >
          <IconCamera size="large" />
          <span>{t("dialpad.callVideo")}</span>
        </button>
        <button
          className={`xdx-dial-btn xdx-dial-audio ${!valid ? "disabled" : ""}`}
          onClick={() => handleDial(true)}
          disabled={!valid}
        >
          <IconMicrophone size="large" />
          <span>{t("dialpad.callAudio")}</span>
        </button>
      </div>

      {/* Keypad grid */}
      <div className="xdx-keypad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((key) => (
          <button
            key={key || "blank"}
            className={`xdx-key ${key === "" ? "blank" : ""} ${key === "⌫" ? "backspace" : ""}`}
            disabled={key === ""}
            onClick={() => {
              if (key === "⌫") {
                setInput((v) => v.slice(0, -1));
              } else if (key !== "") {
                setInput((v) => {
                  const digits = v.replace(/\D/g, "");
                  return digits.length < 9 ? v + key : v;
                });
              }
            }}
          >
            {key}
          </button>
        ))}
      </div>
    </div>
  );
};

export default DialPad;
