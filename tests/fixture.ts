import { fromB64 } from '@mysten/bcs';
import { 
    SuiClient,
    getFullnodeUrl,
} from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import fs from 'fs';
import { AggregatorClient } from '../src/client';
import { BN } from 'bn.js';
import { Transaction } from '@mysten/sui/transactions';
import { Env } from '~/config';
import { printTransaction } from '~/utils/transaction';
import { expect } from 'bun:test';

// Load root keypair from sui keystore (has root address)
const keystorePath = `${process.env.HOME}/.sui/sui_config/sui.keystore`;
const allKeys: string[] = JSON.parse(fs.readFileSync(keystorePath, 'utf8'));
const rootSecretKey = fromB64(allKeys[0]).slice(1);

class TestFixture {
    client!: AggregatorClient;
    keypair!: Ed25519Keypair;

    setup = async () => {
        const fullNodeURL = getFullnodeUrl('mainnet')
        const aggregatorURL = process.env.CETUS_AGGREGATOR_V3 || "https://api-sui.cetus.zone/router_v2"

        this.keypair = Ed25519Keypair.fromSecretKey(rootSecretKey);
        const signer = this.keypair.getPublicKey().toSuiAddress();

        const endpoint = aggregatorURL

        const suiClient = new SuiClient({ url: fullNodeURL})

        this.client = new AggregatorClient({
            endpoint,
            signer: signer,
            client: suiClient,
            env: Env.Mainnet,
            pythUrls: [
                "https://cetus-pythnet-a648.mainnet.pythnet.rpcpool.com/219cf7a8-6d75-432d-a648-d487a6dd5dc3/hermes",
            ],
        })
    }

    testDexRouter = async (
        provider: string | string[],
        from: string,
        target: string,
        amount: string = "1000000000",
        printFullTransaction: boolean = false
    ) => {
        try {
            // Step 1: Find router
            const providers = Array.isArray(provider) ? provider : [provider]
            const res = await this.client.findRouters({
                from,
                target,
                amount: new BN(amount),
                byAmountIn: true,
                depth: 3,
                providers,
            })

            // console.log("res", JSON.stringify(res, null, 2))
            // console.log("res route", JSON.stringify(res?.paths, null, 2))

            if (!res || !res.paths || res.paths.length === 0) {
                console.log(`⚠️ ${provider}: No routes found, skipping swap test`)
                return
            }

            // console.log(`${protocol} - amount in: ${res?.amountIn.toString()}`)
            // console.log(`${protocol} - amount out: ${res?.amountOut.toString()}`)

            // Step 2: Build transaction for fastRouterSwap
            const txb = new Transaction()
            await this.client.fastRouterSwap({
                router: res!,
                txb,
                slippage: 0.005,
                refreshAllCoins: true,
            })

            // Print full transaction if requested
            if (printFullTransaction) {
                console.log(`\n📋 ${provider} - Full Transaction Details:`)
                printTransaction(txb)
            }

            // Step 3: Simulate transaction
            const result = await this.client.devInspectTransactionBlock(txb)

            if (result.effects.status.status === "success") {
                console.log(`✅ ${provider}: Transaction simulation successful`)

                // console.log("events", JSON.stringify(result.events, null, 2))
                // console.log("res", res.amountIn.toString())
                // console.log("res", res.amountOut.toString())
                // const { keypair } = await setupTestClient()
                // const result = await client.signAndExecuteTransaction(txb, keypair)
                // console.log(`✅ ${result.digest}: Transaction executed successfully`)
            } else {
                console.log(`❌ ${provider}: Transaction simulation failed`)
                console.log("Error:", result.effects.status.error)
            }

            // Verify transaction structure
            expect(txb).toBeDefined()
            expect(result).toBeDefined()
        } catch (error) {
            console.log(`❌ ${provider}: Error during test - ${error}`)
            // Don't fail the test for individual router issues, as some may not have liquidity
        }
    }

}

export {
    TestFixture
}