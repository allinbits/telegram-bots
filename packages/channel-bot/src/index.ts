import {
  ChannelBot,
} from "./ChannelBot.ts";

async function main() {
  const token = process.env.TG_TOKEN ?? "";
  const owners = process.env.OWNERS?.split(",") ?? [];
  const databasePath = process.env.DATABASE_PATH ?? "data/channels.db";

  const bot = new ChannelBot({
    token: token,
    owners: owners,
    databasePath: databasePath,
  });

  await bot.start();
}

main();
