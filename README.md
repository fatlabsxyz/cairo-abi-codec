# @fatsolutions/cairo-abi-codec

Type-safe encode/decode for Cairo structs and enums to Starknet calldata.

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

Creates a reusable codec with `encode` and `decode` methods. Best when encoding/decoding multiple types from the same ABI.

### `encodeTyped(abi, typeName, data)`

One-off encoding. Creates the codec internally.

### `decodeTyped(abi, typeName, calldata)`

One-off decoding. Creates the codec internally.

### `AbiType<TAbi, TName>`

Type utility to extract the TypeScript type for a struct or enum from the ABI.

### `narrowAbi(abi, names)`

Filters an ABI to only the named struct/enum entries, preserving the const tuple type.

## Important Notes

- **Use `as const`** on your ABI for type inference to work
- Integer types (`u64`, `u128`, `u256`, `felt252`) resolve to `bigint`
- `Option<T>` resolves to `CairoOption<T>`, custom enums to `CairoCustomEnum`
- `ContractAddress` decodes to `0x`-prefixed hex strings (64 chars, zero-padded)

## Build & Test

```bash
pnpm run build    # tsc -> dist/
pnpm test         # node:test with --experimental-strip-types
```
