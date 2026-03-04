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
cd /Volumes/DevWorkspace/Saffron/XiaDianxin
npm install
```

This installs:
- `@douyinfe/semi-ui` + `@douyinfe/semi-icons` — ByteDance Semi Design
- `@tauri-apps/api` — Tauri v2 frontend API
- `@tauri-apps/cli` — Tauri dev/build CLI
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
2. The sidebar shows 4 simulated contacts (mDNS-discovered stubs).
3. **After 5 seconds**, an incoming-call modal rings with pulse animation.
4. **Accept (video)** → transitions to the Webex-style call view with tally lights.
5. **Accept (audio)** → transitions to audio-only call view.
6. **Decline** → transitions to voicemail/recording UI.
7. Use the sidebar call icons to initiate outbound calls to any online peer.

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
│   │   └── SankakuBridge.ts    # ★ IPC bridge (invoke + listen)
│   └── components/
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
