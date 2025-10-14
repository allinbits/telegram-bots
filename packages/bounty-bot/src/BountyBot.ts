import {
  parseCoins,
} from "@cosmjs/proto-signing";
import TelegramBot from "node-telegram-bot-api";

import {
  CosmosClient,
} from "./CosmosClient.js";
import {
  Bounty, bountyDB,
} from "./db.js";

export type BountyBotOptions = {
  token: string
  owners: string[]
};

type Command = {
  command: string
  description: string
  regex: RegExp
  function: (msg: TelegramBot.Message, match: RegExpExecArray | null) => void
  usage: string
  ownerOnly?: boolean
};

export class BountyBot {
  private bot: TelegramBot;
  private owners: Set<string>;
  private commands: Command[];
  private cosmos: CosmosClient;

  constructor(options: BountyBotOptions) {
    this.bot = new TelegramBot(options.token, {
      polling: true,
    });
    this.owners = new Set(options.owners);
    this.cosmos = new CosmosClient(process.env.MNEMONIC || "");

    this.commands = [
      {
        command: "bounty",
        description: "Create a bounty (owners only)",
        regex: /^\/bounty (.+)/,
        ownerOnly: true,
        usage: "Usage: /bounty <amount><denom> <task>",
        function: this.onCreateBounty,
      },
      {
        command: "bounties",
        description: "List active bounties",
        regex: /^\/bounties/,
        usage: "Usage: /bounties",
        function: this.onListBounties,
      },
      {
        command: "bounty_list",
        description: "List active bounties",
        regex: /^\/bounty_list/,
        usage: "Usage: /bounty_list",
        function: this.onListBounties,
      },
      {
        command: "bounty_update",
        description: "Update bounty amount (owners only)",
        regex: /^\/bounty_update (.+)/,
        ownerOnly: true,
        usage: "Usage: /bounty_update <bounty_id> <amount><denom> <description>(owners only)",
        function: this.onUpdateBounty,
      },
      {
        command: "bounty_delete",
        description: "Delete a bounty (owners only)",
        regex: /^\/bounty_delete (.+)/,
        ownerOnly: true,
        usage: "Usage: /bounty_delete <bounty_id>",
        function: this.onDeleteBounty,
      },
      {
        command: "bounty_complete",
        description: "Complete and pay bounty (owners only)",
        regex: /^\/bounty_complete (.+)/,
        ownerOnly: true,
        usage: "Usage: /bounty_complete <bounty_id> <username>",
        function: this.onCompleteBounty,
      },
      {
        command: "register",
        description: "Register your ATONE address",
        regex: /^\/register (.+)/,
        usage: "Usage: /register <address>",
        function: this.onRegister,
      },
      {
        command: "bounty_help",
        description: "Show help",
        regex: /^\/bounty_help/,
        usage: "Usage: /bounty_help",
        function: this.onBountyHelp,
      },
    ];
  }

  public async start(): Promise<void> {
    await this.registerCommands();

    this.commands.forEach(cmd => this.bot.onText(cmd.regex, async (msg: TelegramBot.Message, match: RegExpExecArray | null) => {
      console.log(`[INFO]: msg received ${msg.text} from ${msg.from?.username ?? msg.from?.id?.toString()}`);

      if (cmd.ownerOnly && !this.isOwner(msg.from?.username ?? "")) {
        this.bot.sendMessage(msg.chat.id, "This command is only available to owners", {
          protect_content: true,
        });
        return;
      }

      try {
        if (!match) {
          throw new Error("Message don't match regex");
        }

        await cmd.function(msg, match);
      }
      catch (error) {
        console.error(`[ERROR] ${cmd.command}: ${msg.text}`, error);
        this.bot.sendMessage(msg.chat.id, `${cmd.usage}\n\nError: ${(error as Error).message}`, {
          parse_mode: "Markdown",
          protect_content: true,
        });
      }
    }));
  }

  private isOwner = (username?: string | null): boolean => {
    if (!username) return false;
    return this.owners.has(username);
  };

  // Command registration
  private async registerCommands(): Promise<void> {
    const commandsForTelegram: TelegramBot.BotCommand[] = this.commands.map(c => ({
      command: c.command,
      description: c.description,
    }));

    try {
      await this.bot.setMyCommands(commandsForTelegram);
      await this.bot.setMyCommands(commandsForTelegram, {
        scope: {
          type: "all_private_chats",
        } as any,
      });
      await this.bot.setMyCommands(commandsForTelegram, {
        scope: {
          type: "all_group_chats",
        } as any,
      });
    }
    catch (err) {
      console.error("Failed to set bot commands:", err);
    }
  }

  /**
   * Create a new bounty from a message command
   * Expected format: /bounty <amount><denom> <task>
   */
  private onCreateBounty = (msg: TelegramBot.Message, match: RegExpExecArray | null) => {
    const args = msg.text?.split(" ") ?? [];
    const coins = args[1];
    let amount = parseCoins(coins ?? "");
    const task = args.slice(2).join(" ");

    if (amount.length === 0 || !task) {
      throw new Error("amount or task is empty");
    }
    if (amount[0].amount === "0") {
      throw new Error("Amount must be greater than 0");
    }
    if (amount[0].denom.toLowerCase() === "photon") {
      const newAmount = parseInt(amount[0].amount, 10) * 1000000;
      amount = parseCoins(newAmount.toString() + " uphoton");
    }
    if (amount[0].denom !== "uphoton") {
      throw new Error("Amount must be in uphoton");
    }
    const id = bountyDB.addBounty(amount[0].amount, amount[0].denom, task);
    this.bot.sendMessage(msg.chat.id, `Bounty created with ID: ${id}`, {
      parse_mode: "MarkdownV2",
      protect_content: true,
    });
  };

  /**
   * Complete a bounty and trigger on-chain payment
   * Expected format: /bounty_complete <bounty_id> <username>
   */
  private onCompleteBounty = async (msg: TelegramBot.Message, match: RegExpExecArray | null) => {
    const args = msg.text?.split(" ") ?? [];
    const bountyId = parseInt(args[1]);
    const username = args[2]?.replace("@", "");
    if (isNaN(bountyId) || !username) {
      throw new Error("bountyId or username is empty");
    }
    const bounty = bountyDB.getBounty(bountyId);
    if (!bounty) {
      throw new Error("Bounty not found");
    }
    if (bounty.completed) {
      throw new Error("Bounty already completed");
    }
    const recipientAddress = bountyDB.getRecipientByUsername(username);
    if (!recipientAddress) {
      throw new Error("Recipient not registered");
    }
    const {
      txHash,
    } = await this.cosmos.sendTokens(recipientAddress, [
      {
        denom: bounty.denom,
        amount: bounty.amount,
      },
    ]);
    bountyDB.markBountyCompleted(bountyId, username);
    this.bot.sendMessage(
      msg.chat.id,
      `Bounty ${bountyId} marked as completed and paid to @${username}\n\nTransaction: https://www.mintscan.io/atomone/tx/${txHash}`,
      {
        protect_content: true,
      },
    );
  };

  /**
   * Delete an existing bounty by id
   * Expected format: /bounty_delete <bounty_id>
   */
  private onDeleteBounty = async (msg: TelegramBot.Message, _match: RegExpExecArray | null) => {
    const args = msg.text?.split(" ") ?? [];
    const bountyId = parseInt(args[1]);
    if (isNaN(bountyId)) {
      throw new Error("bountyId is empty");
    }
    bountyDB.deleteBounty(bountyId);
    this.bot.sendMessage(msg.chat.id, `Bounty ${bountyId} deleted`, {
      protect_content: true,
    });
  };

  /**
   * List all active bounties
   * Expected format: /bounties
   */
  private onListBounties = (msg: TelegramBot.Message) => {
    const bounties = bountyDB.getBounties();
    if (bounties.length === 0) {
      this.bot.sendMessage(msg.chat.id, "No active bounties", {
        protect_content: true,
      });
      return;
    }
    else {
      let response = "Active Bounties:\n\n";
      bounties.forEach((bounty: Bounty) => {
        let amt = bounty.amount;
        let denom = bounty.denom;
        if (bounty.denom === "uphoton") {
          amt = "" + parseInt(bounty.amount) / 1000000;
          denom = "PHOTON";
        }
        response += "------------------------------------------------\n";
        response += `ID: **${bounty.id}**\n`;
        response += "Task:\n";
        response += `${bounty.task}\n`;
        response += `Amount: **${amt} ${denom}**\n\n`;
      });
      this.bot.sendMessage(msg.chat.id, response, {
        parse_mode: "Markdown",
        protect_content: true,
      });
    }
  };

  /**
   * Display help text for all bounty commands
   * Expected format: /bounty_help
   */
  private onBountyHelp = (msg: TelegramBot.Message) => {
    let response = "Hi, I'm the Atone bounty bot. I 'm here to help organize bounties and pay them out.\n\n";

    for (const command of this.commands) {
      response += `/${command.command} - ${command.description}\n`;
      response += `${command.usage}\n\n`;
    }
    this.bot.sendMessage(msg.chat.id, response, {
      protect_content: true,
    });
  };

  /**
   * Update bounty amount and denom
   * Expected format: /bounty_update <bounty_id> <amount><denom>
   */
  private onUpdateBounty = (msg: TelegramBot.Message, _match: RegExpExecArray | null) => {
    const args = msg.text?.split(" ") ?? [];
    const bountyId = parseInt(args[1]);
    if (isNaN(bountyId)) {
      throw new Error("Invalid bounty ID");
    }

    const description = args.slice(3).join(" ");

    const coins = args[2];
    let amount = parseCoins(coins ?? "");
    if (amount.length === 0) {
      throw new Error("Invalid amount");
    }
    if (amount[0].amount === "0") {
      throw new Error("Amount must be greater than 0");
    }
    if (amount[0].denom.toLowerCase() === "photon") {
      const newAmount = parseInt(amount[0].amount, 10) * 1000000;
      amount = parseCoins(newAmount.toString() + " uphoton");
    }
    if (amount[0].denom !== "uphoton") {
      throw new Error("Amount must be in uphoton");
    }
    bountyDB.updateBountyAmount(bountyId, amount[0].amount, amount[0].denom);
    bountyDB.updateBountyDescription(bountyId, description);
    this.bot.sendMessage(msg.chat.id, `Bounty with ID: ${bountyId} updated`, {
      protect_content: true,
    });
  };

  /**
   * Register a user address for payouts
   * Expected format: /register <address>
   */
  private onRegister = async (msg: TelegramBot.Message, match: RegExpExecArray | null) => {
    const address = match?.[1];
    if (!address) {
      throw new Error("Address is empty");
    }
    if (!msg.from?.username) {
      if (msg.from?.id) {
        bountyDB.registerRecipient("TGID:" + msg.from.id.toString(), address);
        const sent = await this.bot.sendMessage(
          msg.chat.id,
          `Registered ${address} for user with ID: ${msg.from.id.toString()}`,
          {
            protect_content: true,
          },
        );
        setTimeout(() => {
          this.safeDeleteMessage(msg.chat.id, msg.message_id);
          this.safeDeleteMessage(sent.chat.id, sent.message_id);
        }, 5000);
      }
      else {
        this.bot.sendMessage(msg.chat.id, "You must have a Telegram username or id to register", {
          protect_content: true,
        });
      }
    }
    else {
      bountyDB.registerRecipient(msg.from.username, address);
      const sent = await this.bot.sendMessage(
        msg.chat.id,
        `Registered ${address} for @${msg.from.username}`,
        {
          protect_content: true,
        },
      );
      setTimeout(() => {
        this.safeDeleteMessage(msg.chat.id, msg.message_id);
        this.safeDeleteMessage(sent.chat.id, sent.message_id);
      }, 5000);
    }
  };

  private safeDeleteMessage(chatId: number | string, messageId: number): void {
    this.bot.deleteMessage(chatId, messageId).catch(() => {
      // ignore
    });
  }
}
