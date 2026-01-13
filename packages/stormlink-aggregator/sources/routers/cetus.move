module aggregator::cetus {
    use sui::balance::{Self, Balance};
    use sui::clock::Clock;
    
    use cetus_clmm::config::GlobalConfig;
    use cetus_clmm::pool::{Self, Pool, FlashSwapReceipt};
    use cetus_clmm::partner::Partner;
    use cetus_clmm::tick_math;
    
    use aggregator::router::{Self, SwapContext};
    
    const DEFAULT_PARTNER_ID: address = @0x0e753adcf1dbf8107f599046ff6e1635220a4ec6f010f68a9535413efe5e4f74;

    /// Maximum u64 value for unlimited amount
    const MAX_U64: u64 = 18446744073709551615;

    #[error]
    const ERROR_UNDERFLOW: vector<u8> = b"underflow";
    
    #[error]
    const ERROR_OVERFLOW: vector<u8> = b"overflow";
    
    public fun swap<CoinA, CoinB>(
        swap_ctx: &mut SwapContext,
        config: &GlobalConfig,
        pool: &mut Pool<CoinA, CoinB>,
        partner: &mut Partner,
        a_to_b: bool,
        amount_in: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        if (a_to_b) {
            swap_a2b<CoinA, CoinB>(swap_ctx, config, pool, partner, amount_in, clock, ctx);
        } else {
            swap_b2a<CoinA, CoinB>(swap_ctx, config, pool, partner, amount_in, clock, ctx);
        }
    }
        
    fun flash_swap<CoinA, CoinB>(
        config: &GlobalConfig,
        pool: &mut Pool<CoinA, CoinB>,
        partner: &Partner,
        amount: u64,
        a2b: bool,
        by_amount_in: bool,
        sqrt_price_limit: u128,
        clock: &Clock
    ): (Balance<CoinA>, Balance<CoinB>, FlashSwapReceipt<CoinA, CoinB>, u64) {
        let (balance_a, balance_b, receipt) = if (object::id_address(partner) == DEFAULT_PARTNER_ID) {
            pool::flash_swap<CoinA, CoinB>(
                config,
                pool,
                a2b,
                by_amount_in,
                amount,
                sqrt_price_limit,
                clock
            )
        } else {
            pool::flash_swap_with_partner<CoinA, CoinB>(
                config,
                pool,
                partner,
                a2b,
                by_amount_in,
                amount,
                sqrt_price_limit,
                clock
            )
        };
        
        let pay_amount = pool::swap_pay_amount(&receipt);
        (balance_a, balance_b, receipt, pay_amount)
    }

    public fun flash_swap_fixed_output<CoinA, CoinB>(
        swap_ctx: &mut SwapContext,
        config: &GlobalConfig,
        pool: &mut Pool<CoinA, CoinB>,
        partner: &Partner,
        amount_out: u64,
        a_to_b: bool,
        by_amount_in: bool,
        clock: &Clock
    ): (FlashSwapReceipt<CoinA, CoinB>, u64) {
        let sqrt_price_limit = if (a_to_b) {
            tick_math::min_sqrt_price()
        } else {
            tick_math::max_sqrt_price()
        };
        
        let (balance_a, balance_b, receipt, pay_amount) = flash_swap<CoinA, CoinB>(
            config,
            pool,
            partner,
            amount_out,
            a_to_b,
            by_amount_in,
            sqrt_price_limit,
            clock
        );
        
        if (balance::value(&balance_a) > 0) {
            router::merge_balance<CoinA>(swap_ctx, balance_a);
        } else {
            balance::destroy_zero(balance_a);
        };
        
        if (balance::value(&balance_b) > 0) {
            router::merge_balance<CoinB>(swap_ctx, balance_b);
        } else {
            balance::destroy_zero(balance_b);
        };
        
        if (a_to_b) {
            router::emit_swap_event<CoinA, CoinB>(
                swap_ctx,
                b"CETUS",
                object::id(pool),
                pay_amount,
                amount_out,
                0
            );
        } else {
            router::emit_swap_event<CoinB, CoinA>(
                swap_ctx,
                b"CETUS",
                object::id(pool),
                pay_amount,
                amount_out,
                0
            );
        };
        
        (receipt, pay_amount)
    }
    
    public fun repay_flash_swap_fixed_output<CoinA, CoinB>(
        swap_ctx: &mut SwapContext,
        config: &GlobalConfig,
        pool: &mut Pool<CoinA, CoinB>,
        partner: &mut Partner,
        a_to_b: bool,
        receipt: FlashSwapReceipt<CoinA, CoinB>
    ) {
        let pay_amount = pool::swap_pay_amount(&receipt);
        
        let (balance_a, balance_b) = if (a_to_b) {
            (
                router::take_balance<CoinA>(swap_ctx, pay_amount),
                balance::zero<CoinB>()
            )
        } else {
            (
                balance::zero<CoinA>(),
                router::take_balance<CoinB>(swap_ctx, pay_amount)
            )
        };
        
        let (remaining_a, remaining_b) = repay_flash_swap<CoinA, CoinB>(
            config,
            pool,
            partner,
            a_to_b,
            balance_a,
            balance_b,
            receipt
        );
        
        if (balance::value(&remaining_a) > 0) {
            router::merge_balance<CoinA>(swap_ctx, remaining_a);
        } else {
            balance::destroy_zero(remaining_a);
        };
        
        if (balance::value(&remaining_b) > 0) {
            router::merge_balance<CoinB>(swap_ctx, remaining_b);
        } else {
            balance::destroy_zero(remaining_b);
        };
    }
    
    public fun add(a: u64, b: u64): u64 {
        assert!(a <= MAX_U64 - b, ERROR_OVERFLOW);
        a + b
    }
    
    public fun sub(a: u64, b: u64): u64 {
        assert!(a >= b, ERROR_UNDERFLOW);
        a - b
    }
    
    fun repay_flash_swap<CoinA, CoinB>(
        config: &GlobalConfig,
        pool: &mut Pool<CoinA, CoinB>,
        partner: &mut Partner,
        a2b: bool,
        balance_a: Balance<CoinA>,
        balance_b: Balance<CoinB>,
        receipt: FlashSwapReceipt<CoinA, CoinB>
    ): (Balance<CoinA>, Balance<CoinB>) {
        let mut remaining_a = balance_a;
        let mut remaining_b = balance_b;
        
        let pay_amount = pool::swap_pay_amount(&receipt);
        
        let (pay_a, pay_b) = if (a2b) {
            (
                balance::split(&mut remaining_a, pay_amount),
                balance::zero<CoinB>()
            )
        } else {
            (
                balance::zero<CoinA>(),
                balance::split(&mut remaining_b, pay_amount)
            )
        };
        
        if (object::id_address(partner) == DEFAULT_PARTNER_ID) {
            pool::repay_flash_swap<CoinA, CoinB>(
                config,
                pool,
                pay_a,
                pay_b,
                receipt
            );
        } else {
            pool::repay_flash_swap_with_partner<CoinA, CoinB>(
                config,
                pool,
                partner,
                pay_a,
                pay_b,
                receipt
            );
        };
        
        (remaining_a, remaining_b)
    }
    
    fun swap_a2b<CoinA, CoinB>(
        swap_ctx: &mut SwapContext,
        config: &GlobalConfig,
        pool: &mut Pool<CoinA, CoinB>,
        partner: &mut Partner,
        amount_in: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let balance_in = router::take_balance<CoinA>(swap_ctx, amount_in);
        let actual_amount_in = balance::value(&balance_in);
        
        if (actual_amount_in == 0) {
            balance::destroy_zero(balance_in);
            return
        };
        
        let (balance_a_out, balance_b_out, receipt, _pay) = flash_swap<CoinA, CoinB>(
            config,
            pool,
            partner,
            actual_amount_in,
            true,
            true,
            tick_math::min_sqrt_price(),
            clock
        );
        
        let (remaining_a, remaining_b) = repay_flash_swap<CoinA, CoinB>(
            config,
            pool,
            partner,
            true,
            balance_in,
            balance::zero<CoinB>(),
            receipt
        );
        
        balance::destroy_zero(balance_a_out);
        balance::destroy_zero(remaining_b);
        
        let remaining_amount = balance::value(&remaining_a);
        let amount_out = balance::value(&balance_b_out);
        
        if (amount_in == router::max_amount_in()) {
            router::transfer_balance<CoinA>(remaining_a, tx_context::sender(ctx), ctx);
        } else {
            router::merge_balance<CoinA>(swap_ctx, remaining_a);
        };
        
        router::merge_balance<CoinB>(swap_ctx, balance_b_out);
        
        router::emit_swap_event<CoinA, CoinB>(
            swap_ctx,
            b"CETUS",
            object::id(pool),
            actual_amount_in - remaining_amount,
            amount_out,
            remaining_amount
        );
    }
    
    fun swap_b2a<CoinA, CoinB>(
        swap_ctx: &mut SwapContext,
        config: &GlobalConfig,
        pool: &mut Pool<CoinA, CoinB>,
        partner: &mut Partner,
        amount_in: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let balance_in = router::take_balance<CoinB>(swap_ctx, amount_in);
        let actual_amount_in = balance::value(&balance_in);
        
        if (actual_amount_in == 0) {
            balance::destroy_zero(balance_in);
            return
        };
        
        let (balance_a_out, balance_b_out, receipt, _pay) = flash_swap<CoinA, CoinB>(
            config,
            pool,
            partner,
            actual_amount_in,
            false,
            true,
            tick_math::max_sqrt_price(),
            clock
        );
        
        let (remaining_a, remaining_b) = repay_flash_swap<CoinA, CoinB>(
            config,
            pool,
            partner,
            false,
            balance::zero<CoinA>(),
            balance_in,
            receipt
        );
        
        balance::destroy_zero(balance_b_out);
        balance::destroy_zero(remaining_a);
        
        let remaining_amount = balance::value(&remaining_b);
        let amount_out = balance::value(&balance_a_out);
        
        if (amount_in == router::max_amount_in()) {
            router::transfer_balance<CoinB>(remaining_b, tx_context::sender(ctx), ctx);
        } else {
            router::merge_balance<CoinB>(swap_ctx, remaining_b);
        };
        
        router::merge_balance<CoinA>(swap_ctx, balance_a_out);
        
        router::emit_swap_event<CoinB, CoinA>(
            swap_ctx,
            b"CETUS",
            object::id(pool),
            actual_amount_in - remaining_amount,
            amount_out,
            remaining_amount
        );
    }
}