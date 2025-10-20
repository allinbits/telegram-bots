import {
  mkdirSync,
} from "node:fs";
import path from "node:path";
import {
  DatabaseSync,
} from "node:sqlite";

export type Bounty = {
  id: number
  amount: string
  denom: string
  task: string
  completed: boolean
  created_at: number
  completed_at: number | null
  recipient: string | null
};

export type Claim = {
  id: number
  bounty_id: number
  username: string
  proof: string | null
  created_at: number
};

export class BountyDB {
  private database: DatabaseSync;

  constructor(databasePath: string) {
    mkdirSync(path.dirname(databasePath), {
      recursive: true,
    });

    this.database = new DatabaseSync(databasePath);
    const initDatabase = `
CREATE TABLE IF NOT EXISTS bounties (
  id INTEGER PRIMARY KEY,
  amount TEXT NOT NULL,
  denom TEXT NOT NULL,
  task TEXT NOT NULL,
  completed BOOLEAN NOT NULL,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  recipient TEXT
);

CREATE TABLE IF NOT EXISTS recipients (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL,
  address TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS claims (
  id INTEGER PRIMARY KEY,
  bounty_id INTEGER NOT NULL,
  username  TEXT NOT NULL,
  proof     TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE (bounty_id, username),
  FOREIGN KEY (bounty_id) REFERENCES bounties(id)
);
`;

    this.database.exec(initDatabase);
  }

  public addBounty(amount: string, denom: string, task: string): number | null {
    const createdAt = Date.now();
    const row = this.database.prepare(
      "INSERT INTO bounties (amount, denom, task, completed, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id",
    ).get(amount, denom, task, 0, createdAt) as {
      id?: unknown
    } | undefined;
    const idValue = row?.id;
    return idValue == null ? null : Number(idValue);
  }

  public updateBountyAmount(id: number, amount: string, denom: string): void {
    this.database.prepare("UPDATE bounties SET amount = ?, denom = ? WHERE id = ?").run(amount, denom, id);
  }

  public updateBountyDescription(id: number, description: string): void {
    this.database.prepare("UPDATE bounties SET task = ? WHERE id = ?").run(description, id);
  }

  public deleteBounty(id: number): void {
    this.database.prepare("DELETE FROM bounties WHERE id = ?").run(id);
  }

  public getBounties(): Bounty[] {
    return this.database.prepare("SELECT * FROM bounties WHERE completed = 0").all() as unknown as Bounty[];
  }

  public getBounty(id: number): Bounty | undefined {
    return this.database.prepare("SELECT * FROM bounties WHERE id = ?").get(id) as unknown as Bounty | undefined;
  }

  public registerRecipient(username: string, address: string): void {
    const existing = this.getRecipientByUsername(username);
    if (existing) {
      this.database.prepare("UPDATE recipients SET address = ? WHERE username = ?").run(address, username);
    }
    else {
      this.database.prepare("INSERT INTO recipients (username, address) VALUES (?, ?)").run(username, address);
    }
  }

  public claimBounty(bountyId: number, username: string, proof: string): void {
    this.database.prepare("INSERT OR REPLACE INTO claims (bounty_id, username, proof) VALUES (?, ?, ?)").run(bountyId, username, proof);
  }

  public getClaims(): Claim[] {
    return this.database.prepare("SELECT * FROM claims").all() as unknown as Claim[];
  }

  public getRecipientByUsername(username: string): string | null {
    const row = this.database.prepare("SELECT * FROM recipients WHERE username = ?").get(username) as {
      address?: unknown
    } | undefined;
    const value = row?.address;
    return value == null ? null : String(value);
  }

  public getAddressByUsername(username: string): string | null {
    return this.getRecipientByUsername(username);
  }

  public getUsernameByAddress(address: string): string | null {
    const row = this.database.prepare("SELECT * FROM recipients WHERE address = ?").get(address) as {
      username?: unknown
    } | undefined;
    const value = row?.username;
    return value == null ? null : String(value);
  }

  public dumpRegistrations(): {
    username: string
    address: string
  }[] {
    return this.database.prepare("SELECT username, address FROM recipients ORDER BY username").all() as {
      username: string
      address: string
    }[];
  }

  public markBountyCompleted(id: number, recipient: string): void {
    const completedAt = Date.now();
    this.database.prepare("UPDATE bounties SET completed = 1, completed_at = ?, recipient = ? WHERE id = ?").run(completedAt, recipient, id);
  }
}
