FROM node:22-alpine3.22 AS build

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /usr/src/app

COPY . /usr/src/app

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

RUN pnpm run -r build
RUN pnpm deploy --filter=@allinbits/bounty-bot --prod /prod/bounty-bot
RUN pnpm deploy --filter=@allinbits/channel-bot --prod /prod/channel-bot


# BountyBot
FROM build AS bountybot
WORKDIR /app
COPY --from=build /prod/bounty-bot /app
ENV MNEMONIC=""
ENV RPC_ENDPOINT="https://atomone-rpc.allinbits.com/"
ENV OWNERS=""
ENV TG_TOKEN=""
ENTRYPOINT ["node", "dist/index.js"]

# ChannelBot
FROM build AS channelbot
WORKDIR /app
COPY --from=build /prod/channel-bot /app
ENV TG_TOKEN=""
ENV OWNERS=""
ENTRYPOINT ["node", "dist/index.js"]