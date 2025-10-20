import {
  mkdirSync,
} from "node:fs";
import path from "node:path";
import {
  DatabaseSync,
} from "node:sqlite";

export type Scope = {
  id?: number
  name: string
  tg_chat_id: number
};

// Define the Channel type
export type Channel = {
  id?: number
  scope_id?: number
  scope_name?: string
  description: string
  url: string
};

export class ChannelDB {
  private database: DatabaseSync;

  constructor(databasePath: string) {
    mkdirSync(path.dirname(databasePath), {
      recursive: true,
    });
    this.database = new DatabaseSync(databasePath);

    const init = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS scopes (
  id         INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  tg_chat_id INTEGER NOT NULL,
  
  UNIQUE (name, tg_chat_id)
);
CREATE INDEX IF NOT EXISTS idx_scopes_name ON scopes (name);
CREATE INDEX IF NOT EXISTS idx_scopes_tg_chat_id ON scopes (tg_chat_id);

CREATE TABLE IF NOT EXISTS channels (
  id           INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  scope_id     INTEGER NOT NULL REFERENCES scopes(id),
  description  TEXT NOT NULL,
  url          TEXT NOT NULL,

  FOREIGN KEY (scope_id) REFERENCES scopes(id)
);
`;
    this.database.exec(init);
  }

  public getChannelByTelegramChatId(tgChatId: number): Channel[] {
    return this.database.prepare(`
SELECT
  c1.id,
  s1.name as scope_name,
  c1.description,
  c1.url
FROM scopes s1
JOIN scopes s2 ON s1.name = s2.name
JOIN channels c1 ON s1.id = c1.scope_id
WHERE s2.tg_chat_id = ?;
    `).all(tgChatId) as Channel[];
  }

  public addChannel(channel: Channel): void {
    console.log("Adding channel", channel);

    if (!channel.scope_id) {
      throw new Error("scope_id is required");
    }
    this.database.prepare(
      "INSERT INTO channels (scope_id, description, url) VALUES (?, ?, ?)",
    ).run(channel.scope_id, channel.description, channel.url);
  }

  public removeChannel(id: number): void {
    this.database.prepare("DELETE FROM channels WHERE id = ?").run(id);
  }

  public removeChannelInScope(id: number, scope: string): void {
    this.database.prepare("DELETE FROM channels WHERE id = ? AND scope = ?").run(id, scope);
  }

  public linkChatToScope(tgChatId: number, scopeName: string): void {
    this.database.prepare(
      "INSERT INTO scopes (name, tg_chat_id) VALUES (?, ?)",
    ).run(scopeName, tgChatId);
  }

  public getChatScopeByChatId(chatId: string): Scope | null {
    const row = this.database.prepare(
      "SELECT id, name, tg_chat_id FROM scopes WHERE tg_chat_id = ?",
    ).get(chatId) as Scope | undefined;
    return row ?? null;
  }

  public getScope(name: string, telegramChatId: number): Scope | null {
    return this.database.prepare(
      "SELECT id, name, tg_chat_id FROM scopes WHERE name = ? AND tg_chat_id = ?",
    ).get(name, telegramChatId) as Scope | null;
  }

  public getChatScopeByName(scopeName: string): Scope | null {
    const row = this.database.prepare(
      "SELECT id, name, tg_chat_id FROM scopes WHERE name = ?",
    ).get(scopeName) as Scope | undefined;
    return row ?? null;
  }
}
