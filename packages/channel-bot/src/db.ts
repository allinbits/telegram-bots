import {
  mkdirSync,
} from "node:fs";
import path from "node:path";
import {
  DatabaseSync,
} from "node:sqlite";

// Define the Channel type
export type Channel = {
  id?: number
  description: string
  url: string
};

export class ChannelDB {
  private database: DatabaseSync;

  constructor() {
    const databasePath = process.env.CHANNELS_DATABASE_FILE || "data/channels.db";
    mkdirSync(path.dirname(databasePath), {
      recursive: true,
    });
    this.database = new DatabaseSync(databasePath);

    const init = `
CREATE TABLE IF NOT EXISTS channels (
  id INTEGER PRIMARY KEY,
  description TEXT NOT NULL,
  url TEXT NOT NULL
);
`;
    this.database.exec(init);
  }

  public getChannels(): Channel[] {
    return this.database.prepare("SELECT id, description, url FROM channels ORDER BY id").all() as Channel[];
  }

  public addChannel(channel: Channel): number | null {
    const row = this.database.prepare(
      "INSERT INTO channels (description, url) VALUES (?, ?) RETURNING id",
    ).get(channel.description, channel.url) as {
      id?: unknown
    } | undefined;
    const idValue = row?.id;
    return idValue == null ? null : Number(idValue);
  }

  public removeChannel(id: number): void {
    this.database.prepare("DELETE FROM channels WHERE id = ?").run(id);
  }
}

export const channelDB = new ChannelDB();
