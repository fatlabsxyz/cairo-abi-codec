import { CairoOption, CairoOptionVariant } from "starknet";
import {
  createTypedEncoder,
  encodeStructTyped,
  type StructType,
  type ExtractAbiStructNames,
} from "./typed-encoder.js";

// Define the ABI as const to preserve literal types
const structAbi = [
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

// Type is inferred from the ABI!
type MyStruct = StructType<typeof structAbi, "MyStruct">;
type InnerStruct = StructType<typeof structAbi, "InnerStruct">;

// Show available struct names (for demonstration)
type AvailableStructs = ExtractAbiStructNames<typeof structAbi>;
// = "InnerStruct" | "MyStruct"

// Example data - TypeScript will verify this matches the ABI
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

// === Type-safe encoding ===
console.log("=== Type-Safe Encoder ===");

// Option 1: Create a reusable encoder
const encoder = createTypedEncoder(structAbi);

// Struct name is autocompleted, data is type-checked
const encoded1 = encoder.encode("MyStruct", myStruct);
console.log("Encoded (with nested Some):", encoded1);

const encoded2 = encoder.encode("MyStruct", myStructEmpty);
console.log("Encoded (with None):", encoded2);

// Can also encode InnerStruct directly
const encodedInner = encoder.encode("InnerStruct", inner);
console.log("Encoded InnerStruct:", encodedInner);

// Option 2: One-off encoding
console.log("\n=== One-off encoding ===");
const oneOff = encodeStructTyped(structAbi, "MyStruct", myStruct);
console.log("One-off encoded:", oneOff);

// === Type safety demonstration ===
console.log("\n=== Type Safety ===");
console.log("TypeScript catches errors at compile time:");
console.log("- Wrong struct name: encoder.encode('InvalidStruct', data)");
console.log("- Wrong data shape: encoder.encode('MyStruct', { wrong: 'data' })");
console.log("- Missing fields: encoder.encode('MyStruct', { id: 1n })");
