# StormLink Aggregator

A high-performance DEX aggregator for the Sui blockchain that finds optimal swap routes across multiple decentralized exchanges.

## Overview

StormLink Aggregator is a sophisticated routing system that aggregates liquidity from multiple DEX protocols on Sui to provide users with the best swap rates. The project consists of:

- **Move Smart Contracts**: On-chain swap execution and routing logic
- **TypeScript SDK**: Client library for interacting with the aggregator
- **Multi-DEX Support**: Integration with Cetus, Bluefin, and extensible to other protocols

## Features

- 🔄 **Multi-hop Routing**: Execute complex swap paths across multiple pools
- 💰 **Best Price Discovery**: Automatically finds optimal routes for maximum output
- ⚡ **Gas Optimized**: Efficient on-chain execution with minimal transaction costs
- 🛡️ **Slippage Protection**: Built-in slippage checks and amount limits
- 🔌 **Extensible**: Easy integration of new DEX protocols
- 📊 **Event Tracking**: Comprehensive swap events for analytics

## Architecture

```
aggregator/
├── packages/
│   ├── stormlink-aggregator/     # Main Move package
│   │   ├── sources/
│   │   │   ├── router.move       # Core routing logic
│   │   │   ├── errors.move       # Error definitions
│   │   │   └── routers/
│   │   │       ├── cetus.move    # Cetus DEX integration
│   │   │       └── bluefin.move  # Bluefin DEX integration
│   │   └── Move.toml
│   └── config/                   # Configuration package
├── src/
│   ├── client.ts                 # Main aggregator client
│   ├── api.ts                    # API communication
│   ├── movecall/                 # Move call builders
│   │   ├── router.ts
│   │   ├── cetus.ts
│   │   └── bluefin.ts
│   └── types/                    # TypeScript types
└── tests/                        # Test suites
```

## Installation

### Prerequisites

- Node.js >= 18
- Bun (recommended) or npm
- Sui CLI >= 1.0.0

### Install Dependencies

```bash
bun install
```

### Build Move Contracts

```bash
cd packages/stormlink-aggregator
sui move build
```

## Usage

### TypeScript SDK

#### Initialize Client

```typescript
import { AggregatorClient } from './src/client'
import { Env } from './src/config'

const client = new AggregatorClient(
  'https://api-sui.cetus.zone/router_v2',  // API endpoint
  'your-api-key',                          // API key
  Env.Mainnet,                             // Environment
  'your-sui-address'                       // Your address
)
```

#### Find Best Route

```typescript
import { FindRouterParams } from './src/types/shared'

const params: FindRouterParams = {
  from: '0x2::sui::SUI',
  target: '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN', // USDC
  amount: '1000000000',  // 1 SUI
  byAmountIn: true,
  providers: ['CETUS', 'BLUEFIN'],
  depth: 3
}

const route = await client.getRouterV3(params)
```

#### Execute Swap

```typescript
import { Transaction } from '@mysten/sui/transactions'

const txb = new Transaction()

// Build swap transaction
const outputCoin = await client.fastRouterSwap({
  router: route,
  slippage: 0.01,  // 1%
  txb,
  partner: 'your-partner-address'  // Optional
})

// Execute transaction
const result = await client.client.signAndExecuteTransaction({
  transaction: txb,
  signer: yourKeypair
})
```

## Move Smart Contracts

### Core Modules

#### `stormlink_aggregator::router`

Main routing module that manages swap context and execution flow.

**Key Functions:**
- `new_swap_context`: Initialize swap context with parameters
- `confirm_swap`: Finalize swap and return output coin
- `emit_swap_event`: Emit swap events for tracking
- `take_balance`: Extract balance from swap context
- `merge_balance`: Merge balance back to context

**Structs:**
- `SwapContext`: Holds swap state and balances
- `ConfirmSwapEvent`: Emitted on successful swap
- `SwapEvent`: Emitted for each hop in route

#### `stormlink_aggregator::cetus`

Cetus CLMM integration module.

```move
public fun swap<CoinA, CoinB>(
    swap_ctx: &mut SwapContext,
    global_config: &GlobalConfig,
    pool: &mut Pool<CoinA, CoinB>,
    partner: &Partner,
    a_to_b: bool,
    amount_in: u64,
    clock: &Clock,
    ctx: &mut TxContext
)
```

#### `stormlink_aggregator::bluefin`

Bluefin Spot integration module.

```move
public fun swap<CoinA, CoinB>(
    swap_ctx: &mut SwapContext,
    config: &GlobalConfig,
    pool: &mut Pool<CoinA, CoinB>,
    a_to_b: bool,
    amount_in: u64,
    clock: &Clock,
    ctx: &mut TxContext
)
```

### Error Codes

Defined in `stormlink_aggregator::aggregator_errors`:

- `E_AMOUNT_OUT_SLIPPAGE_CHECK_FAILED (1)`: Output amount below minimum
- `E_AMOUNT_IN_SLIPPAGE_CHECK_FAILED (2)`: Input amount exceeds maximum
- `E_INSUFFICIENT_BALANCE (3)`: Insufficient balance for operation
- `E_ZERO_AMOUNT (4)`: Zero amount not allowed

## Development

### Run Tests

```bash
# Run all tests
bun test

# Run specific test suite
bun run dev:cetus

# Watch mode
bun run dev
```

### Test Structure

```typescript
describe('Swap router', () => {
  let fixture: TestFixture
  
  beforeAll(async () => {
    fixture = new TestFixture()
    await fixture.setup()
  })
  
  test('Execute swap', async () => {
    await fixture.testDexRouter(
      'CETUS',
      M_SUI,
      M_USDC,
      '1000000000',
      true
    )
  })
})
```

### Add New DEX Integration

1. **Create Move module** in `packages/stormlink-aggregator/sources/routers/`:

```move
module stormlink_aggregator::new_dex {
    use stormlink_aggregator::router::{Self, SwapContext};
    
    public fun swap<CoinA, CoinB>(
        swap_ctx: &mut SwapContext,
        // ... DEX-specific parameters
    ) {
        // Implementation
    }
}
```

2. **Create TypeScript router** in `src/movecall/`:

```typescript
class NewDexRouter implements DexRouter {
    swap(
        txb: Transaction,
        flattenedPath: FlattenedPath,
        swapContext: TransactionObjectArgument
    ) {
        // Build move call
    }
}
```

3. **Register in client**:

```typescript
case 'NEW_DEX':
    return new NewDexRouter(this.env)
```

## Configuration

### Environment Variables

```bash
# Sui RPC endpoint
SUI_RPC_URL=https://fullnode.mainnet.sui.io:443

# Aggregator API
CETUS_AGGREGATOR_V3=https://api-sui.cetus.zone/router_v2

# Private key for testing
SUI_PRIVATE_KEY=your-private-key
```

### Move.toml Configuration

```toml
[package]
name = "StormLinkAggregator"
version = "0.0.1"

[dependencies]
Sui = { git = "https://github.com/MystenLabs/sui.git", subdir = "crates/sui-framework/packages/sui-framework", rev = "mainnet" }
CetusClmm = { git = "https://github.com/CetusProtocol/cetus-clmm-sui.git", subdir = "sui/clmm", rev = "mainnet" }
bluefin_spot = { git = "https://github.com/blue-fin/bluefin-spot.git", subdir = "contracts/clob_v2", rev = "mainnet" }

[addresses]
stormlink_aggregator = "0x0"
```

## API Reference

### AggregatorClient Methods

#### `getRouterV3(params: FindRouterParams): Promise<RouterData | null>`
Find optimal swap route.

#### `fastRouterSwap(params: BuildFastRouterSwapParams): Promise<TransactionObjectArgument>`
Build swap transaction without coin preparation.

#### `routerSwap(params: BuildRouterSwapParams): Promise<TransactionObjectArgument>`
Build complete swap transaction with coin handling.

#### `devInspectTransactionBlock(txb: Transaction): Promise<any>`
Simulate transaction execution.

#### `sendTransaction(txb: Transaction, signer: Signer): Promise<any>`
Sign and execute transaction.

### Types

```typescript
interface FindRouterParams {
  from: string
  target: string
  amount: string
  byAmountIn: boolean
  providers?: string[]
  depth?: number
  liquidityChanges?: LiquidityChange[]
}

interface RouterData {
  quoteID: string
  amountIn: BN
  amountOut: BN
  paths: Path[]
  byAmountIn: boolean
  insufficientLiquidity: boolean
  deviationRatio: number
  packages?: Map<string, string>
}

interface Path {
  id: string
  direction: boolean
  provider: string
  from: string
  target: string
  feeRate: number
  amountIn: string
  amountOut: string
  publishedAt?: string
  extendedDetails?: any
}
```

## Supported DEX Protocols

| Protocol | Status | Network |
|----------|--------|---------|
| Cetus CLMM | ✅ Active | Mainnet |
| Bluefin Spot | ✅ Active | Mainnet |
| More coming | 🚧 Planned | - |

## Gas Optimization

The aggregator uses several techniques to minimize gas costs:

- **Batch operations**: Multiple swaps in single transaction
- **Efficient balance management**: Minimal coin splits/merges
- **Direct pool access**: No intermediate wrapper calls
- **Optimized type arguments**: Minimal generic instantiation

## Security

- ✅ Slippage protection on all swaps
- ✅ Balance verification at each step
- ✅ Amount limit checks
- ✅ Zero-amount guards
- ⚠️ **Not audited**: Use at your own risk

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

Apache License 2.0

## Contact

- GitHub: [captainenkay0712/stormlink-aggregator](https://github.com/captainenkay0712/stormlink-aggregator)

## Acknowledgments

- [Cetus Protocol](https://cetus.zone) - DEX integration
- [Bluefin](https://bluefin.io) - DEX integration
- [Sui Foundation](https://sui.io) - Blockchain platform
