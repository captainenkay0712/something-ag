import BN from "bn.js"

// Core parameter interfaces
interface FindRouterParams {
    from: string
    target: string
    amount: BN
    byAmountIn: boolean
    depth?: number
    splitAlgorithm?: string
    splitFactor?: number
    splitCount?: number
    providers?: string[]
    liquidityChanges?: PreSwapLpChangeParams[]
}

interface PreSwapLpChangeParams {
    poolID: string
    ticklower: number
    tickUpper: number
    deltaLiquidity: number
}

// Extended details type with all V3 capabilities
export type ExtendedDetails = {
  // aftermath
  aftermath_pool_flatness?: number
  aftermath_lp_supply_type?: string
  // turbos
  turbos_fee_type?: string
  // cetus
  afterSqrtPrice?: string
  // deepbookv3
  deepbookv3DeepFee?: number
  // scallop
  scallopScoinTreasury?: string
  // Snake_case versions for API response
  scallop_scoin_treasury?: string
  // haedal
  haedal_pmm_base_price_seed?: string
  haedal_pmm_quote_price_seed?: string
  // haedal_hmm_v2
  haedalhmmv2_base_price_seed?: string
  // steamm
  steamm_bank_a?: string
  steamm_bank_b?: string
  steamm_lending_market?: string
  steamm_lending_market_type?: string
  steamm_btoken_a_type?: string
  steamm_btoken_b_type?: string
  steamm_lp_token_type?: string
  steamm_oracle_registry_id?: string
  steamm_oracle_pyth_price_seed_a?: string
  steamm_oracle_pyth_price_seed_b?: string
  steamm_oracle_index_a?: number
  steamm_oracle_index_b?: number

  // Snake_case versions for API response
  metastable_price_seed?: string
  metastable_eth_price_seed?: string
  metastable_whitelisted_app_id?: string
  metastable_create_cap_pkg_id?: string
  metastable_create_cap_module?: string
  metastable_create_cap_all_type_params?: boolean
  metastable_registry_id?: string
  // Snake_case versions for API response
  obric_coin_a_price_seed?: string
  obric_coin_b_price_seed?: string
  obric_coin_a_price_id?: string
  obric_coin_b_price_id?: string
  // Snake_case versions for V3 API response
  sevenk_coin_a_price_seed?: string
  sevenk_coin_b_price_seed?: string
  sevenk_oracle_config_a?: string
  sevenk_oracle_config_b?: string
  sevenk_lp_cap_type?: string
}

type Path = {
    id: string
    direction: boolean
    provider: string
    from: string
    target: string
    feeRate: number
    amountIn: string
    amountOut: string
    version?: string
    publishedAt?: string
    extendedDetails?: ExtendedDetails
}

type RouterError = {
    code: number
    msg: string
}

type RouterData = {
    quoteID?: string
    amountIn: BN
    amountOut: BN
    byAmountIn: boolean
    paths: Path[]
    insufficientLiquidity: boolean
    deviationRatio: number
    packages?: Map<string, string>
    totalDeepFee?: number
    error?: RouterError
    overlayFee?: number
}

// specific types for flattened route processing
export type FlattenedPath = {
    path: Path
    isLastUseOfIntermediateToken: boolean
}

export type ProcessedRouterData = {
    quoteID: string
    amountIn: BN
    amountOut: BN
    byAmountIn: boolean
    flattenedPaths: FlattenedPath[]
    fromCoinType: string
    targetCoinType: string
    packages?: Map<string, string>
    totalDeepFee?: number
    error?: RouterError
    overlayFee?: number
}

export {
    FindRouterParams, 
    Path,
    PreSwapLpChangeParams,
    RouterError,
    RouterData,
}
