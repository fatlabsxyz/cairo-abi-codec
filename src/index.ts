import { CairoOption, CairoOptionVariant, CallData } from "starknet";

// A simple nested structure: MyStruct contains an Option<InnerStruct>
// where InnerStruct itself contains an Option<u64>

interface InnerStruct {
  value: bigint;
  maybe_number: CairoOption<bigint>;
}

interface MyStruct {
  id: bigint;
  maybe_inner: CairoOption<InnerStruct>;
}

// Example instances
const innerWithValue: InnerStruct = {
  value: 100n,
  maybe_number: new CairoOption<bigint>(CairoOptionVariant.Some, 42n),
};

const myStruct: MyStruct = {
  id: 1n,
  maybe_inner: new CairoOption(CairoOptionVariant.Some, innerWithValue),
};

const myStructEmpty: MyStruct = {
  id: 2n,
  maybe_inner: new CairoOption(CairoOptionVariant.None),
};

// Matching Cairo ABI for the structures
const abi = `[
  {
    "type": "interface",
    "name": "MyContract",
    "items": [
      {
        "type": "function",
        "name": "process_struct",
        "inputs": [{ "name": "data", "type": "MyStruct" }],
        "outputs": [],
        "state_mutability": "external"
      }
    ]
  },
  {
    "type": "struct",
    "name": "InnerStruct",
    "members": [
      { "name": "value", "type": "u64" },
      { "name": "maybe_number", "type": "core::option::Option::<u64>" }
    ]
  },
  {
    "type": "struct",
    "name": "MyStruct",
    "members": [
      { "name": "id", "type": "u64" },
      { "name": "maybe_inner", "type": "core::option::Option::<InnerStruct>" }
    ]
  },
  {
    "type": "enum",
    "name": "core::option::Option::<u64>",
    "variants": [
      { "name": "Some", "type": "u64" },
      { "name": "None", "type": "()" }
    ]
  },
  {
    "type": "enum",
    "name": "core::option::Option::<InnerStruct>",
    "variants": [
      { "name": "Some", "type": "InnerStruct" },
      { "name": "None", "type": "()" }
    ]
  }
]`;

// Parse ABI and create CallData instance
const parsedAbi = JSON.parse(abi);
const callData = new CallData(parsedAbi);

// Encode the struct with nested Option (Some variant)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const encodedWithValue = callData.compile("process_struct", [myStruct] as any);
console.log("Encoded MyStruct (with nested Some):", encodedWithValue);

// Encode the struct with None
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const encodedEmpty = callData.compile("process_struct", [myStructEmpty] as any);
console.log("Encoded MyStruct (with None):", encodedEmpty);
