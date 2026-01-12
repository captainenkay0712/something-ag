import { BN } from "bn.js"
import JSONbig from "json-bigint"
import { ZERO } from "./const"
import {
    AggregatorServerErrorCode,
    getAggregatorServerErrorMessage,
} from "./errors"
import { completionCoin } from "./utils/coin"
import { ProcessedRouterData, FlattenedPath, FindRouterParams, RouterData, Path } from "./types/shared"

const SDK_VERSION = 1010106

const parseRouterResponse = (data: any, byAmountIn: boolean): RouterData => {
    // Parse packages map from API response
    let packages = new Map<string, string>()
    if (data.packages) {
        if (data.packages instanceof Map) {
            packages = data.packages
        } else if (typeof data.packages === "object") {
            // Convert object to Map
            Object.entries(data.packages).forEach(([key, value]) => {
                packages.set(key, value as string)
            })
        }
    }

    const allPaths: Path[] = data.routes.flatMap((route: any) =>
        route.path.map((p: any) => {
            let published_at: string;

            switch (p.provider) {
                case "CETUS":
                    published_at = "0x721d950e57259cd97d41010887ab502ee7753b0a3deb4b6a80099aad0c833928";
                    break;

                case "BLUEFIN":
                    published_at = "0x4e7c4ba436f8fd5b3c6bb514880ccd11c5109c83c45b5e037394b94204dbbb80";
                    break;

                default:
                    throw new Error(`Provider not supported: ${p.provider}`);
            }

            return { ...p, published_at };
        })
    );


    return {
        quoteID: data.request_id || "",
        amountIn: new BN(data.amount_in.toString()),
        amountOut: new BN(data.amount_out.toString()),
        byAmountIn,
        insufficientLiquidity: false,
        deviationRatio: data.deviation_ratio,
        packages,
        paths: allPaths.map((path: any) => ({
            id: path.id,
            direction: path.direction,
            provider: path.provider,
            from: path.from,
            target: path.target,
            feeRate: path.fee_rate,
            amountIn: path.amount_in.toString(),
            amountOut: path.amount_out.toString(),
            version: path.version,
            publishedAt: path.published_at,
            extendedDetails: path.extended_details,
        })),
    }
}

const getRouterResult = async (
    endpoint: string,
    apiKey: string,
    params: FindRouterParams,
    overlayFee: number,
    overlayFeeReceiver: string
): Promise<RouterData | null> => {
    let response;
    if (params.liquidityChanges && params.liquidityChanges.length > 0) {
        response = await postRouterWithLiquidityChanges(endpoint, params)
    } else {
        response = await getRouter(endpoint, apiKey, params)
    }

    if (!response) {
        return null
    }

    if (!response.ok) {
        let errorCode = AggregatorServerErrorCode.NumberTooLarge
        if (response.status === 429) {
            errorCode = AggregatorServerErrorCode.RateLimitExceeded
        }

        return {
            quoteID: "",
            amountIn: ZERO,
            amountOut: ZERO,
            paths: [],
            byAmountIn: params.byAmountIn,
            insufficientLiquidity: false,
            deviationRatio: 0,
            error: {
                code: errorCode,
                msg: getAggregatorServerErrorMessage(errorCode),
            },
        }
    }
    const data = JSONbig.parse(await response.text())
    const insufficientLiquidity = data.msg === "liquidity is not enough"

    if (data.msg && data.msg.indexOf("HoneyPot scam") > -1) {
        return {
            quoteID: "",
            amountIn: ZERO,
            amountOut: ZERO,
            paths: [],
            byAmountIn: params.byAmountIn,
            insufficientLiquidity,
            deviationRatio: 0,
            error: {
                code: AggregatorServerErrorCode.HoneyPot,
                msg: getAggregatorServerErrorMessage(
                    AggregatorServerErrorCode.HoneyPot
                ),
            },
        }
    }

    if (data.data != null) {
        const res = parseRouterResponse(data.data, params.byAmountIn)
        if (overlayFee > 0 && overlayFeeReceiver !== "0x0") {
        if (params.byAmountIn) {
            const overlayFeeAmount = res.amountOut
                .mul(new BN(overlayFee))
                .div(new BN(1000000))
            res.overlayFee = Number(overlayFeeAmount.toString())
            res.amountOut = res.amountOut.sub(overlayFeeAmount)
        } else {
            const overlayFeeAmount = res.amountIn
                .mul(new BN(overlayFee))
                .div(new BN(1000000))
                res.overlayFee = Number(overlayFeeAmount.toString())
                res.amountIn = res.amountIn.add(overlayFeeAmount)
            }
        }

        // Ensure packages map is initialized for V3 compatibility and add default aggregator package
        if (!res.packages) {
            res.packages = new Map<string, string>()
        }

        // Add default aggregator package if missing
        if (!res.packages.has("aggregator_v3")) {
            res.packages.set(
                "aggregator_v3",
                "0x3864c7c59a4889fec05d1aae4bc9dba5a0e0940594b424fbed44cb3f6ac4c032"
            )
        }

        return res
    }

    return {
        quoteID: "",
        amountIn: ZERO,
        amountOut: ZERO,
        paths: [],
        insufficientLiquidity,
        byAmountIn: params.byAmountIn,
        deviationRatio: 0,
        error: {
            code: AggregatorServerErrorCode.InsufficientLiquidity,
            msg: getAggregatorServerErrorMessage(
                AggregatorServerErrorCode.InsufficientLiquidity
            ),
        },
    }
}

const getRouter = async (
    endpoint: string,
    apiKey: string,
    params: FindRouterParams
) => {
    try {
        const {
            from,
            target,
            amount,
            byAmountIn,
            depth,
            splitAlgorithm,
            splitFactor,
            splitCount,
            providers,
        } = params
        const fromCoin = completionCoin(from)
        const targetCoin = completionCoin(target)

        let url = `${endpoint}/find_routes?from=${fromCoin}&target=${targetCoin}&amount=${amount.toString()}&by_amount_in=${byAmountIn}`

        if (depth) {
            url += `&depth=${depth}`
        }

        if (splitAlgorithm) {
            url += `&split_algorithm=${splitAlgorithm}`
        }

        if (splitFactor) {
            url += `&split_factor=${splitFactor}`
        }

        if (splitCount) {
            url += `&split_count=${splitCount}`
        }

        if (providers) {
            if (providers.length > 0) {
                url += `&providers=${providers.join(",")}`
            }
        }

        if (apiKey.length > 0) {
            url += `&apiKey=${apiKey}`
        }

        // set newest sdk version
        url += `&v=${SDK_VERSION}`

        const response = await fetch(url)
        
        return response
    } catch (error) {
        console.error(error)
        return null
    }
}

const postRouterWithLiquidityChanges = async (
    endpoint: string,
    params: FindRouterParams
) => {
    const {
        from,
        target,
        amount,
        byAmountIn,
        depth,
        splitAlgorithm,
        splitFactor,
        splitCount,
        providers,
        liquidityChanges,
    } = params

    const fromCoin = completionCoin(from)
    const targetCoin = completionCoin(target)
    const url = `${endpoint}/find_routes`
    const providersStr = providers?.join(",")
    const requestData = {
        from: fromCoin,
        target: targetCoin,
        amount: Number(amount.toString()),
        by_amount_in: byAmountIn,
        depth,
        split_algorithm: splitAlgorithm,
        split_factor: splitFactor,
        split_count: splitCount,
        providers: providersStr,
        liquidity_changes: liquidityChanges!.map(change => ({
            pool: change.poolID,
            tick_lower: change.ticklower,
            tick_upper: change.tickUpper,
            delta_liquidity: change.deltaLiquidity,
        })),
        v: SDK_VERSION,
    }

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(requestData),
        })

        return response
    } catch (error) {
        console.error("Error:", error)
        return null
    }
}

export function processFlattenRoutes(
    routerData: RouterData
): ProcessedRouterData {
    const paths = routerData.paths
    const fromCoinType = paths[0].from
    const targetCoinType = paths[paths.length - 1].target

    const flattenedPaths: FlattenedPath[] = []

    // Build dependency relationships based on route sequences
    for (const path of paths) {
        flattenedPaths.push({
            path,
            isLastUseOfIntermediateToken: false,
        })
    }

    // Second pass: reverse traverse to mark the last usage of each intermediate token
    const seenTokens = new Map<string, boolean>()
    for (let i = flattenedPaths.length - 1; i >= 0; i--) {
        const { from } = flattenedPaths[i].path
        // Only track intermediate tokens (not the original input token)
        // and only mark if it's the first time we see this token in reverse order
        if (!seenTokens.has(from)) {
            seenTokens.set(from, true)
            flattenedPaths[i].isLastUseOfIntermediateToken = true
        }
    }

    return {
        quoteID: routerData.quoteID || "",
        amountIn: routerData.amountIn,
        amountOut: routerData.amountOut,
        byAmountIn: routerData.byAmountIn,
        flattenedPaths,
        fromCoinType,
        targetCoinType,
        packages: routerData.packages,
        totalDeepFee: routerData.totalDeepFee,
        error: routerData.error,
        overlayFee: routerData.overlayFee,
    }
}

export {
    getRouterResult
}