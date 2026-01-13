module aggregator::router {
    use std::string::String;
    use std::type_name::{Self, TypeName};
    
    use sui::bag::{Self, Bag};
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::event;
    
    use aggregator::aggregator_errors;

    /// Maximum fee rate: 10% (100000 / 1000000)
    const MAX_FEE_RATE: u32 = 100000;
    
    /// Fee rate denominator (1000000 = 100%)
    const FEE_RATE_DENOMINATOR: u128 = 1000000;
    
    /// Maximum u64 value for unlimited amount
    const MAX_U64: u64 = 18446744073709551615;

    public struct SwapContext {
        quote_id: String,
        from: TypeName,
        target: TypeName,
        amount_in: u64,
        expect_amount_out: u64,
        amount_out_limit: u64,
        fee_rate: u32,
        fee_recipient: address,
        balances: Bag,
    }
    
    public struct ConfirmSwapEvent has copy, drop {
        quote_id: String,
        from: TypeName,
        target: TypeName,
        amount_in: u64,
        amount_out: u64,
        fee_amount: u64,
        fee_rate: u32,
        fee_recipient: address,
        expect_amount_out: u64,
        amount_out_limit: u64,
    }
    
    public struct SwapEvent has copy, drop {
        quote_id: String,
        pool_id: ID,
        dex: String,
        from: TypeName,
        target: TypeName,
        amount_in: u64,
        amount_out: u64,
        amount_in_remaining: u64,
    }
    
    public fun confirm_swap<TargetCoin>(
        swap_ctx: SwapContext,
        ctx: &mut TxContext
    ): Coin<TargetCoin> {
        let SwapContext {
            quote_id,
            from,
            target,
            amount_in,
            expect_amount_out,
            amount_out_limit,
            fee_rate,
            fee_recipient,
            mut balances,
        } = swap_ctx;
        
        let mut target_balance = bag::remove<TypeName, Balance<TargetCoin>>(&mut balances, target);
        
        let fee_amount = if (fee_rate > 0 && fee_recipient != @0x0) {
            let balance_value = balance::value(&target_balance);
            let fee = (((balance_value as u128) * (fee_rate as u128) / FEE_RATE_DENOMINATOR) as u64);
            let fee_balance = balance::split(&mut target_balance, fee);
            transfer_balance(fee_balance, fee_recipient, ctx);
            fee
        } else {
            0
        };
        
        assert!(
            balance::value(&target_balance) >= amount_out_limit,
            aggregator_errors::amount_out_slippage_check_failed()
        );
        
        // Ensure all balances have been consumed
        assert!(bag::is_empty(&balances), aggregator_errors::remains_balance());
        bag::destroy_empty(balances);
        
        // Emit confirmation event
        event::emit(ConfirmSwapEvent {
            quote_id,
            from,
            target,
            amount_in,
            amount_out: balance::value(&target_balance),
            fee_amount,
            fee_rate,
            fee_recipient,
            expect_amount_out,
            amount_out_limit,
        });
        
        coin::from_balance(target_balance, ctx)
    }

    public fun max_amount_in(): u64 {
        MAX_U64
    }
    
    public fun emit_swap_event<FromCoin, TargetCoin>(
        swap_ctx: &SwapContext,
        dex_name: vector<u8>,
        pool_id: ID,
        amount_in: u64,
        amount_out: u64,
        amount_in_remaining: u64
    ) {
        event::emit(SwapEvent {
            quote_id: swap_ctx.quote_id,
            pool_id,
            dex: std::string::utf8(dex_name),
            from: type_name::with_defining_ids<FromCoin>(),
            target: type_name::with_defining_ids<TargetCoin>(),
            amount_in,
            amount_out,
            amount_in_remaining,
        });
    }

    public fun merge_balance<CoinType>(
        swap_ctx: &mut SwapContext,
        balance_to_merge: Balance<CoinType>
    ) {
        if (balance::value(&balance_to_merge) == 0) {
            balance::destroy_zero(balance_to_merge);
            return
        };
        
        let coin_type = type_name::with_defining_ids<CoinType>();
        
        if (bag::contains(&swap_ctx.balances, coin_type)) {
            let existing = bag::borrow_mut<TypeName, Balance<CoinType>>(&mut swap_ctx.balances, coin_type);
            balance::join(existing, balance_to_merge);
        } else {
            bag::add(&mut swap_ctx.balances, coin_type, balance_to_merge);
        }
    }

    public fun new_swap_context<FromCoin, TargetCoin>(
        quote_id: String,
        expect_amount_out: u64,
        amount_out_limit: u64,
        input_coin: Coin<FromCoin>,
        fee_rate: u32,
        fee_recipient: address,
        ctx: &mut TxContext
    ): SwapContext {
        let amount_in = coin::value(&input_coin);
        
        assert!(amount_in > 0, aggregator_errors::amount_in_is_zero());
        
        if (fee_rate > 0) {
            assert!(fee_recipient != @0x0, aggregator_errors::invalid_fee_recipient());
        };
        assert!(fee_rate <= MAX_FEE_RATE, aggregator_errors::too_large_fee_rate());
        
        let mut balances = bag::new(ctx);
        let from_type = type_name::with_defining_ids<FromCoin>();
        bag::add(&mut balances, from_type, coin::into_balance(input_coin));
        
        SwapContext {
            quote_id,
            from: from_type,
            target: type_name::with_defining_ids<TargetCoin>(),
            amount_in,
            expect_amount_out,
            amount_out_limit,
            fee_rate,
            fee_recipient,
            balances,
        }
    }

    public fun take_balance<CoinType>(
        swap_ctx: &mut SwapContext,
        amount: u64
    ): Balance<CoinType> {
        if (amount == 0) {
            return balance::zero<CoinType>()
        };
        
        let coin_type = type_name::with_defining_ids<CoinType>();
        
        if (!bag::contains(&swap_ctx.balances, coin_type)) {
            return balance::zero<CoinType>()
        };
        
        let stored_balance = bag::borrow_mut<TypeName, Balance<CoinType>>(&mut swap_ctx.balances, coin_type);
        
        if (balance::value(stored_balance) <= amount) {
            // Take entire balance
            bag::remove<TypeName, Balance<CoinType>>(&mut swap_ctx.balances, coin_type)
        } else {
            // Split and take requested amount
            balance::split(stored_balance, amount)
        }
    }

    public fun transfer_balance<CoinType>(
        balance_to_transfer: Balance<CoinType>,
        recipient: address,
        ctx: &mut TxContext
    ) {
        if (balance::value(&balance_to_transfer) == 0) {
            balance::destroy_zero(balance_to_transfer);
            return
        };
        
        transfer::public_transfer(
            coin::from_balance(balance_to_transfer, ctx),
            recipient
        );
    }
    
    #[allow(lint(self_transfer))]
    public fun transfer_or_destroy_coin<CoinType>(
        coin_to_handle: Coin<CoinType>,
        ctx: &TxContext
    ) {
        if (coin::value(&coin_to_handle) > 0) {
            transfer::public_transfer(coin_to_handle, sui::tx_context::sender(ctx));
        } else {
            coin::destroy_zero(coin_to_handle);
        }
    }
}
