import React, { useState, useCallback, useEffect, useRef } from "react";
import { Typography, Toast } from "@douyinfe/semi-ui";
import { IconCamera, IconMicrophone, IconUpload } from "@douyinfe/semi-icons";
import jsQR from "jsqr";
import { useI18n } from "../i18n/index";
import SankakuBridge from "../services/SankakuBridge";
import type { CallResult } from "../types/call";

const { Text } = Typography;

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
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanMode, setScanMode] = useState<"camera" | "image">("camera");
  const [scanError, setScanError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const hiddenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

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

  const stopCamera = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraReady(false);
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const parseScannedDialCode = useCallback((raw: string): string | null => {
    const normalized = raw.trim();
    if (!normalized) {
      return null;
    }
    const exact = formatDialInput(normalized);
    if (isValidCode(exact)) {
      return exact;
    }
    const match = normalized.match(/(\d{3})[-\s]?(\d{3})[-\s]?(\d{3})/);
    if (!match) {
      return null;
    }
    const candidate = `${match[1]}-${match[2]}-${match[3]}`;
    return isValidCode(candidate) ? candidate : null;
  }, []);

  const applyScannedCode = useCallback(
    (raw: string): boolean => {
      const parsed = parseScannedDialCode(raw);
      if (!parsed) {
        return false;
      }
      setInput(parsed.replace(/\D/g, ""));
      setScannerOpen(false);
      stopCamera();
      Toast.success({ content: t("dialpad.scanSuccess") });
      return true;
    },
    [parseScannedDialCode, stopCamera, t],
  );

  const decodeImageElement = useCallback(
    (image: CanvasImageSource): boolean => {
      if (!hiddenCanvasRef.current) {
        hiddenCanvasRef.current = document.createElement("canvas");
      }
      const canvas = hiddenCanvasRef.current;
      let width = 0;
      let height = 0;
      if (image instanceof HTMLVideoElement) {
        width = image.videoWidth;
        height = image.videoHeight;
      } else if (image instanceof HTMLImageElement) {
        width = image.naturalWidth || image.width;
        height = image.naturalHeight || image.height;
      } else if (image instanceof HTMLCanvasElement) {
        width = image.width;
        height = image.height;
      }
      if (!width || !height) {
        return false;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        return false;
      }
      ctx.drawImage(image, 0, 0, width, height);
      const frame = ctx.getImageData(0, 0, width, height);
      const decoded = jsQR(frame.data, frame.width, frame.height);
      if (!decoded?.data) {
        return false;
      }
      return applyScannedCode(decoded.data);
    },
    [applyScannedCode],
  );

  const startCameraScan = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setScanError(t("dialpad.scanCameraUnsupported"));
      return;
    }
    stopCamera();
    setScanError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraReady(true);
    } catch (err) {
      setScanError(String(err));
      stopCamera();
    }
  }, [stopCamera, t]);

  useEffect(() => {
    if (!scannerOpen || scanMode !== "camera") {
      stopCamera();
      return;
    }
    void startCameraScan();
    return () => stopCamera();
  }, [scannerOpen, scanMode, startCameraScan, stopCamera]);

  useEffect(() => {
    if (!scannerOpen || scanMode !== "camera" || !cameraReady) {
      return;
    }
    const scanFrame = () => {
      if (videoRef.current) {
        decodeImageElement(videoRef.current);
      }
      rafRef.current = requestAnimationFrame(scanFrame);
    };
    rafRef.current = requestAnimationFrame(scanFrame);
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [cameraReady, decodeImageElement, scanMode, scannerOpen]);

  const handleImageFileSelected = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) {
        return;
      }
      setScanError(null);
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        const resolved = decodeImageElement(image);
        URL.revokeObjectURL(objectUrl);
        if (!resolved) {
          setScanError(t("dialpad.scanNotFound"));
        }
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        setScanError(t("dialpad.scanImageFailed"));
      };
      image.src = objectUrl;
    },
    [decodeImageElement, t],
  );

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
          inputMode="none"
          readOnly={true}
          placeholder={t("dialpad.placeholder")}
          value={formatted}
          onKeyDown={handleKeyDown}
          maxLength={11}
        />
      </div>

      <div className="xdx-dial-qr-row">
        <button
          className={`xdx-dial-qr-toggle ${scannerOpen ? "active" : ""}`}
          onClick={() => {
            setScannerOpen((v) => !v);
            setScanMode("camera");
            setScanError(null);
          }}
        >
          {t("dialpad.scanQr")}
        </button>
      </div>

      {scannerOpen && (
        <div className="xdx-dial-scan-panel">
          <div className="xdx-dial-scan-mode">
            <button
              className={`xdx-dial-scan-mode-btn ${scanMode === "camera" ? "active" : ""}`}
              onClick={() => {
                setScanMode("camera");
                setScanError(null);
              }}
            >
              <IconCamera />
              <span>{t("dialpad.scanCamera")}</span>
            </button>
            <button
              className={`xdx-dial-scan-mode-btn ${scanMode === "image" ? "active" : ""}`}
              onClick={() => {
                setScanMode("image");
                setScanError(null);
                stopCamera();
              }}
            >
              <IconUpload />
              <span>{t("dialpad.scanImage")}</span>
            </button>
          </div>
          {scanMode === "camera" ? (
            <div className="xdx-dial-camera-wrap">
              <video
                ref={videoRef}
                className="xdx-dial-camera-preview"
                playsInline
                muted
                autoPlay
              />
              <Text size="small" className="xdx-dial-scan-hint">
                {t("dialpad.scanCameraHint")}
              </Text>
              {!cameraReady && (
                <button
                  className="xdx-dial-scan-image-btn"
                  onClick={() => void startCameraScan()}
                >
                  {t("dialpad.scanRetry")}
                </button>
              )}
            </div>
          ) : (
            <div className="xdx-dial-image-wrap">
              <button
                className="xdx-dial-scan-image-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                {t("dialpad.scanImagePick")}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageFileSelected}
                style={{ display: "none" }}
              />
            </div>
          )}
          {scanError && (
            <Text size="small" className="xdx-dial-scan-error">
              {scanError}
            </Text>
          )}
        </div>
      )}

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
