import {
  ChannelBot,
} from "./ChannelBot.ts";

async function main() {
  const token = process.env.TG_TOKEN ?? "";
  const owners = process.env.OWNERS?.split(",") ?? [];

  const bot = new ChannelBot({
    token: token,
    owners: owners,
  });

  await bot.start();
}

main();
