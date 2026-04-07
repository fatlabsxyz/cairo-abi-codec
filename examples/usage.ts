import { CairoOption, CairoOptionVariant } from "starknet";
import {
  createTypedCodec,
  encodeTyped,
  decodeTyped,
  type AbiType,
} from "../src/typed-encoder.ts";

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
type MyStruct = AbiType<typeof structAbi, "MyStruct">;
type InnerStruct = AbiType<typeof structAbi, "InnerStruct">;

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

// === Reusable codec ===
console.log("=== Type-Safe Codec ===");

const codec = createTypedCodec(structAbi);

// Struct name is autocompleted, data is type-checked
const encoded1 = codec.encode("MyStruct", myStruct);
console.log("Encoded (with nested Some):", encoded1);

const encoded2 = codec.encode("MyStruct", myStructEmpty);
console.log("Encoded (with None):", encoded2);

const encodedInner = codec.encode("InnerStruct", inner);
console.log("Encoded InnerStruct:", encodedInner);

// === Decoding ===
console.log("\n=== Decoding ===");

const decoded1 = codec.decode("MyStruct", encoded1);
console.log("Decoded (with nested Some):", decoded1);
console.log("  id:", decoded1.id);
console.log("  maybe_inner is Some?", decoded1.maybe_inner.isSome());
console.log("  inner value:", decoded1.maybe_inner.unwrap()!.value);

const decoded2 = codec.decode("MyStruct", encoded2);
console.log("Decoded (with None):", decoded2);
console.log("  id:", decoded2.id);
console.log("  maybe_inner is None?", decoded2.maybe_inner.isNone());

// === Roundtrip ===
console.log("\n=== Roundtrip ===");
const roundtripped = codec.decode("MyStruct", codec.encode("MyStruct", myStruct));
console.log("Original id:", myStruct.id, "-> Roundtripped id:", roundtripped.id);

// === One-off helpers ===
console.log("\n=== One-off helpers ===");
const oneOffEncoded = encodeTyped(structAbi, "MyStruct", myStruct);
console.log("One-off encoded:", oneOffEncoded);

const oneOffDecoded = decodeTyped(structAbi, "MyStruct", oneOffEncoded);
console.log("One-off decoded id:", oneOffDecoded.id);
