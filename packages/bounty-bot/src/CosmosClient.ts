import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { GasPrice, SigningStargateClient, DeliverTxResponse, Coin } from "@cosmjs/stargate";

export type SendTokensOptions = {
  gasPrice?: string; // e.g. "0.025uphoton"
  gas?: string; // e.g. "100000"
  memo?: string;
  feeAmount?: { amount: string; denom: string }[];
};

export class CosmosClient {
  private readonly mnemonic: string;
  private readonly addressPrefix: string;
  private readonly rpcEndpoint: string;

  constructor(mnemonic: string, rpcEndpoint: string = "https://atomone-rpc.allinbits.com/", addressPrefix: string = "atone") {
    this.mnemonic = mnemonic;
    this.addressPrefix = addressPrefix;
    this.rpcEndpoint = rpcEndpoint;
  }

  public async sendTokens(
    recipientAddress: string,
    amount: Coin[],
    options?: SendTokensOptions,
  ): Promise<{ txHash: string; raw: DeliverTxResponse }>
  {
    const signer = await DirectSecp256k1HdWallet.fromMnemonic(this.mnemonic, {
      prefix: this.addressPrefix,
    });
    const [account] = await signer.getAccounts();

    const gasPrice = GasPrice.fromString(options?.gasPrice || "0.025uphoton");
    const client = await SigningStargateClient.connectWithSigner(this.rpcEndpoint, signer, { gasPrice });

    const fee = {
      amount: options?.feeAmount || [{ amount: "22500", denom: "uphoton" }],
      gas: options?.gas || "100000",
    };

    const memo = options?.memo || "TG Bounty reward";
    const result = await client.sendTokens(account.address, recipientAddress, amount, fee, memo);

    if (result.code !== 0) {
      throw new Error(`Failed to send tokens: ${result.rawLog}`);
    }

    return { txHash: result.transactionHash, raw: result };
  }
}
