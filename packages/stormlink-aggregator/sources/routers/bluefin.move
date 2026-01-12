module stormlink_aggregator::bluefin {
    use sui::balance;
    use sui::clock::Clock;
    
    use bluefin_spot::config::GlobalConfig;
    use bluefin_spot::pool::{Self, Pool};
    
    use stormlink_aggregator::router::{Self, SwapContext};
    
    const MIN_SQRT_PRICE: u128 = 4295048017;
    
    const MAX_SQRT_PRICE: u128 = 79226673515401279992447579054;
    
    public fun swap<CoinA, CoinB>(
        swap_ctx: &mut SwapContext,
        config: &GlobalConfig,
        pool: &mut Pool<CoinA, CoinB>,
        a_to_b: bool,
        amount_in: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        if (a_to_b) {
            swap_a2b<CoinA, CoinB>(swap_ctx, config, pool, amount_in, clock, ctx);
        } else {
            swap_b2a<CoinA, CoinB>(swap_ctx, config, pool, amount_in, clock, ctx);
        }
    }
    
    fun swap_a2b<CoinA, CoinB>(
        swap_ctx: &mut SwapContext,
        config: &GlobalConfig,
        pool: &mut Pool<CoinA, CoinB>,
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
        
        let (balance_a_remaining, balance_b_out) = pool::swap<CoinA, CoinB>(
            clock,
            config,
            pool,
            balance_in,
            balance::zero<CoinB>(),
            true,
            true,
            actual_amount_in,
            0,
            MIN_SQRT_PRICE
        );
        
        let remaining_amount = balance::value(&balance_a_remaining);
        let amount_out = balance::value(&balance_b_out);
        
        if (amount_in == router::max_amount_in()) {
            router::transfer_balance<CoinA>(balance_a_remaining, ctx.sender(), ctx);
        } else {
            router::merge_balance<CoinA>(swap_ctx, balance_a_remaining);
        };
        
        router::merge_balance<CoinB>(swap_ctx, balance_b_out);
        
        router::emit_swap_event<CoinA, CoinB>(
            swap_ctx,
            b"BLUEFIN",
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
        
        let (balance_a_out, balance_b_remaining) = pool::swap<CoinA, CoinB>(
            clock,
            config,
            pool,
            balance::zero<CoinA>(),
            balance_in,
            false,
            true,
            actual_amount_in,
            0,
            MAX_SQRT_PRICE
        );
        
        let remaining_amount = balance::value(&balance_b_remaining);
        let amount_out = balance::value(&balance_a_out);
        
        if (amount_in == router::max_amount_in()) {
            router::transfer_balance<CoinB>(balance_b_remaining, ctx.sender(), ctx);
        } else {
            router::merge_balance<CoinB>(swap_ctx, balance_b_remaining);
        };
        
        router::merge_balance<CoinA>(swap_ctx, balance_a_out);
        
        router::emit_swap_event<CoinB, CoinA>(
            swap_ctx,
            b"BLUEFIN",
            object::id(pool),
            actual_amount_in - remaining_amount,
            amount_out,
            remaining_amount
        );
    }
}

