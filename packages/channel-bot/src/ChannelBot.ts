import TelegramBot from "node-telegram-bot-api";

import {
  ChannelDB,
} from "./db.ts";

export type ChannelBotOptions = {
  token: string
  owners: string[]
  databasePath: string
};

type Command = {
  command: string
  description: string
  regex: RegExp
  function: (msg: TelegramBot.Message, match: RegExpExecArray | null) => void | Promise<void>
  usage: string
  ownerOnly?: boolean
};

export class ChannelBot {
  private bot: TelegramBot;
  private owners: Set<string>;
  private commands: Command[];
  private channelDB: ChannelDB;

  constructor(options: ChannelBotOptions) {
    this.bot = new TelegramBot(options.token, {
      polling: true,
    });
    this.owners = new Set(options.owners);
    this.channelDB = new ChannelDB(options.databasePath);

    this.commands = [
      {
        command: "channels",
        description: "List channels for this chat's scope",
        regex: /^\/channels/,
        usage: "Usage: /channels",
        function: this.onListChannels,
      },
      {
        command: "channel_link",
        description: "Link this chat to a scope (owners only)",
        regex: /^\/channel_link(.+)/,
        usage: "Usage: /channel_link <scope_name>",
        function: this.onLinkChat,
        ownerOnly: true,
      },
      {
        command: "channel_add",
        description: "Add channel to scope (owners only)",
        regex: /^\/channel_add(.+)/,
        usage: "Usage: /channel_add <scope> <url> <description...>",
        function: this.onAddChannel,
        ownerOnly: true,
      },
      {
        command: "channel_remove",
        description: "Remove channel in scope (owners only)",
        regex: /^\/channel_remove(.+)/,
        usage: "Usage: /channel_remove <channel_id> <scope>",
        function: this.onRemoveChannel,
        ownerOnly: true,
      },
      {
        command: "channel_help",
        description: "Show help",
        regex: /^\/channel_help/,
        usage: "Usage: /channel_help",
        function: this.onChannelHelp,
      },
    ];
  }

  private async registerCommands(): Promise<void> {
    const commandsForTelegram: TelegramBot.BotCommand[] = this.commands.map(cmd => ({
      command: cmd.command,
      description: cmd.description,
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

  public async start(): Promise<void> {
    await this.registerCommands();

    this.commands.forEach(cmd => this.bot.onText(cmd.regex, async (msg: TelegramBot.Message, match: RegExpExecArray | null) => {
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

  private onListChannels = (msg: TelegramBot.Message) => {
    const channels = this.channelDB.getChannelByTelegramChatId(msg.chat.id);

    if (channels.length === 0) {
      this.bot.sendMessage(msg.chat.id, "No channels configured for this chat", {
        protect_content: true,
      });
      return;
    }

    let response = "";
    for (const ch of channels) {
      response += `${ch.id}. ${ch.description}\n${ch.url}\n`;
    }

    this.bot.sendMessage(msg.chat.id, response, {
      parse_mode: "Markdown",
      disable_web_page_preview: true,
      protect_content: true,
    });
  };

  private onAddChannel = (msg: TelegramBot.Message, _match: RegExpExecArray | null) => {
    const text = msg.text ?? "";
    const [_command, scopeName, url, ...descriptionParts] = text.split(" ");
    const description = descriptionParts.join(" ").trim();
    if (!scopeName) {
      throw new Error("scope is empty");
    }
    if (!url) {
      throw new Error("url is empty");
    }

    const scope = this.channelDB.getScope(scopeName, msg.chat.id);
    if (!scope) {
      throw new Error("chat is not linked to any scope");
    }

    this.channelDB.addChannel({
      scope_id: scope.id,
      description,
      url,
    });

    this.bot.sendMessage(msg.chat.id, "Added channel successfully", {
      protect_content: true,
    });
  };

  private onLinkChat = (msg: TelegramBot.Message, _match: RegExpExecArray | null) => {
    const text = msg.text ?? "";
    const [_command, scopeName] = text.split(" ");
    if (!scopeName) {
      throw new Error("scope_name is empty");
    }
    this.channelDB.linkChatToScope(msg.chat.id, scopeName);
    this.bot.sendMessage(msg.chat.id, `Linked this chat to scope '${scopeName}'`, {
      protect_content: true,
    });
  };

  private onRemoveChannel = (msg: TelegramBot.Message, _match: RegExpExecArray | null) => {
    const args = msg.text?.split(" ") ?? [];
    const channelId = parseInt(args[1]);
    const scope = args[2];
    if (isNaN(channelId)) {
      throw new Error("channel_id is empty");
    }
    if (!scope) {
      throw new Error("scope is empty");
    }
    this.channelDB.removeChannelInScope(channelId, scope);
    this.bot.sendMessage(msg.chat.id, `Removed channel ${channelId} from scope '${scope}'`, {
      protect_content: true,
    });
  };

  /**
   * Display help text for all channel commands
   * Expected format: /channel_help
   */
  private onChannelHelp = (msg: TelegramBot.Message) => {
    let response = "Hi, I'm the Channel bot. I'm here to help manage channel links and scopes.\n\n";

    for (const command of this.commands) {
      response += `/${command.command} - ${command.description}\n`;
      response += `${command.usage}\n\n`;
    }
    this.bot.sendMessage(msg.chat.id, response, {
      disable_web_page_preview: true,
    });
  };

}
