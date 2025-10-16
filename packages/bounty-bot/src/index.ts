import {
  BountyBot,
} from "./BountyBot.ts";

async function main() {
  const token = process.env.TG_TOKEN ?? "";
  const owners = process.env.OWNERS?.split(",") ?? [];
  const mnemonic = process.env.MNEMONIC ?? "";
  const databasePath = process.env.DATABASE_PATH ?? "data/bounties.db";

  const bot = new BountyBot({
    token: token,
    owners: owners,
    mnemonic: mnemonic,
    databasePath: databasePath,
  });

  await bot.start();
}

main();
