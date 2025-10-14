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
  name: string
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
  name TEXT NOT NULL,
  url TEXT NOT NULL
);
`;
    this.database.exec(init);
  }

  public getChannels(): Channel[] {
    return this.database.prepare("SELECT id, name, url FROM channels ORDER BY id").all() as Channel[];
  }

  public addChannel(channel: Channel): number | null {
    const row = this.database.prepare(
      "INSERT INTO channels (name, url) VALUES (?, ?) RETURNING id",
    ).get(channel.name, channel.url) as {
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
