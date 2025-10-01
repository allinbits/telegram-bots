# syntax=docker.io/docker/dockerfile:1.7-labs

FROM node:22-alpine3.22 AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /usr/src/app

COPY pnpm-lock.yaml package.json ./

RUN pnpm install --frozen-lockfile

COPY . .

# Final image
FROM node:22-alpine3.22

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /usr/src/app

COPY pnpm-lock.yaml package.json ./

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /usr/src/app .

RUN pnpm run build

ENV MNEMONIC=""  
ENV RPC_ENDPOINT="https://atomone-rpc.allinbits.com/"
ENV OWNER="jaekwon777"
ENV TG_TOKEN=""

ENTRYPOINT ["node", "dist/index.js" ]