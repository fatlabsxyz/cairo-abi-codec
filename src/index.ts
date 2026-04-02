import { CairoOption, CairoOptionVariant, type Abi } from "starknet";
import { encodeStruct, createStructEncoder } from "./encoder.js";

// Define your struct types
interface InnerStruct {
  value: bigint;
  maybe_number: CairoOption<bigint>;
}

interface MyStruct {
  id: bigint;
  maybe_inner: CairoOption<InnerStruct>;
}

// Define only the struct/enum ABI - no interface or function needed
const structAbi = [
  {
    type: "struct",
    name: "InnerStruct",
    members: [
      { name: "value", type: "u64" },
      { name: "maybe_number", type: "core::option::Option::<u64>" },
    ],
  },
  {
    type: "struct",
    name: "MyStruct",
    members: [
      { name: "id", type: "u64" },
      { name: "maybe_inner", type: "core::option::Option::<InnerStruct>" },
    ],
  },
  {
    type: "enum",
    name: "core::option::Option::<u64>",
    variants: [
      { name: "Some", type: "u64" },
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

// Example data
const inner: InnerStruct = {
  value: 100n,
  maybe_number: new CairoOption<bigint>(CairoOptionVariant.Some, 42n),
};

const myStruct: MyStruct = {
  id: 1n,
  maybe_inner: new CairoOption(CairoOptionVariant.Some, inner),
};

const myStructEmpty: MyStruct = {
  id: 2n,
  maybe_inner: new CairoOption(CairoOptionVariant.None),
};

// Option 1: One-off encoding
console.log("=== Using encodeStruct() ===");
const encoded1 = encodeStruct(structAbi, "MyStruct", myStruct);
console.log("Encoded (with nested Some):", encoded1);

const encoded2 = encodeStruct(structAbi, "MyStruct", myStructEmpty);
console.log("Encoded (with None):", encoded2);

// Option 2: Reusable encoder (better for multiple encodings)
console.log("\n=== Using createStructEncoder() ===");
const encodeMyStruct = createStructEncoder(structAbi, "MyStruct");

console.log("Encoded (with nested Some):", encodeMyStruct(myStruct));
console.log("Encoded (with None):", encodeMyStruct(myStructEmpty));
