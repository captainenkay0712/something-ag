import {
  Transaction,
  TransactionArgument,
  TransactionObjectArgument,
} from "@mysten/sui/transactions"
import {
    FindRouterParams,
    Path,
    RouterData,
} from "./types/shared"
import {
    getRouterResult,
    processFlattenRoutes,
} from "./api"
import { CalculateAmountLimit, CalculateAmountLimitBN } from "./math"
import { CoinUtils } from "./types/CoinAssist"
import * as Constants from "./const"
import { DexRouter } from "./movecall"
import { CetusRouter } from "./movecall/cetus"
import { BluefinRouter } from "./movecall/bluefin"
import {
    newSwapContext,
    confirmSwap,
    transferOrDestroyCoin,
    takeBalance,
    transferBalance,
} from "./movecall/router"
import { coinWithBalance } from "@mysten/sui/transactions"
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client"
import { BN } from "bn.js"
import { Env } from "./config"
import {
    SuiPriceServiceConnection,
    SuiPythClient,
} from "@pythnetwork/pyth-sui-js"
import { Signer } from "@mysten/sui/dist/cjs/cryptography"

export const CETUS = "CETUS"
export const BLUEFIN = "BLUEFIN"
export const DEFAULT_ENDPOINT = ""

export const ALL_DEXES = [
    CETUS,
    BLUEFIN,
]

type BuildRouterSwapParams = {
    router: RouterData
    inputCoin: TransactionObjectArgument
    slippage: number
    txb: Transaction
    // @deprecated Partner parameter in constructor is deprecated. The partner parameter in swap methods will take precedence if both are set.
    partner?: string
    // This parameter is used to pass the Deep token object. When using the DeepBook V3 provider,
    // users must pay fees with Deep tokens in non-whitelisted pools.
    // deepbookv3DeepFee?: TransactionObjectArgument
    fixable?: boolean
}

type BuildFastRouterSwapParams = {
    router: RouterData
    slippage: number
    txb: Transaction
    // @deprecated Partner parameter in constructor is deprecated. The partner parameter in swap methods will take precedence if both are set.
    partner?: string
    refreshAllCoins?: boolean
    payDeepFeeAmount?: number
}

const findPythPriceIDs = (paths: Path[]): string[] => {
    const priceIDs = new Set<string>()

    return Array.from(priceIDs)
}

export type AggregatorClientParams = {
    endpoint?: string
    signer?: string
    client?: SuiClient
    env?: Env
    pythUrls?: string[]
    apiKey?: string
    partner?: string
    overlayFeeRate?: number
    overlayFeeReceiver?: string
}

interface PythConfig {
    wormholeStateId: string
    pythStateId: string
}

export class AggregatorClient {
    public endpoint: string
    public signer: string
    public client: SuiClient
    public env: Env
    public apiKey: string

    protected pythConnections: SuiPriceServiceConnection[]
    protected pythClient: SuiPythClient
    protected overlayFeeRate: number
    protected overlayFeeReceiver: string
    protected partner?: string

    private static readonly CONFIG: Record<Env, PythConfig> = {
        [Env.Testnet]: {
        wormholeStateId:
            "0x31358d198147da50db32eda2562951d53973a0c0ad5ed738e9b17d88b213d790",
        pythStateId:
            "0x243759059f4c3111179da5878c12f68d612c21a8d54d85edc86164bb18be1c7c",
        },
        [Env.Mainnet]: {
        wormholeStateId:
            "0xaeab97f96cf9877fee2883315d459552b2b921edc16d7ceac6eab944dd88919c",
        pythStateId:
            "0x1f9310238ee9298fb703c3419030b35b22bb1cc37113e3bb5007c99aec79e5b8",
        },
    }

    constructor(params: AggregatorClientParams) {
            this.endpoint = params.endpoint || DEFAULT_ENDPOINT
            this.client = params.client || new SuiClient({ url: getFullnodeUrl("mainnet") })
            this.signer = params.signer || ""
            this.env = params.env || Env.Mainnet

            const config = AggregatorClient.CONFIG[this.env]
            this.pythConnections = this.newPythClients(params.pythUrls ?? [])
            this.pythClient = new SuiPythClient(
            this.client,
                config.pythStateId,
                config.wormholeStateId
            )
            this.apiKey = params.apiKey || ""
            this.partner = params.partner

            // Override overlay fee rate calculation
            if (params.overlayFeeRate) {
                if (
                    params.overlayFeeRate > 0 &&
                    params.overlayFeeRate <= Constants.CLIENT_CONFIG.MAX_OVERLAY_FEE_RATE
                ) {
                    // Convert to contract format (multiply by 1000000 as per REFACTOR.md)
                    this.overlayFeeRate = params.overlayFeeRate * Constants.AGGREGATOR_CONFIG.FEE_DENOMINATOR

                    // Validate against contract's MAX_FEE_RATE
                    if (this.overlayFeeRate > Constants.AGGREGATOR_CONFIG.MAX_FEE_RATE) {
                        throw new Error(
                            Constants.CLIENT_CONFIG.ERRORS.INVALID_OVERLAY_FEE_RATE
                        )
                    }
                } else {
                    throw new Error(Constants.CLIENT_CONFIG.ERRORS.INVALID_OVERLAY_FEE_RATE)
                }
            } else {
                this.overlayFeeRate = 0
            }
            this.overlayFeeReceiver = params.overlayFeeReceiver ?? Constants.CLIENT_CONFIG.DEFAULT_OVERLAY_FEE_RECEIVER
    }

    newPythClients(pythUrls: string[]) {
        if (!pythUrls.includes("https://hermes.pyth.network")) {
            pythUrls.push("https://hermes.pyth.network")
        }

        const connections = pythUrls.map(
            url => new SuiPriceServiceConnection(url, { timeout: 3000 })
        )
        return connections
    }

    getOneCoinUsedToMerge = async (coinType: string): Promise<string | null> => {
        try {
            const gotCoin = await this.client.getCoins({
                owner: this.signer,
                coinType,
                limit: 1,
            })
            if (gotCoin.data.length === 1) {
                return gotCoin.data[0].coinObjectId
            }
            return null
        } catch (error) {
            return null
        }
    }

    findRouters = async (params: FindRouterParams): Promise<RouterData | null> => {
        return getRouterResult(
            this.endpoint,
            this.apiKey,
            params,
            this.overlayFeeRate,
            this.overlayFeeReceiver
        )
    }
    newDexRouter(
        provider: string,
        pythPriceIDs: Map<string, string>,
        partner?: string
    ): DexRouter {
        switch (provider) {
        case CETUS:
            return new CetusRouter(this.env, partner)
        case BLUEFIN:
            return new BluefinRouter(this.env)
        default:
            throw new Error(
            `${Constants.CLIENT_CONFIG.ERRORS.UNSUPPORTED_DEX} ${provider}`
            )
        }
    }

    expectInputSwap(
        txb: Transaction,
        inputCoin: TransactionObjectArgument,
        routerData: RouterData,
        expectAmountOut: string,
        amountOutLimit: string,
        pythPriceIDs: Map<string, string>,
        partner?: string
    ): TransactionObjectArgument {
        if (routerData.quoteID == null) {
            throw new Error(Constants.CLIENT_CONFIG.ERRORS.QUOTE_ID_REQUIRED)
        }

        // Step 1: Flatten and sort routes for V3 execution
        const processedData = processFlattenRoutes(routerData)

        const swapCtx = newSwapContext(
            {
                quoteID: processedData.quoteID,
                fromCoinType: processedData.fromCoinType,
                targetCoinType: processedData.targetCoinType,
                expectAmountOut,
                amountOutLimit,
                inputCoin,
                feeRate: this.overlayFeeRate,
                feeRecipient: this.overlayFeeReceiver,
                packages: processedData.packages,
            },
            txb
        )

        // Step 2: Execute swaps in flattened order using V3 routers only
        let dexRouters = new Map<string, DexRouter>()
        for (const flattenedPath of processedData.flattenedPaths) {
            const path = flattenedPath.path
            if (!dexRouters.has(path.provider)) {
                dexRouters.set(
                    path.provider,
                    this.newDexRouter(path.provider, pythPriceIDs, partner)
                )
            }
            const dex = dexRouters.get(path.provider)!
            dex.swap(txb, flattenedPath, swapCtx, { pythPriceIDs })
        }


        const outputCoin = confirmSwap(
            {
                swapContext: swapCtx,
                targetCoinType: processedData.targetCoinType,
                packages: processedData.packages,
            },
            txb
        )

        return outputCoin
    }

    expectOutputSwap(
        txb: Transaction,
        inputCoin: TransactionObjectArgument,
        routerData: RouterData,
        amountOut: string,
        _amountLimit: string, // it will set when build inputcoin
        partner?: string
    ): TransactionObjectArgument {
        const receipts: TransactionObjectArgument[] = []
        const dex = new CetusRouter(this.env, partner)
        const processedData = processFlattenRoutes(routerData)
        const swapCtx = newSwapContext(
            {
                quoteID: processedData.quoteID,
                fromCoinType: processedData.fromCoinType,
                targetCoinType: processedData.targetCoinType,
                expectAmountOut: amountOut,
                amountOutLimit: amountOut, // amountOutLimit equals expectAmountOut when fix amout out
                inputCoin,
                feeRate: this.overlayFeeRate,
                feeRecipient: this.overlayFeeReceiver,
                packages: processedData.packages,
            },
            txb
        )

        // Record all from token first exist index
        // key: from token, value: path index
        const firstCoinRecord = recordFirstCoinIndex(routerData.paths)

        let needRepayRecord = new Map<string, TransactionArgument>()
        let payRecord = new Map<string, bigint>()

        for (let j = routerData.paths.length - 1; j >= 0; j--) {
        const path = routerData.paths[j]
        const firstFromTokenIndex = firstCoinRecord.get(path.from)
        let amountArg: TransactionArgument
        if (
            j !== firstFromTokenIndex ||
            path.target === processedData.targetCoinType
        ) {
            if (path.target !== processedData.targetCoinType) {
                let payAmount = BigInt(path.amountOut)
                if (payRecord.has(path.target)) {
                    const oldPayAmount = payRecord.get(path.target)!
                    payAmount = oldPayAmount + payAmount
                }
                payRecord.set(path.target, payAmount)
            }

            amountArg = txb.pure.u64(
                path.amountOut.toString()
            ) as TransactionArgument
        } else {
            if (!needRepayRecord.has(path.target)) {
                throw Error("no need repay record")
            }

            if (payRecord.has(path.target)) {
                // total need repay - payRecord
                const oldPayAmount = payRecord.get(path.target)!
                const oldNeedRepay = needRepayRecord.get(path.target)!
                amountArg = dex.sub(
                    txb,
                    oldNeedRepay,
                    txb.pure.u64(oldPayAmount),
                    path.publishedAt!
                )
            } else {
                // total need repay
                amountArg = needRepayRecord.get(path.target)!
            }
        }

        const flashSwapResult = dex.flashSwapFixedOutput(
            txb,
            path,
            amountArg,
            swapCtx
        )
        receipts.unshift(flashSwapResult.flashReceipt)
        if (needRepayRecord.has(path.from)) {
            const oldNeedRepay = needRepayRecord.get(path.from)!
            needRepayRecord.set(
            path.from,
            dex.add(
                txb,
                oldNeedRepay,
                flashSwapResult.repayAmount,
                path.publishedAt!
            )
            )
        } else {
            needRepayRecord.set(path.from, flashSwapResult.repayAmount)
        }
        }

        for (let j = 0; j < routerData.paths.length; j++) {
            const path = routerData.paths[j]
            dex.repayFlashSwapFixedOutput(txb, path, swapCtx, receipts[j])
        }

        const remainInputBalance = takeBalance(
            {
                coinType: processedData.fromCoinType,
                amount: Constants.U64_MAX,
                swapCtx,
                packages: processedData.packages,
            },
            txb
        )

        transferBalance(
            {
                balance: remainInputBalance,
                coinType: processedData.fromCoinType,
                recipient: this.signer,
                packages: processedData.packages,
            },
            txb
        )

        const outputCoin = confirmSwap(
            {
                swapContext: swapCtx,
                targetCoinType: processedData.targetCoinType,
                packages: processedData.packages,
            },
            txb
        )

        return outputCoin
    }

    routerSwap = async (
        params: BuildRouterSwapParams
    ): Promise<TransactionObjectArgument> => {
        const { router, inputCoin, slippage, txb, partner } = params

        if (slippage > 1 || slippage < 0) {
            throw new Error(Constants.CLIENT_CONFIG.ERRORS.INVALID_SLIPPAGE)
        }
        
        if (
            !params.router.packages ||
            !params.router.packages.get(Constants.PACKAGE_NAMES.AGGREGATOR)
        ) {
            throw new Error(Constants.CLIENT_CONFIG.ERRORS.PACKAGES_REQUIRED)
        }

        const byAmountIn = params.router.byAmountIn
        const amountIn = router.amountIn
        const amountOut = router.amountOut

        checkOverlayFeeConfig(this.overlayFeeRate, this.overlayFeeReceiver)
        let overlayFee = new BN(0)
        if (byAmountIn) {
            overlayFee = amountOut
                .mul(new BN(this.overlayFeeRate))
                .div(new BN(1000000))
        } else {
            overlayFee = amountIn
                .mul(new BN(this.overlayFeeRate))
                .div(new BN(1000000))
        }

        const expectedAmountOut = byAmountIn ? amountOut.sub(overlayFee) : amountOut
        const expectedAmountIn = byAmountIn ? amountIn : amountIn.add(overlayFee)

        const amountLimit = CalculateAmountLimitBN(
            byAmountIn ? expectedAmountOut : expectedAmountIn,
            byAmountIn,
            slippage
        )

        const priceIDs = findPythPriceIDs(router.paths)
        const priceInfoObjectIds = priceIDs.length > 0
            ? await this.updatePythPriceIDs(priceIDs, txb)
            : new Map<string, string>()

        if (byAmountIn) {
            return this.expectInputSwap(
                txb,
                inputCoin,
                router,
                amountOut.toString(),
                amountLimit.toString(),
                priceInfoObjectIds,
                partner ?? this.partner
            )
        } else {
            return this.expectOutputSwap(
                txb,
                inputCoin,
                router,
                amountOut.toString(),
                amountLimit.toString(),
                partner ?? this.partner
            )
        }
    }

    // auto build input coin
    // auto merge, transfer or destory target coin.
    fastRouterSwap = async (params: BuildFastRouterSwapParams) => {
        const { router, slippage, txb, partner, payDeepFeeAmount } = params

        const fromCoinType = router.paths[0].from
        const targetCoinType = router.paths[router.paths.length - 1].target
        const byAmountIn = router.byAmountIn

        checkOverlayFeeConfig(this.overlayFeeRate, this.overlayFeeReceiver)
        let overlayFee = 0
        if (byAmountIn) {
            overlayFee = Number(
                router.amountOut
                    .mul(new BN(this.overlayFeeRate))
                    .div(new BN(1000000))
                    .toString()
            )
        } else {
            overlayFee = Number(
                router.amountIn
                    .mul(new BN(this.overlayFeeRate))
                    .div(new BN(1000000))
                    .toString()
            )
        }

        const expectedAmountOut = byAmountIn
            ? router.amountOut.sub(new BN(overlayFee))
            : router.amountOut

        const expectedAmountIn = byAmountIn
            ? router.amountIn
            : router.amountIn.add(new BN(overlayFee))

        const amountLimit = CalculateAmountLimit(
            byAmountIn ? expectedAmountOut : expectedAmountIn,
            byAmountIn,
            slippage
        )

        const amount = byAmountIn ? expectedAmountIn : amountLimit

        let inputCoin = coinWithBalance({
            balance: BigInt(amount.toString()),
            useGasCoin: true,
            type: fromCoinType,
        })

        // let deepCoin
        // if (payDeepFeeAmount && payDeepFeeAmount > 0) {
        //     deepCoin = coinWithBalance({
        //         balance: BigInt(payDeepFeeAmount),
        //         type: this.deepbookv3DeepFeeType(),
        //     })
        // }

        const routerSwapParams: BuildRouterSwapParams = {
            router,
            inputCoin,
            slippage,
            txb,
            partner: partner ?? this.partner,
            // deepbookv3DeepFee: deepCoin,
        }

        const targetCoin = await this.routerSwap(routerSwapParams)

        if (CoinUtils.isSuiCoin(targetCoinType)) {
            txb.mergeCoins(txb.gas, [targetCoin])
        } else {
            const targetCoinObjID = await this.getOneCoinUsedToMerge(targetCoinType)
            if (targetCoinObjID != null) {
                txb.mergeCoins(txb.object(targetCoinObjID), [targetCoin])
            } else {
                transferOrDestroyCoin(
                    {
                        coin: targetCoin,
                        coinType: targetCoinType,
                        packages: router.packages,
                    },
                    txb
                )
            }
        }
    }

    updatePythPriceIDs = async (
        priceIDs: string[],
        txb: Transaction
    ): Promise<Map<string, string>> => {
        let priceUpdateData: Buffer[] | null = null
        let lastError: Error | null = null

        for (const connection of this.pythConnections) {
            try {
                priceUpdateData = await connection.getPriceFeedsUpdateData(priceIDs)
                break
            } catch (e) {
                lastError = e as Error
                console.log("Error: ", e)
                continue
            }
        }

        if (priceUpdateData == null) {
            throw new Error(
                `All Pyth price nodes are unavailable. Cannot fetch price data. Please switch to or add new available Pyth nodes. Detailed error: ${lastError?.message}`
            )
        }

        let priceInfoObjectIds = []
        try {
            priceInfoObjectIds = await this.pythClient.updatePriceFeeds(
                txb,
                priceUpdateData,
                priceIDs
            )
        } catch (e) {
            throw new Error(
                `All Pyth price nodes are unavailable. Cannot fetch price data. Please switch to or add new available Pyth nodes in the pythUrls parameter when initializing AggregatorClient, for example: new AggregatorClient({ pythUrls: ["https://your-pyth-node-url"] }). Detailed error: ${e}`
            )
        }

        let priceInfoObjectIdsMap = new Map<string, string>()
        for (let i = 0; i < priceIDs.length; i++) {
            priceInfoObjectIdsMap.set(priceIDs[i], priceInfoObjectIds[i])
        }
        return priceInfoObjectIdsMap
    }

    devInspectTransactionBlock = async (txb: Transaction) => {
        const res = await this.client.devInspectTransactionBlock({
            transactionBlock: txb,
            sender: this.signer,
        })

        return res
    }

    sendTransaction = async (txb: Transaction, signer: Signer) => {
        const res = await this.client.signAndExecuteTransaction({
            transaction: txb,
            signer,
        })
        return res
    }
}

const recordFirstCoinIndex = (paths: Path[]): Map<string, number> => {
    let newCoinRecord = new Map<string, number>()
    for (let i = 0; i < paths.length; i++) {
        if (!newCoinRecord.has(paths[i].from)) {
            newCoinRecord.set(paths[i].from, i)
        }
    }
    return newCoinRecord
}

const checkOverlayFeeConfig = (
    overlayFeeRate: number,
    overlayFeeReceiver: string
) => {
    if (overlayFeeRate > Constants.CLIENT_CONFIG.MAX_OVERLAY_FEE_RATE_NUMERATOR) {
        throw new Error(Constants.CLIENT_CONFIG.ERRORS.INVALID_OVERLAY_FEE_RATE)
    }
    if (overlayFeeReceiver === "0x0" && overlayFeeRate > 0) {
        throw new Error(
            Constants.CLIENT_CONFIG.ERRORS.OVERLAY_FEE_RECEIVER_REQUIRED
        )
    }
}

export {
    BuildRouterSwapParams,
    BuildFastRouterSwapParams
}