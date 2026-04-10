# CogOS Desktop

Native macOS application for CogOS. Wraps the kernel dashboard in a native window with integrated terminal, service management, and live kernel status monitoring.

Built with [Wails](https://wails.io/) — Go backend, React/TypeScript frontend, native WebView (no Electron).

## What It Does

- Starts the CogOS kernel as a background process
- Displays the embedded dashboard in a native macOS window
- Provides an integrated terminal with real PTY sessions
- Manages the kernel via launchctl (start, stop, restart, enable at boot)
- Reads port and workspace configuration from `.cog/config/kernel.yaml` — no hardcoded ports

## Architecture

```
CogOS.app (native macOS)
├── Go backend
│   ├── Kernel lifecycle (start/stop/health)
│   ├── Terminal manager (PTY sessions)
│   ├── Service control (launchctl)
│   └── Config discovery (.cog/config/)
├── React frontend
│   ├── Plugin system (extensible views)
│   ├── Dashboard (kernel health, status)
│   └── Terminal (integrated shell)
└── WebView (native, not Electron)
```

The desktop app reads the kernel port from `$WORKSPACE/.cog/config/kernel.yaml`. No port is hardcoded. If no config exists, it falls back to 6931.

## Prerequisites

- [Wails](https://wails.io/docs/gettingstarted/installation) v2
- Go 1.24+
- Node.js 18+

## Development

```sh
# Live development with hot reload
wails dev

# Build production macOS app
wails build
```

## Connection to CogOS

This is the Tier 2 deployment model:

| Tier | How it works |
|------|-------------|
| Tier 1 — Developer | `cogos serve` in terminal |
| **Tier 2 — User** | **Double-click CogOS.app** |
| Tier 3 — Production | `helm install` via cogos-dev/charts |

Same kernel, same dashboard, same API — different packaging.

## License

MIT
