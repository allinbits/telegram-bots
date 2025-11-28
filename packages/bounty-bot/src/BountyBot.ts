import {
  parseCoins,
} from "@cosmjs/proto-signing";
import TelegramBot from "node-telegram-bot-api";

import {
  CosmosClient,
} from "./CosmosClient.ts";
import {
  Bounty, BountyDB,
  Claim,
} from "./db.ts";

const TELEGRAM_LIMIT_MESSAGE_LENGTH = 4096;

export type BountyBotOptions = {
  token: string
  owners: string[]
  mnemonic: string
  databasePath: string
};

type Command = {
  command: string
  description: string
  regex: RegExp
  function: (msg: TelegramBot.Message, match: RegExpExecArray | null) => void
  usage: string
  ownerOnly?: boolean
};

const escapeMarkdownV2 = (text: string): string => {
  return text.replace(/([_*\[\]()~`>#+\-=|{}\.!\\])/g, "\\$1");
};

export class BountyBot {
  private bot: TelegramBot;
  private owners: Set<string>;
  private commands: Command[];
  private cosmos: CosmosClient;
  private bountyDB: BountyDB;

  constructor(options: BountyBotOptions) {
    this.bot = new TelegramBot(options.token, {
      polling: true,
    });
    this.owners = new Set(options.owners);
    this.cosmos = new CosmosClient(options.mnemonic);
    this.bountyDB = new BountyDB(options.databasePath);

    this.commands = [
      {
        command: "bounty",
        description: "Create a bounty (owners only)",
        regex: /^\/bounty(@.*)? (.*)/,
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
        regex: /^\/bounty_update(.+)/,
        ownerOnly: true,
        usage: "Usage: /bounty_update <bounty_id> <amount><denom> <description>(owners only)",
        function: this.onUpdateBounty,
      },
      {
        command: "bounty_claim",
        description: "Claim a bounty",
        regex: /^\/bounty_claim(.+)/,
        usage: "Usage: /bounty_claim <bounty_id> <proof>",
        function: this.onClaimBounty,
      },
      {
        command: "bounty_delete",
        description: "Delete a bounty (owners only)",
        regex: /^\/bounty_delete(.+)/,
        ownerOnly: true,
        usage: "Usage: /bounty_delete <bounty_id>",
        function: this.onDeleteBounty,
      },
      {
        command: "bounty_complete",
        description: "Complete and pay bounty (owners only)",
        regex: /^\/bounty_complete(.+)/,
        ownerOnly: true,
        usage: "Usage: /bounty_complete <bounty_id> <username>",
        function: this.onCompleteBounty,
      },
      {
        command: "register",
        description: "Register your ATONE address",
        regex: /^\/register(.+)/,
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

  // private async sendMessage(chatId: number | string, texts: string[], options?: TelegramBot.SendMessageOptions) {
  //   for (const text of texts) {
  //     try {
  //       await this.bot.sendMessage(chatId, text, options);
  //     }
  //     catch (error) {
  //       console.error(`[ERROR] sendMessage: ${text}`, error as Error);
  //       await this.bot.sendMessage(chatId, `error: ${text}`, options);
  //     }
  //   }
  // };
  
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
        this.bot.sendMessage(msg.chat.id, `${cmd.usage}\n\nError: ${(error as Error).message}`);
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
        } as TelegramBot.BotCommandScope,
      });
      await this.bot.setMyCommands(commandsForTelegram, {
        scope: {
          type: "all_group_chats",
        } as TelegramBot.BotCommandScope,
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
  private onCreateBounty = (msg: TelegramBot.Message, _match: RegExpExecArray | null) => {
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
    const id = this.bountyDB.addBounty(amount[0].amount, amount[0].denom, task);
    this.bot.sendMessage(msg.chat.id, `Bounty created with ID: ${id}`, {
      parse_mode: "MarkdownV2",
      protect_content: true,
    });
  };


  /**
   * Claim a bounty
   * Expected format: /bounty_claim <bounty_id> <proof>
   */
  private onClaimBounty = async (msg: TelegramBot.Message, _match: RegExpExecArray | null) => {
    const [_command, bountyId, ...proofParts] = msg.text?.split(" ") ?? [];
    const proof = proofParts.join(" ");

    if (isNaN(parseInt(bountyId)) || !proof) {
      throw new Error("bountyId is empty");
    }

    const username = msg.from?.username ?? "";
    if (!username) {
      throw new Error("Username is empty");
    }


    this.bountyDB.claimBounty(parseInt(bountyId), username, proof);

    this.bot.sendMessage(msg.chat.id, `Bounty ${bountyId} claimed by [@${username}](tg://user?id=${msg.from?.id})`, {
      protect_content: true,
      parse_mode: "MarkdownV2",
    });
  };


  /**
   * Complete a bounty and trigger on-chain payment
   * Expected format: /bounty_complete <bounty_id> <username>
   */
  private onCompleteBounty = async (msg: TelegramBot.Message, _match: RegExpExecArray | null) => {
    const args = msg.text?.split(" ") ?? [];
    const bountyId = parseInt(args[1]);
    const username = args[2]?.replace("@", "");
    if (isNaN(bountyId) || !username) {
      throw new Error("bountyId or username is empty");
    }
    const bounty = this.bountyDB.getBounty(bountyId);
    if (!bounty) {
      throw new Error("Bounty not found");
    }
    if (bounty.completed) {
      throw new Error("Bounty already completed");
    }
    const recipientAddress = this.bountyDB.getRecipientByUsername(username);
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
    this.bountyDB.markBountyCompleted(bountyId, username);
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
    this.bountyDB.deleteBounty(bountyId);
    this.bot.sendMessage(msg.chat.id, `Bounty ${bountyId} deleted`, {
      protect_content: true,
    });
  };

  /**
   * List all active bounties
   * Expected format: /bounties
   */
  private onListBounties = async (msg: TelegramBot.Message) => {
    const [_command, bountyId] = msg.text?.split(" ") ?? [];

    let bounties = this.bountyDB.getBounties();

    if (bountyId) {
      bounties = bounties.filter((bounty: Bounty) => bounty.id.toString() === bountyId);
    }
    if (bounties.length === 0) {
      this.bot.sendMessage(msg.chat.id, "No active bounties", {
        protect_content: true,
      });
      return;
    }
    else {
      const claims = this.bountyDB.getClaims();

      const responses: string[] = [];
      
      let response = "";
      bounties.forEach((bounty: Bounty) => {
        let bounty_msg = "";
        let amt = bounty.amount;
        let denom = bounty.denom;
        if (bounty.denom === "uphoton") {
          amt = "" + parseInt(bounty.amount) / 1000000;
          denom = "PHOTON";
        } else if (bounty.denom === "uatone") {
          amt = "" + parseInt(bounty.amount) / 1000000;
          denom = "ATONE";
        }

        const task = escapeMarkdownV2(bounty.task);
        const escapedAmt = escapeMarkdownV2(amt);
        const escapedDenom = escapeMarkdownV2(denom);
        const escapedId = escapeMarkdownV2(bounty.id.toString());
        bounty_msg += `*${escapedId}*\\. _*${escapedAmt} ${escapedDenom}*_ \\- ${task}\n\n`;
        const claims_for_bounty = claims.filter((claim: Claim) => claim.bounty_id === bounty.id);
        if (claims_for_bounty.length > 0) {
        bounty_msg += "Claimed by:\n";
          claims_for_bounty.forEach((claim: Claim) => {
            bounty_msg += `  \\- [${escapeMarkdownV2(claim.username)}](https://t.me/${claim.username}) \\- ${escapeMarkdownV2(claim.proof ?? "")}\n`;
          });
        }
        response += bounty_msg;

        if (response.length + bounty_msg.length > TELEGRAM_LIMIT_MESSAGE_LENGTH) {
          responses.push(response);
          response = "";
        }
      });

      responses.push(response);

      for (const response of responses) {
        await this.bot.sendMessage(msg.chat.id, response, {
          parse_mode: "MarkdownV2",
          // protect_content: true,
          disable_web_page_preview: true,
          link_preview_options: {
            is_disabled: true,
          },
        });
      }
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
    this.bountyDB.updateBountyAmount(bountyId, amount[0].amount, amount[0].denom);
    this.bountyDB.updateBountyDescription(bountyId, description);
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
        this.bountyDB.registerRecipient("TGID:" + msg.from.id.toString(), address);
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
      this.bountyDB.registerRecipient(msg.from.username, address);
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
