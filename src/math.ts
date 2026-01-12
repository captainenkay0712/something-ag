// Calculate amount limit.
// If byAmountIn is true, the expectAmount means amountOut, otherwise means amountIn.
// `byAmountIn` means fixed amount in or out.

import BN from "bn.js"
import Decimal from "decimal.js"

// `slippage` is a percentage, for example, 0.01 means 1%.
const CalculateAmountLimit = (
    expectAmount: BN,
    byAmountIn: boolean,
    slippage: number
): number => {
    return Number(
        CalculateAmountLimitByDecimal(
            new Decimal(expectAmount.toString()),
            byAmountIn,
            slippage
        ).toFixed(0)
    )
}

// BN version of CalculateAmountLimit
const CalculateAmountLimitBN = (
    expectAmount: BN,
    byAmountIn: boolean,
    slippage: number
): BN => {
    const amountLimit = CalculateAmountLimitByDecimal(
        new Decimal(expectAmount.toString()),
        byAmountIn,
        slippage
    )
    return new BN(amountLimit.toFixed(0))
}

const CalculateAmountLimitByDecimal = (
    expectAmount: Decimal,
    byAmountIn: boolean,
    slippage: number
): Decimal => {
    if (byAmountIn) {
        return expectAmount.mul(1 - slippage)
    } else {
        return expectAmount.mul(1 + slippage)
    }
}

const MAX_SQER_PRICE_X64 = "79226673515401279992447579055"
const MIN_SQER_PRICE_X64 = "4295048016"

const GetDefaultSqrtPriceLimit = (a2b: boolean): BN => {
    if (a2b) {
        return new BN(MIN_SQER_PRICE_X64)
    } else {
        return new BN(MAX_SQER_PRICE_X64)
    }
}

const sqrtPriceX64ToPrice = (
    sqrtPriceStr: string,
    decimalsA: number,
    decimalsB: number
): Decimal => {
    const sqrtPriceX64 = new Decimal(sqrtPriceStr).mul(Decimal.pow(2, -64))
    return sqrtPriceX64.pow(2).mul(Decimal.pow(10, decimalsA - decimalsB))
}

export {
    CalculateAmountLimit,
    CalculateAmountLimitBN,
    GetDefaultSqrtPriceLimit,
    sqrtPriceX64ToPrice,
}