# Serializing Arbitrary Cairo Structures with starknet.js

Encode any Cairo struct to calldata using `CallData.compile()` without deploying a contract.

## The Problem

`CallData.compile()` requires a **function name**, not a struct name. It looks up the function's input types in the ABI to know how to serialize your data.

## The Solution

Create a dummy interface with a dummy function that takes your struct as input:

```typescript
const abi = [
  {
    type: "interface",
    name: "DummyContract",
    items: [
      {
        type: "function",
        name: "serialize",           // dummy function name
        inputs: [{ name: "data", type: "MyStruct" }],
        outputs: [],
        state_mutability: "external"
      }
    ]
  },
  {
    type: "struct",
    name: "MyStruct",
    members: [
      { name: "id", type: "u64" },
      { name: "value", type: "felt252" }
    ]
  }
];

const callData = new CallData(abi);
const encoded = callData.compile("serialize", [myStructInstance]);
```

## Handling Option Types

Use `Option::<T>` syntax (with `::`) instead of `Option<T>`:

```typescript
// Wrong - won't be recognized as Option
{ name: "maybe_value", type: "core::option::Option<u64>" }

// Correct
{ name: "maybe_value", type: "core::option::Option::<u64>" }
```

This is due to a quirk in starknet.js type detection that checks for `Option::` prefix.

## Complete Example with Nested Options

```typescript
import { CairoOption, CairoOptionVariant, CallData } from "starknet";

interface InnerStruct {
  value: bigint;
  maybe_number: CairoOption<bigint>;
}

interface MyStruct {
  id: bigint;
  maybe_inner: CairoOption<InnerStruct>;
}

const abi = [
  {
    type: "interface",
    name: "DummyContract",
    items: [{
      type: "function",
      name: "serialize",
      inputs: [{ name: "data", type: "MyStruct" }],
      outputs: [],
      state_mutability: "external"
    }]
  },
  {
    type: "struct",
    name: "InnerStruct",
    members: [
      { name: "value", type: "u64" },
      { name: "maybe_number", type: "core::option::Option::<u64>" }
    ]
  },
  {
    type: "struct",
    name: "MyStruct",
    members: [
      { name: "id", type: "u64" },
      { name: "maybe_inner", type: "core::option::Option::<InnerStruct>" }
    ]
  },
  {
    type: "enum",
    name: "core::option::Option::<u64>",
    variants: [
      { name: "Some", type: "u64" },
      { name: "None", type: "()" }
    ]
  },
  {
    type: "enum",
    name: "core::option::Option::<InnerStruct>",
    variants: [
      { name: "Some", type: "InnerStruct" },
      { name: "None", type: "()" }
    ]
  }
];

const inner: InnerStruct = {
  value: 100n,
  maybe_number: new CairoOption(CairoOptionVariant.Some, 42n),
};

const myStruct: MyStruct = {
  id: 1n,
  maybe_inner: new CairoOption(CairoOptionVariant.Some, inner),
};

const callData = new CallData(abi);
const encoded = callData.compile("serialize", [myStruct]);
// Result: ['1', '0', '100', '0', '42']
//          id   Some value  Some 42
```

## Key Points

1. **Dummy interface required** - `CallData` needs an interface to recognize the ABI as Cairo 1
2. **Dummy function required** - `compile()` takes a function name, not a struct name
3. **Use `Option::<T>` syntax** - Required for starknet.js to detect Option types
4. **Include all enum variants** - Each Option type needs its own enum definition in the ABI
