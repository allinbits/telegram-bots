import { BountyBot } from "./BountyBot.js";

async function main() {
  const token = process.env.TG_TOKEN ?? "";
  const owners = process.env.OWNERS?.split(",") ?? [];

  const bot = new BountyBot({
    token: token,
    owners: owners,
  });

  await bot.start();
}

main();