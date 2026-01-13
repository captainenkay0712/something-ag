module aggregator::aggregator_errors {
    const E_AMOUNT_OUT_SLIPPAGE_CHECK_FAILED: u64 = 1;
    const E_REMAINS_BALANCE: u64 = 2;
    const E_AMOUNT_IN_IS_ZERO: u64 = 3;
    const E_INVALID_FEE_RECIPIENT: u64 = 4;
    const E_TOO_LARGE_FEE_RATE: u64 = 5;
    const E_NOT_SUPPORT_B2A: u64 = 6;

    public fun amount_out_slippage_check_failed(): u64 {
        E_AMOUNT_OUT_SLIPPAGE_CHECK_FAILED
    }
    
    public fun remains_balance(): u64 {
        E_REMAINS_BALANCE
    }
    
    public fun amount_in_is_zero(): u64 {
        E_AMOUNT_IN_IS_ZERO
    }
    
    public fun invalid_fee_recipient(): u64 {
        E_INVALID_FEE_RECIPIENT
    }
    
    public fun too_large_fee_rate(): u64 {
        E_TOO_LARGE_FEE_RATE
    }
    
    public fun not_support_b2a(): u64 {
        E_NOT_SUPPORT_B2A
    }
}
