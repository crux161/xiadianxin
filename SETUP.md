# XiaDianxin — Setup & Development Guide

## 1. Environment Setup

### macOS

```bash
# Xcode tools (if not already installed)
xcode-select --install

# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup update stable

# Node.js (via Homebrew or nvm)
brew install node
# -- or --
nvm install 18 && nvm use 18
```

### Linux (Debian/Ubuntu)

```bash
sudo apt update && sudo apt install -y \
  libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev

curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### Windows

1. Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the "Desktop development with C++" workload.
2. Install Rust via [rustup-init.exe](https://rustup.rs/).
3. Install [Node.js LTS](https://nodejs.org/).
4. Install [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (usually preinstalled on Windows 11).

## 2. Install Dependencies

```bash
cd /Volumes/DevWorkspace/Basil/xiadianxin
npm install
```

This installs:
- `@douyinfe/semi-ui` + `@douyinfe/semi-icons` — ByteDance Semi Design
- `@tauri-apps/api` — Tauri v2 frontend API
- `@tauri-apps/cli` — Tauri dev/build CLI
- `phoenix` — Omiai websocket client for `resolve_quicdial`
- `qrcode.react` + `jsqr` — Quicdial QR code generation and scanning
- React 18, TypeScript 5, Vite 6

## 3. Development

```bash
# Start the full Tauri dev environment (Vite HMR + native window)
npm run tauri dev

# Or run just the Vite frontend (browser-only, IPC calls will fail)
npm run dev
```

### What to Expect

1. A native window opens: **虾点心 · XiaDianxin**
2. The sidebar shows discovered peers from mDNS.
3. The DialPad is shown by default in the main panel when no chat/call is selected.
4. The dial input is keypad-only and suppresses iOS native keyboard.
5. Settings shows your Quicdial QR and DialPad can scan QR via camera or image import.
6. Outbound dial attempts resolve Quicdial code via Omiai before direct connect handoff.

### Hot Module Replacement

Vite provides HMR for the React frontend. Edit `.tsx`/`.css` files and changes reflect instantly. Rust changes require a re-compile (Tauri handles this automatically in dev mode, but it takes a few seconds).

## 4. Production Build

```bash
npm run tauri build
```

Output locations:
- **macOS**: `src-tauri/target/release/bundle/dmg/` and `macos/`
- **Windows**: `src-tauri/target/release/bundle/msi/` and `nsis/`
- **Linux**: `src-tauri/target/release/bundle/deb/` and `appimage/`

## 5. Project Structure

```
XiaDianxin/
├── src-tauri/
│   ├── Cargo.toml              # Rust dependencies
│   ├── tauri.conf.json         # Tauri v2 configuration
│   ├── capabilities/
│   │   └── default.json        # Window permissions
│   └── src/
│       ├── main.rs             # Desktop entry point
│       └── lib.rs              # ★ IPC commands + incoming-call sim
├── src/
│   ├── main.tsx                # React root mount
│   ├── App.tsx                 # ★ Super-app shell & state machine
│   ├── App.css                 # ★ Full theme (HarmonyOS Sans, gradients, tallies)
│   ├── vite-env.d.ts
│   ├── types/
│   │   └── call.ts             # Shared TypeScript type definitions
│   ├── services/
│   │   └── SankakuBridge.ts    # ★ IPC + Omiai bridge (resolve_quicdial + direct dial handoff)
│   └── components/
│       ├── DialPad.tsx         # ★ Default dialer view + Quicdial QR scan/import
│       ├── SettingsPanel.tsx   # ★ Profile + Quicdial QR generation
│       └── CallView.tsx        # ★ Video grid, tally lights, voicemail
├── reference/
│   ├── sankaku/                # Sankaku/RT source (DO NOT MODIFY)
│   ├── HarmonyOS-Sans/         # Font files
│   └── images/                 # Mascot artwork
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── README.md
└── SETUP.md                    # This file
```

## 6. Wiring Real Sankaku/RT

When you're ready to replace the stubs:

### Cargo.toml

```toml
[dependencies]
sankaku-core = { path = "../reference/sankaku/sankaku-core" }
# or from a git remote:
# sankaku-core = { git = "https://...", branch = "main" }
```

### lib.rs — start_call

```rust
// Replace the stub body with:
let endpoint = quinn::Endpoint::client(/* ... */)?;
let connection = endpoint.connect(peer_addr, "sankaku")?.await?;
let stream = sankaku_core::SankakuStream::connect(connection).await?;
// Store `stream` in AppState, spawn recv loop, emit frames to frontend
```

### Frontend — Video Rendering

The `remoteVideoRef` and `localVideoRef` in `CallView.tsx` are `<video>` elements ready for a `MediaStream`. Alternatively, switch to `<canvas>` and blit decoded RGBA frames received over the IPC bridge.

## 7. Omiai Endpoint Override

On app startup, the bridge first scans local network mDNS for `_omiai._tcp`
and auto-connects to the resolved websocket endpoint.

If discovery fails, it falls back to `ws://localhost:4000/ws/sankaku/websocket`.
If iOS blocks mDNS socket bind with a local-network permission error, discovery
now degrades safely (no app crash) and continues to override/fallback URL logic.

To force a specific Omiai host:

```bash
VITE_OMIAI_WS_URL=ws://127.0.0.1:4000/ws/sankaku npm run dev
```

You can also set it inside the app:
- Open Settings
- Edit **Custom Signaling Server (Dev)**
- Save settings

This persists `OMIAI_WS_URL` in localStorage (default: `ws://localhost:4000/ws/sankaku/websocket`) and forces a signaling reconnect.
