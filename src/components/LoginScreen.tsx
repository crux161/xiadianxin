import React, { useState, useCallback } from "react";
import { Button, Input, Typography, Toast, Avatar } from "@douyinfe/semi-ui";
import { IconCopy } from "@douyinfe/semi-icons";
import { useI18n } from "../i18n/index";
import SankakuBridge, {
  OMIAI_WS_URL_STORAGE_KEY,
  OMIAI_WS_URL_CHANGED_EVENT,
  normalizeServerHostToWsUrl,
} from "../services/SankakuBridge";
import type { OmiaiUser } from "../types/call";

import foxImg from "../../reference/images/kyu-kun/fox.jpg";
import foxOkImg from "../../reference/images/kyu-kun/fox-maru-green-OK.jpeg";
import foxBeachImg from "../../reference/images/kyu-kun/fox-beach.jpeg";
import foxValentineImg from "../../reference/images/kyu-kun/fox-valentines.jpeg";
import kenRedImg from "../../reference/images/ken-chan/koken-CNY-red.jpeg";
import pentaroImg from "../../reference/images/pentaro-san/OIG2.AB3fp4AoIltcenw1pKtq.jpeg";

const { Title, Text } = Typography;

const CONNECTION_TIMEOUT_MS = 5000;

const SIGNUP_AVATARS = [
  { id: "kyu-kun", src: foxImg },
  { id: "kyu-ok", src: foxOkImg },
  { id: "kyu-beach", src: foxBeachImg },
  { id: "kyu-valentine", src: foxValentineImg },
  { id: "ken-chan", src: kenRedImg },
  { id: "pentaro", src: pentaroImg },
];

interface Props {
  callingCode: string;
  rememberedDisplayName?: string;
  rememberedAvatarId?: string;
  rememberedServerHost?: string;
  onAuthenticated: (user: OmiaiUser, token: string) => void;
  onLocalMode?: () => void;
}

const LoginScreen: React.FC<Props> = ({ callingCode, rememberedDisplayName, rememberedAvatarId, rememberedServerHost, onAuthenticated, onLocalMode }) => {
  const { t } = useI18n();
  const bridge = SankakuBridge.getInstance();

  const [mode, setMode] = useState<"login" | "signup">("login");

  // Login fields — pre-fill with remembered identity if available
  const [loginQuicdialId, setLoginQuicdialId] = useState(callingCode || "");
  const [loginPassword, setLoginPassword] = useState("");

  // Server host — pre-fill from persisted identity
  const [serverHost, setServerHost] = useState(rememberedServerHost || "");

  // Signup fields (no quicdial — server generates it)
  const [displayName, setDisplayName] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [avatarId, setAvatarId] = useState("kyu-kun");

  // Post-signup approval state
  const [pendingUser, setPendingUser] = useState<OmiaiUser | null>(null);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  // Granular status message replaces boolean loading
  const [statusMessage, setStatusMessage] = useState("");

  const isLoading = statusMessage !== "";

  // -------------------------------------------------------------------------
  // Apply server host override to bridge before API calls
  // -------------------------------------------------------------------------
  const applyServerHost = useCallback(() => {
    const trimmed = serverHost.trim();
    if (trimmed) {
      const wsUrl = normalizeServerHostToWsUrl(trimmed);
      window.localStorage.setItem(OMIAI_WS_URL_STORAGE_KEY, wsUrl);
    } else {
      window.localStorage.removeItem(OMIAI_WS_URL_STORAGE_KEY);
    }
    window.dispatchEvent(new Event(OMIAI_WS_URL_CHANGED_EVENT));
  }, [serverHost]);

  // -------------------------------------------------------------------------
  // Timeout-wrapped fetch helper
  // -------------------------------------------------------------------------
  const withTimeout = useCallback(<T,>(promise: Promise<T>): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("CONNECTION_TIMEOUT"));
      }, CONNECTION_TIMEOUT_MS);
      promise
        .then((v) => { clearTimeout(timer); resolve(v); })
        .catch((e) => { clearTimeout(timer); reject(e); });
    });
  }, []);

  // -------------------------------------------------------------------------
  // Login
  // -------------------------------------------------------------------------
  const handleLogin = useCallback(async () => {
    if (!loginQuicdialId.trim() || !loginPassword.trim()) {
      Toast.warning({ content: t("auth.fillRequired") });
      return;
    }
    applyServerHost();
    setStatusMessage(t("auth.statusConnecting"));
    try {
      setStatusMessage(t("auth.statusAuthenticating"));
      const result = await withTimeout(
        bridge.login({
          quicdialId: loginQuicdialId.trim(),
          password: loginPassword.trim(),
        }),
      );
      bridge.authToken = result.token;
      setStatusMessage(t("auth.statusConnected"));
      // Auth token is NOT persisted to disk — kept in memory only.
      // Device identity (quicdial_id, display_name, server_host) is persisted by handleAuthenticated.
      onAuthenticated(result.user, result.token);
      Toast.success({ content: t("auth.loginSuccess") });
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "CONNECTION_TIMEOUT") {
        Toast.error({ content: t("auth.connectionTimeout") });
      } else {
        const msg = err instanceof Error ? err.message : "Login failed";
        Toast.error({ content: msg });
      }
    } finally {
      setStatusMessage("");
    }
  }, [bridge, loginQuicdialId, loginPassword, serverHost, onAuthenticated, t, applyServerHost, withTimeout]);

  // -------------------------------------------------------------------------
  // Signup — server auto-generates quicdial code
  // -------------------------------------------------------------------------
  const handleSignup = useCallback(async () => {
    if (!displayName.trim() || !signupPassword.trim()) {
      Toast.warning({ content: t("auth.fillRequired") });
      return;
    }
    if (signupPassword !== confirmPassword) {
      Toast.warning({ content: t("auth.passwordMismatch") });
      return;
    }
    if (signupPassword.length < 6) {
      Toast.warning({ content: t("auth.passwordTooShort") });
      return;
    }
    applyServerHost();
    setStatusMessage(t("auth.statusConnecting"));
    try {
      setStatusMessage(t("auth.statusAuthenticating"));
      const result = await withTimeout(
        bridge.signup({
          quicdialId: "", // empty → server generates
          displayName: displayName.trim(),
          password: signupPassword.trim(),
          avatarId,
        }),
      );
      // Don't finalise yet — show the assigned code for user approval
      setPendingUser(result.user);
      setPendingToken(result.token);
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "CONNECTION_TIMEOUT") {
        Toast.error({ content: t("auth.connectionTimeout") });
      } else {
        const msg = err instanceof Error ? err.message : "Signup failed";
        Toast.error({ content: msg });
      }
    } finally {
      setStatusMessage("");
    }
  }, [bridge, displayName, signupPassword, confirmPassword, avatarId, serverHost, t, applyServerHost, withTimeout]);

  // -------------------------------------------------------------------------
  // Code approval — user confirms and enters the app
  // -------------------------------------------------------------------------
  const handleApproveCode = useCallback(() => {
    if (!pendingUser || !pendingToken) return;
    bridge.authToken = pendingToken;
    onAuthenticated(pendingUser, pendingToken);
    Toast.success({ content: t("auth.signupSuccess") });
  }, [bridge, pendingUser, pendingToken, onAuthenticated, t]);

  const handleCopyCode = useCallback(() => {
    if (!pendingUser) return;
    navigator.clipboard.writeText(pendingUser.quicdialId).then(() => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }).catch(() => {});
  }, [pendingUser]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (mode === "login") void handleLogin();
      else void handleSignup();
    }
  };

  // -----------------------------------------------------------------------
  // Render: Code Approval Screen (after signup)
  // -----------------------------------------------------------------------
  if (pendingUser && pendingToken) {
    return (
      <div className="xdx-login-screen">
        <div className="xdx-login-card">
          <div className="xdx-login-header">
            <Title heading={3} style={{ color: "#fff", margin: 0 }}>
              {t("auth.welcomeTitle")}
            </Title>
            <Text
              size="small"
              style={{ color: "rgba(255,255,255,0.5)", marginTop: 4 }}
            >
              {t("auth.welcomeSubtitle")}
            </Text>
          </div>

          <div className="xdx-code-reveal">
            <Text
              size="small"
              style={{ color: "rgba(255,255,255,0.55)", marginBottom: 8, display: "block" }}
            >
              {t("auth.yourAssignedCode")}
            </Text>
            <div className="xdx-code-reveal-code">
              <span className="xdx-code-reveal-digits">
                {pendingUser.quicdialId}
              </span>
              <button
                className="xdx-code-copy-btn"
                onClick={handleCopyCode}
                title={codeCopied ? t("idle.copied") : t("idle.copyCode")}
              >
                <IconCopy size="small" />
                <span>{codeCopied ? t("idle.copied") : t("idle.copyCode")}</span>
              </button>
            </div>
            <Text
              size="small"
              style={{ color: "rgba(255,255,255,0.35)", marginTop: 10, display: "block" }}
            >
              {t("auth.codeHint")}
            </Text>
          </div>

          <div className="xdx-code-reveal-user">
            <Avatar
              size="default"
              src={SIGNUP_AVATARS.find((a) => a.id === pendingUser.avatarId)?.src}
              style={{
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              }}
            >
              {pendingUser.displayName.charAt(0)}
            </Avatar>
            <Text style={{ color: "#fff", marginLeft: 10 }}>
              {pendingUser.displayName}
            </Text>
          </div>

          <Button
            className="xdx-btn-save xdx-login-submit"
            onClick={handleApproveCode}
            block
          >
            {t("auth.continueBtn")}
          </Button>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render: Login / Signup form
  // -----------------------------------------------------------------------
  return (
    <div className="xdx-login-screen">
      <div className="xdx-login-card">
        <div className="xdx-login-header">
          {rememberedDisplayName ? (
            <>
              <Avatar
                size="default"
                src={rememberedAvatarId
                  ? SIGNUP_AVATARS.find((a) => a.id === rememberedAvatarId)?.src
                  : undefined}
                style={{
                  background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                  marginBottom: 8,
                }}
              >
                {rememberedDisplayName.charAt(0)}
              </Avatar>
              <Title heading={4} style={{ color: "#fff", margin: 0 }}>
                {rememberedDisplayName}
              </Title>
              <Text
                size="small"
                style={{ color: "rgba(255,255,255,0.5)", marginTop: 4 }}
              >
                {callingCode || t("app.subtitle")}
              </Text>
            </>
          ) : (
            <>
              <Title heading={3} style={{ color: "#fff", margin: 0 }}>
                TREAT
              </Title>
              <Text
                size="small"
                style={{ color: "rgba(255,255,255,0.5)", marginTop: 4 }}
              >
                {t("app.nameCn")} · {t("app.subtitle")}
              </Text>
            </>
          )}
        </div>

        <div className="xdx-login-tabs">
          <button
            className={`xdx-login-tab ${mode === "login" ? "active" : ""}`}
            onClick={() => setMode("login")}
          >
            {t("auth.login")}
          </button>
          <button
            className={`xdx-login-tab ${mode === "signup" ? "active" : ""}`}
            onClick={() => setMode("signup")}
          >
            {t("auth.signup")}
          </button>
        </div>

        <div className="xdx-login-form" onKeyDown={handleKeyDown}>
          {/* ---- LOGIN MODE ---- */}
          {mode === "login" && (
            <>
              <label className="xdx-login-label">{t("auth.quicdialId")}</label>
              <Input
                value={loginQuicdialId}
                onChange={(v) => setLoginQuicdialId(v)}
                placeholder="###-###-###"
                className="xdx-login-input"
              />

              <label className="xdx-login-label">{t("auth.password")}</label>
              <Input
                value={loginPassword}
                onChange={(v) => setLoginPassword(v)}
                type="password"
                mode="password"
                placeholder="••••••••"
                className="xdx-login-input"
              />
            </>
          )}

          {/* ---- SIGNUP MODE (no quicdial field — server generates) ---- */}
          {mode === "signup" && (
            <>
              <label className="xdx-login-label">{t("auth.displayName")}</label>
              <Input
                value={displayName}
                onChange={(v) => setDisplayName(v)}
                placeholder={t("auth.displayNamePlaceholder")}
                className="xdx-login-input"
              />

              <label className="xdx-login-label">{t("auth.password")}</label>
              <Input
                value={signupPassword}
                onChange={(v) => setSignupPassword(v)}
                type="password"
                mode="password"
                placeholder="••••••••"
                className="xdx-login-input"
              />

              <label className="xdx-login-label">{t("auth.confirmPassword")}</label>
              <Input
                value={confirmPassword}
                onChange={(v) => setConfirmPassword(v)}
                type="password"
                mode="password"
                placeholder="••••••••"
                className="xdx-login-input"
              />

              <label className="xdx-login-label">{t("auth.chooseAvatar")}</label>
              <div className="xdx-login-avatar-grid">
                {SIGNUP_AVATARS.map((a) => (
                  <button
                    key={a.id}
                    className={`xdx-login-avatar-btn ${avatarId === a.id ? "selected" : ""}`}
                    onClick={() => setAvatarId(a.id)}
                    type="button"
                  >
                    <Avatar size="small" src={a.src} />
                  </button>
                ))}
              </div>

              <Text
                size="small"
                style={{ color: "rgba(255,255,255,0.35)", marginTop: 4, display: "block" }}
              >
                {t("auth.autoCodeHint")}
              </Text>
            </>
          )}

          {/* ---- SERVER HOST (shared between login & signup) ---- */}
          <label className="xdx-login-label" style={{ marginTop: 12 }}>
            {t("auth.serverHost")}
          </label>
          <Input
            value={serverHost}
            onChange={(v) => setServerHost(v)}
            placeholder={t("auth.serverHostPlaceholder")}
            className="xdx-login-input"
            size="small"
          />

          <Button
            className="xdx-btn-save xdx-login-submit"
            loading={isLoading}
            onClick={mode === "login" ? handleLogin : handleSignup}
            block
          >
            {statusMessage || (mode === "login" ? t("auth.loginBtn") : t("auth.signupBtn"))}
          </Button>
        </div>

        <Text
          size="small"
          style={{ color: "rgba(255,255,255,0.3)", marginTop: 16, textAlign: "center", display: "block" }}
        >
          {t("auth.hint")}
        </Text>

        {onLocalMode && (
          <button
            className="xdx-local-mode-btn"
            onClick={onLocalMode}
            type="button"
          >
            {t("auth.localMode")}
          </button>
        )}
      </div>
    </div>
  );
};

export default LoginScreen;
