# syntax=docker.io/docker/dockerfile:1.7-labs

FROM node:22-alpine3.22 AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /usr/src/app

COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY packages/bounty-bot/package.json packages/bounty-bot/package.json
COPY packages/bounty-bot/tsconfig.json packages/bounty-bot/tsconfig.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter @allinbits/bounty-bot run build

# Final image
FROM node:22-alpine3.22

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /usr/src/app

COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY packages/bounty-bot/package.json packages/bounty-bot/package.json

RUN pnpm install --frozen-lockfile --prod --filter @allinbits/bounty-bot...

COPY --from=builder /usr/src/app/packages/bounty-bot/dist ./packages/bounty-bot/dist

ENV MNEMONIC=""  
ENV RPC_ENDPOINT="https://atomone-rpc.allinbits.com/"
ENV OWNER="jaekwon777"
ENV TG_TOKEN=""

ENTRYPOINT ["node", "packages/bounty-bot/dist/index.js" ]