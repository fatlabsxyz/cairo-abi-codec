# @fatsolutions/cairo-abi-codec

Type-safe encode/decode for Cairo structs, enums, constructors, and events to Starknet calldata.

## Installation

```bash
pnpm add @fatsolutions/cairo-abi-codec
```

## Quick Start

```typescript
import { CairoOption, CairoOptionVariant, CairoCustomEnum } from "starknet";
import { createTypedCodec, type AbiType } from "@fatsolutions/cairo-abi-codec";

const abi = [
  {
    type: "struct",
    name: "MyStruct",
    members: [
      { name: "id", type: "core::integer::u64" },
      { name: "value", type: "core::felt252" },
    ],
  },
] as const;

const codec = createTypedCodec(abi);

// Struct names are autocompleted, data is type-checked against the ABI
type MyStruct = AbiType<typeof abi, "MyStruct">;

const data: MyStruct = { id: 1n, value: 42n };
const encoded = codec.encode("MyStruct", data);
// => ['1', '42']

const decoded = codec.decode("MyStruct", encoded);
// => { id: 1n, value: 42n }
```

## Structs with Options

Include the `Option` enum definition in your ABI:

```typescript
const abi = [
  {
    type: "struct",
    name: "MyStruct",
    members: [
      { name: "id", type: "core::integer::u64" },
      { name: "maybe_value", type: "core::option::Option::<core::integer::u64>" },
    ],
  },
  {
    type: "enum",
    name: "core::option::Option::<core::integer::u64>",
    variants: [
      { name: "Some", type: "core::integer::u64" },
      { name: "None", type: "()" },
    ],
  },
] as const;

const codec = createTypedCodec(abi);

// AbiType infers: { id: bigint; maybe_value: CairoOption<bigint> }
const data = {
  id: 1n,
  maybe_value: new CairoOption(CairoOptionVariant.Some, 42n),
};

codec.encode("MyStruct", data);
// => ['1', '0', '42']
```

## Enums

Custom enums encode/decode as `CairoCustomEnum`:

```typescript
const abi = [
  {
    type: "enum",
    name: "Action",
    variants: [
      { name: "Move", type: "core::integer::u64" },
      { name: "Stop", type: "()" },
    ],
  },
] as const;

const codec = createTypedCodec(abi);

const encoded = codec.encode("Action", new CairoCustomEnum({ Move: 42n }));
// => ['0', '42']

const decoded = codec.decode("Action", encoded);
decoded.activeVariant(); // => 'Move'
decoded.unwrap();        // => 42n
```

## Constructors

Encode/decode constructor calldata for deploy transactions:

```typescript
const abi = [
  {
    type: "constructor",
    name: "constructor",
    inputs: [
      { name: "owner", type: "core::starknet::contract_address::ContractAddress" },
      { name: "initial_supply", type: "core::integer::u64" },
    ],
  },
] as const;

const codec = createTypedCodec(abi);

const encoded = codec.encodeConstructor({
  owner: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
  initial_supply: 1000n,
});

const decoded = codec.decodeConstructor(encoded);
// => { owner: '0x049d...dc7', initial_supply: 1000n }
```

The constructor can reference struct/enum types defined in the same ABI.

## Events

Decode events from transaction receipts. Event members are split by `kind`: `"key"` members come from the keys array, `"data"` members from the data array.

```typescript
const abi = [
  {
    type: "event",
    name: "Transfer",
    kind: "struct",
    members: [
      { name: "from", type: "core::starknet::contract_address::ContractAddress", kind: "key" },
      { name: "to", type: "core::starknet::contract_address::ContractAddress", kind: "key" },
      { name: "amount", type: "core::integer::u64", kind: "data" },
    ],
  },
] as const;

const codec = createTypedCodec(abi);

// Decoding from a transaction receipt — strip the selector (keys[0]) first:
const decoded = codec.decodeEvent("Transfer", {
  keys: receipt.events[0].keys.slice(1),  // skip selector
  data: receipt.events[0].data,
});
// => { from: '0x049d...dc7', to: '0x000...001', amount: 500n }

// Encoding (for testing) — returns { keys, data } without selector
const encoded = codec.encodeEvent("Transfer", {
  from: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
  to: "0x0000000000000000000000000000000000000000000000000000000000000001",
  amount: 500n,
});
```

Only `kind: "struct"` events are supported. Enum events (`kind: "enum"`) are Cairo's internal dispatch pattern and don't need off-chain handling.

## ContractAddress

Decoded `ContractAddress` fields are automatically formatted as `0x`-prefixed, zero-padded 64-char hex strings. This applies in all positions: top-level struct members, nested structs, Options, Arrays, and custom enum variants.

```typescript
const decoded = codec.decode("Transfer", calldata);
decoded.sender; // => '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7'
```

## ABI Narrowing

Use `narrowAbi` to filter a full contract ABI down to specific types, preserving type information:

```typescript
import { narrowAbi, createTypedCodec } from "@fatsolutions/cairo-abi-codec";

const subset = narrowAbi(fullContractAbi, ["MyStruct", "MyEnum"] as const);
const codec = createTypedCodec(subset);
```

## API

### `createTypedCodec(abi)`

Creates a reusable codec with the following methods:

| Method | Description |
|---|---|
| `encode(typeName, data)` | Encode a struct or enum to calldata |
| `decode(typeName, calldata)` | Decode calldata to a struct or enum |
| `encodeConstructor(data)` | Encode constructor arguments to calldata |
| `decodeConstructor(calldata)` | Decode constructor calldata |
| `encodeEvent(eventName, data)` | Encode event data to `{ keys, data }` |
| `decodeEvent(eventName, { keys, data })` | Decode event keys/data to a typed object |

### One-off helpers

| Function | Description |
|---|---|
| `encodeTyped(abi, typeName, data)` | One-off struct/enum encoding |
| `decodeTyped(abi, typeName, calldata)` | One-off struct/enum decoding |
| `encodeConstructor(abi, data)` | One-off constructor encoding |
| `decodeConstructor(abi, calldata)` | One-off constructor decoding |
| `encodeEvent(abi, eventName, data)` | One-off event encoding |
| `decodeEvent(abi, eventName, event)` | One-off event decoding |

### Type utilities

| Type | Description |
|---|---|
| `AbiType<TAbi, TName>` | TypeScript type for a struct or enum |
| `ConstructorArgs<TAbi>` | Typed object for constructor inputs |
| `AbiEventType<TAbi, TName>` | Typed object for event members |
| `ExtractAbiTypeNames<TAbi>` | Union of all struct/enum names |
| `ExtractAbiConstructor<TAbi>` | Constructor entry from the ABI |
| `ExtractAbiEventNames<TAbi>` | Union of all event names |

### `narrowAbi(abi, names)`

Filters an ABI to only the named struct/enum entries, preserving the const tuple type.

## Important Notes

- **Use `as const`** on your ABI for type inference to work
- Integer types (`u64`, `u128`, `u256`, `felt252`) resolve to `bigint`
- `Option<T>` resolves to `CairoOption<T>`, custom enums to `CairoCustomEnum`
- `ContractAddress` decodes to `0x`-prefixed hex strings (64 chars, zero-padded)
- Constructor ABIs use `inputs` (not `members`) — the codec handles this automatically
- Event `decodeEvent` expects keys **without** the selector — strip `keys[0]` from receipt data

## Build & Test

```bash
pnpm run build    # tsc -> dist/
pnpm test         # node:test with --experimental-strip-types
```
