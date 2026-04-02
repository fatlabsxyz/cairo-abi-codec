# starknet-structure-encoding

Type-safe encoding of arbitrary Cairo structs to calldata using starknet.js.

## Installation

```bash
pnpm add starknet-structure-encoding
```

## Quick Start

```typescript
import { CairoOption, CairoOptionVariant } from "starknet";
import { createTypedEncoder, StructType } from "starknet-structure-encoding";

// Define your ABI as const (required for type inference)
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

// Create encoder - struct names are autocompleted!
const encoder = createTypedEncoder(abi);

// Type is inferred from the ABI
type MyStruct = StructType<typeof abi, "MyStruct">;

const data: MyStruct = { id: 1n, value: 42n };
const encoded = encoder.encode("MyStruct", data);
// Result: ['1', '42']
```

## Type Safety

The encoder provides full type safety:

```typescript
// Struct names are autocompleted from the ABI
encoder.encode("MyStruct", data);     // OK
encoder.encode("InvalidName", data);  // Compile error

// Data is type-checked against the ABI
encoder.encode("MyStruct", { id: 1n, value: 42n });        // OK
encoder.encode("MyStruct", { id: 1n });                    // Error: missing 'value'
encoder.encode("MyStruct", { id: "wrong", value: 42n });   // Error: wrong type
```

## Handling Option Types

Use `Option::<T>` syntax (with `::`) and include enum definitions:

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

// Type includes CairoOption
type MyStruct = StructType<typeof abi, "MyStruct">;
// = { id: bigint; maybe_value: CairoOption<bigint> }

const data: MyStruct = {
  id: 1n,
  maybe_value: new CairoOption(CairoOptionVariant.Some, 42n),
};

const encoder = createTypedEncoder(abi);
encoder.encode("MyStruct", data);
// Result: ['1', '0', '42']
```

## Complete Example with Nested Options

```typescript
import { CairoOption, CairoOptionVariant } from "starknet";
import { createTypedEncoder, StructType } from "starknet-structure-encoding";

const abi = [
  {
    type: "struct",
    name: "InnerStruct",
    members: [
      { name: "value", type: "core::integer::u64" },
      { name: "maybe_number", type: "core::option::Option::<core::integer::u64>" },
    ],
  },
  {
    type: "struct",
    name: "MyStruct",
    members: [
      { name: "id", type: "core::integer::u64" },
      { name: "maybe_inner", type: "core::option::Option::<InnerStruct>" },
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
  {
    type: "enum",
    name: "core::option::Option::<InnerStruct>",
    variants: [
      { name: "Some", type: "InnerStruct" },
      { name: "None", type: "()" },
    ],
  },
] as const;

type InnerStruct = StructType<typeof abi, "InnerStruct">;
type MyStruct = StructType<typeof abi, "MyStruct">;

const inner: InnerStruct = {
  value: 100n,
  maybe_number: new CairoOption(CairoOptionVariant.Some, 42n),
};

const myStruct: MyStruct = {
  id: 1n,
  maybe_inner: new CairoOption(CairoOptionVariant.Some, inner),
};

const encoder = createTypedEncoder(abi);
const encoded = encoder.encode("MyStruct", myStruct);
// Result: ['1', '0', '100', '0', '42']
//          id   Some value  Some 42
```

## API

### `createTypedEncoder(abi)`

Creates a reusable encoder for the given ABI. Best for encoding multiple structs.

```typescript
const encoder = createTypedEncoder(abi);
encoder.encode("StructName", data);
```

### `encodeStructTyped(abi, structName, data)`

One-off encoding. Creates the encoder internally each time.

```typescript
import { encodeStructTyped } from "starknet-structure-encoding";

const encoded = encodeStructTyped(abi, "MyStruct", data);
```

### `StructType<TAbi, TStructName>`

Type utility to extract the TypeScript type for a struct from the ABI.

```typescript
type MyStruct = StructType<typeof abi, "MyStruct">;
```

### `ExtractAbiStructNames<TAbi>`

Type utility to get a union of all struct names in the ABI.

```typescript
type Names = ExtractAbiStructNames<typeof abi>;
// = "InnerStruct" | "MyStruct"
```

## How It Works

`CallData.compile()` requires a function name, not a struct name. This library:

1. Wraps your struct ABI with a dummy interface and function
2. Uses the function to encode your struct
3. Provides type safety via TypeScript generics (inspired by abi-wan-kanabi)

## Important Notes

- **Use `as const`** on your ABI for type inference to work
- **Use `Option::<T>` syntax** (with `::`) for Option types - this is a starknet.js quirk
- **Include enum definitions** for each Option type in your ABI
