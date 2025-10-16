## Telegram Bots

A minimal monorepo for Telegram bots managed with pnpm workspaces. It currently includes:

- `packages/bounty-bot`: Bounty management bot backed by a local SQLite database
- `packages/channel-bot`: Channel utility bot

The project is written in TypeScript and ships runnable Docker images for local development and deployment.

---

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker (optional, for containerized runs)

---

### Install

From the repo root:

```bash
pnpm install
```

This installs dependencies for the root and all workspaces under `packages/`.

### Contributing

1. Fork the repo and create a branch
2. Make changes with clear commits
3. Ensure typecheck, lint, and builds pass
4. Open a pull request
