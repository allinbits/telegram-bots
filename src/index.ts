import {
  parseCoins,
} from "@cosmjs/proto-signing";
import TelegramBot from "node-telegram-bot-api";

import {
  addBounty,
  Bounty,
  completeBounty,
  getBounties,
  registerRecipient,
} from "./db.js";

const bot = new TelegramBot("8458637622:AAEUtYO0fSBdJxZfvcHzQRKwinm6Hfv4nn4", {
  polling: true,
});
const owner = "clockworkgr";
bot.onText(/\/complete (.+)/, async (msg, match) => {
  if (msg.from?.username !== owner) {
    return;
  }
  else {
    try {
      if (!match) {
        bot.sendMessage(msg.chat.id, "Usage: /complete <bounty_id> <username>", {
          protect_content: true,
        });
        return;
      }
      const args = msg.text?.split(" ") ?? [];
      const bountyId = parseInt(args[1]);
      const username = args[2]?.replace("@", "");
      if (isNaN(bountyId) || !username) {
        bot.sendMessage(msg.chat.id, "Usage: /complete <bounty_id> <username>", {
          protect_content: true,
        });
        return;
      }
      const hash = await completeBounty(bountyId, username);
      bot.sendMessage(msg.chat.id, `Bounty ${bountyId} marked as completed and paid to @${username}\n\nTransaction: https://www.mintscan.io/atomone/tx/${hash}`, {
        protect_content: true,
      });
    }
    catch (error) {
      console.error(error);
      bot.sendMessage(msg.chat.id, `Error: ${(error as Error).message}`, {
        protect_content: true,
      });
    }
  }
});
bot.onText(/\/register (.+)/, (msg, match) => {
  try {
    if (!match) {
      bot.sendMessage(msg.chat.id, "Usage: /register <address>", {
        protect_content: true,
      });
      return;
    }
    else {
      const address = match[1];
      if (!msg.from?.username) {
        bot.sendMessage(msg.chat.id, "You need a username to register", {
          protect_content: true,
        });
        return;
      }
      registerRecipient(msg.from.username, address);
      bot.sendMessage(msg.chat.id, `Registered ${address} for @${msg.from.username}`, {
        protect_content: true,
      });
    }
  }
  catch (error) {
    console.error(error);
    bot.sendMessage(msg.chat.id, "Usage: /register <address>", {
      protect_content: true,
    });
  }
});
bot.onText(/\/bounties/, (msg) => {
  const bounties = getBounties();
  if (bounties.length === 0) {
    bot.sendMessage(msg.chat.id, "No active bounties\\.", {
      parse_mode: "MarkdownV2",
      protect_content: true,
    });
    return;
  }
  else {
    let response = "*Active Bounties:*\n\n";
    bounties.forEach((bounty: Bounty) => {
      response += "\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\n";
      response += `*ID:* ${bounty.id}\n`;
      response += "*Task:*\n";
      response += `_${bounty.task}_\n`;
      response += `*Amount:* ${bounty.amount} ${bounty.denom}\n\n`;
    });
    bot.sendMessage(msg.chat.id, response, {
      parse_mode: "MarkdownV2",
      protect_content: true,
    });
  }
});
bot.onText(/\/bountyhelp/, (msg) => {
  let response = "Hi, I'm the Atone bounty bot. I 'm here to help organize bounties and pay them out.\n\n";
  response += "Commands:\n";
  response += "/bounties\n";
  response += "List all active bounties\n\n";
  response += "/bounty <amount><denom> <task>\n";
  response += "Create a new bounty (owner only)\n\n";
  response += "/register <address>\n";
  response += "Register your AtomOne address\n\n";
  response += "/complete <bounty_id> <username>\n";
  response += "Mark a bounty as completed and pay to\n";
  response += "<username>'s registered address (owner only)\n\n";
  response += "/bountyhelp\n";
  response += "Show this help message\n";
  bot.sendMessage(msg.chat.id, response, {
    protect_content: true,
  });
});
bot.onText(/\/bounty (.+)/, (msg, match) => {
  if (msg.from?.username !== owner) {
    return;
  }
  else {
    try {
      if (!match) {
        bot.sendMessage(msg.chat.id, "Usage: /bounty <amount><denom> <task>", {
          parse_mode: "MarkdownV2",
          protect_content: true,
        });
        return;
      }
      const args = msg.text?.split(" ") ?? [];
      const coins = args[1];
      console.log(args, coins);
      const amount = parseCoins(coins ?? "");
      const task = args.slice(2).join(" ");
      if (amount.length === 0 || !task) {
        bot.sendMessage(msg.chat.id, "Usage: /bounty <amount><denom> <task>", {
          protect_content: true,
        });
        return;
      }
      const id = addBounty(amount[0].amount, amount[0].denom, task);
      bot.sendMessage(msg.chat.id, `Bounty created with ID: ${id}`, {
        parse_mode: "MarkdownV2",
        protect_content: true,
      });
    }
    catch (error) {
      console.error(error);
      bot.sendMessage(msg.chat.id, "Usage: /bounty <amount><denom> <task>", {
        protect_content: true,
      });
    }
  }
});
