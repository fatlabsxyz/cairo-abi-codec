import { CairoOption, CairoOptionVariant } from "starknet";
import {
  createTypedCodec,
  encodeTyped,
  decodeTyped,
  encodeConstructor,
  type AbiType,
  type ConstructorArgs,
  type AbiEventType,
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

// ============================================================================
// Constructor encoding/decoding
// ============================================================================

const tokenAbi = [
  {
    type: "constructor",
    name: "constructor",
    inputs: [
      { name: "owner", type: "core::starknet::contract_address::ContractAddress" },
      { name: "initial_supply", type: "core::integer::u64" },
    ],
  },
] as const;

console.log("\n=== Constructor ===");

const tokenCodec = createTypedCodec(tokenAbi);

// Type is inferred from the constructor inputs
type TokenConstructorArgs = ConstructorArgs<typeof tokenAbi>;

const ctorArgs: TokenConstructorArgs = {
  owner: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
  initial_supply: 1000n,
};

const ctorEncoded = tokenCodec.encodeConstructor(ctorArgs);
console.log("Constructor encoded:", ctorEncoded);

const ctorDecoded = tokenCodec.decodeConstructor(ctorEncoded);
console.log("Constructor decoded:", ctorDecoded);

// One-off helper
const ctorOneOff = encodeConstructor(tokenAbi, ctorArgs);
console.log("Constructor one-off:", ctorOneOff);

// ============================================================================
// Event encoding/decoding
// ============================================================================

const eventAbi = [
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

console.log("\n=== Events ===");

const eventCodec = createTypedCodec(eventAbi);

// Type is inferred from the event members
type TransferEvent = AbiEventType<typeof eventAbi, "Transfer">;

const transferData: TransferEvent = {
  from: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
  to: "0x0000000000000000000000000000000000000000000000000000000000000001",
  amount: 500n,
};

// Encode splits into keys (key members) and data (data members)
const eventEncoded = eventCodec.encodeEvent("Transfer", transferData);
console.log("Event keys:", eventEncoded.keys);   // [from, to] as decimal felts
console.log("Event data:", eventEncoded.data);   // [amount]

// Decode merges keys + data back into a typed object
const eventDecoded = eventCodec.decodeEvent("Transfer", eventEncoded);
console.log("Event decoded:", eventDecoded);

// When decoding from a transaction receipt, strip the selector (keys[0]) first:
// const decoded = eventCodec.decodeEvent("Transfer", {
//   keys: receipt.events[0].keys.slice(1),  // skip selector
//   data: receipt.events[0].data,
// });
