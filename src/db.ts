import {
  DatabaseSync,
} from "node:sqlite";

import {
  DirectSecp256k1HdWallet,
} from "@cosmjs/proto-signing";
import {
  GasPrice,
  SigningStargateClient,
} from "@cosmjs/stargate";

const database = new DatabaseSync("bounties/bounties.db");

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
CREATE TABLE IF NOT EXISTS channels (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  link TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS recipients (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL,
  address TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recipients_username ON recipients (username);
CREATE INDEX IF NOT EXISTS idx_recipients_address ON recipients (address);
`;

database.exec(initDatabase);

export const addBounty = (amount: string, denom: string, task: string) => {
  const createdAt = Date.now();
  database.prepare("INSERT INTO bounties (amount, denom, task, completed, created_at) VALUES (?, ?, ?, ?, ?)").run(amount, denom, task, 0, createdAt);
  return database.prepare("SELECT last_insert_rowid() as id")?.get()?.id || null;
};
export const addChannel = (name: string, link: string) => {
  database.prepare("INSERT INTO channels (name, link) VALUES (?, ?)").run(name, link);
  return database.prepare("SELECT last_insert_rowid() as id")?.get()?.id || null;
};
export const getAddressByUsername = (username: string) => {
  return database.prepare("SELECT * FROM recipients WHERE username = ?").get(username)?.address || null;
};
export const getUsernameByAddress = (address: string) => {
  return database.prepare("SELECT * FROM recipients WHERE address = ?").get(address)?.username || null;
};
export const deleteBounty = (id: number) => {
  database.prepare("DELETE FROM bounties WHERE id = ?").run(id);
};
export const updateBountyAmount = (id: number, amount: string, denom: string) => {
  database.prepare("UPDATE bounties SET amount = ?, denom = ? WHERE id = ?").run(amount, denom, id);
};
export const dumpRegistrations = () => {
  return database.prepare("SELECT * FROM recipients").all() as unknown as {
    id: number
    username: string
    address: string
  }[];
};
export const getBounties = () => {
  return database.prepare("SELECT * FROM bounties WHERE completed = 0").all() as unknown as Bounty[];
};
export const getChannels = () => {
  return database.prepare("SELECT * FROM channels").all() as unknown as {
    id: number
    name: string
    link: string
  }[];
};
export const getBounty = (id: number) => {
  return database.prepare("SELECT * FROM bounties WHERE id = ?").get(id) as unknown as Bounty | undefined;
};
export const registerRecipient = (username: string, address: string) => {
  const existing = getRecipientByUsername(username);
  if (existing) {
    database.prepare("UPDATE recipients SET address = ? WHERE username = ?").run(address, username);
  }
  else {
    database.prepare("INSERT INTO recipients (username, address) VALUES (?, ?)").run(username, address);
  }
};
export const getRecipientByUsername = (username: string) => {
  return database.prepare("SELECT * FROM recipients WHERE username = ?").get(username)?.address || null;
};
export const completeBounty = async (id: number, recipient: string) => {
  const recipientAddress = getRecipientByUsername(recipient) as string | null;
  if (!recipientAddress) {
    throw new Error("Recipient not registered");
  }
  const bounty = getBounty(id);
  if (!bounty) {
    throw new Error("Bounty not found");
  }
  if (bounty.completed) {
    throw new Error("Bounty already completed");
  }
  const signer = await DirectSecp256k1HdWallet.fromMnemonic(process.env.MNEMONIC || "", {
    prefix: "atone",
  });
  const address = (await signer.getAccounts())[0].address;
  const client = await SigningStargateClient.connectWithSigner(process.env.RPC_ENDPOINT || "https://atomone-rpc.allinbits.com/", signer, {
    gasPrice: GasPrice.fromString("0.025uphoton"),
  });
  const result = await client.sendTokens(address, recipientAddress, [
    {
      denom: bounty.denom as string,
      amount: bounty.amount as string,
    },
  ], {
    amount: [
      {
        amount: "22500",
        denom: "uphoton",
      },
    ],
    gas: "100000",
  }, "TG Bounty reward");
  if (result.code !== 0) {
    throw new Error(`Failed to send tokens: ${result.rawLog}`);
  }
  const completedAt = Date.now();
  database.prepare("UPDATE bounties SET completed = 1, completed_at = ?, recipient = ? WHERE id = ?").run(completedAt, recipient, id);
  return result.transactionHash;
};
export {
  database,
};
