import { describe, it } from "node:test";
import { deepStrictEqual, ok } from "node:assert";
import { CairoOption, CairoOptionVariant, CairoCustomEnum } from "starknet";
import {
  createTypedCodec,
  encodeTyped,
  decodeTyped,
  type AbiType,
} from "./typed-encoder.ts";

// -- Struct ABI fixtures --

const structAbi = [
  {
    type: "struct",
    name: "InnerStruct",
    members: [
      { name: "value", type: "core::integer::u64" },
      {
        name: "maybe_number",
        type: "core::option::Option::<core::integer::u64>",
      },
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

const inner: AbiType<typeof structAbi, "InnerStruct"> = {
  value: 100n,
  maybe_number: new CairoOption<bigint>(CairoOptionVariant.Some, 42n),
};

const myStruct: AbiType<typeof structAbi, "MyStruct"> = {
  id: 1n,
  maybe_inner: new CairoOption(CairoOptionVariant.Some, inner),
};

const myStructEmpty: AbiType<typeof structAbi, "MyStruct"> = {
  id: 2n,
  maybe_inner: new CairoOption(CairoOptionVariant.None),
};

// -- Enum ABI fixtures --

const enumAbi = [
  {
    type: "enum",
    name: "Direction",
    variants: [
      { name: "Left", type: "()" },
      { name: "Right", type: "()" },
      { name: "Up", type: "()" },
      { name: "Down", type: "()" },
    ],
  },
  {
    type: "enum",
    name: "Action",
    variants: [
      { name: "Move", type: "core::integer::u64" },
      { name: "Stop", type: "()" },
    ],
  },
] as const;

// -- Struct tests --

describe("createTypedCodec (structs)", () => {
  const codec = createTypedCodec(structAbi);

  it("encodes a struct with nested Option Some", () => {
    const result = codec.encode("MyStruct", myStruct);
    deepStrictEqual(result, ["1", "0", "100", "0", "42"]);
  });

  it("encodes a struct with nested Option None", () => {
    const result = codec.encode("MyStruct", myStructEmpty);
    deepStrictEqual(result, ["2", "1"]);
  });

  it("encodes InnerStruct directly", () => {
    const result = codec.encode("InnerStruct", inner);
    deepStrictEqual(result, ["100", "0", "42"]);
  });

  it("decodes a struct with nested Option Some", () => {
    const result = codec.decode("MyStruct", ["1", "0", "100", "0", "42"]);
    deepStrictEqual(result.id, 1n);
    ok(result.maybe_inner instanceof CairoOption);
    ok(result.maybe_inner.isSome());
    deepStrictEqual(result.maybe_inner.unwrap()!.value, 100n);
  });

  it("decodes a struct with nested Option None", () => {
    const result = codec.decode("MyStruct", ["2", "1"]);
    deepStrictEqual(result.id, 2n);
    ok(result.maybe_inner instanceof CairoOption);
    ok(result.maybe_inner.isNone());
  });

  it("roundtrips encode → decode", () => {
    const encoded = codec.encode("MyStruct", myStruct);
    const decoded = codec.decode("MyStruct", encoded);
    deepStrictEqual(decoded.id, myStruct.id);
    ok(decoded.maybe_inner instanceof CairoOption);
    ok(decoded.maybe_inner.isSome());
    deepStrictEqual(decoded.maybe_inner.unwrap()!.value, 100n);
    deepStrictEqual(decoded.maybe_inner.unwrap()!.maybe_number.unwrap(), 42n);
  });
});

// -- Enum tests --

describe("createTypedCodec (enums)", () => {
  const codec = createTypedCodec(enumAbi);

  it("encodes a unit-variant enum", () => {
    const result = codec.encode(
      "Direction",
      new CairoCustomEnum({ Left: {} })
    );
    deepStrictEqual(result, ["0"]);
  });

  it("encodes a data-carrying enum variant", () => {
    const result = codec.encode("Action", new CairoCustomEnum({ Move: 42n }));
    deepStrictEqual(result, ["0", "42"]);
  });

  it("decodes a unit-variant enum", () => {
    const result = codec.decode("Direction", ["2"]);
    ok(result instanceof CairoCustomEnum);
    deepStrictEqual(result.activeVariant(), "Up");
  });

  it("decodes a data-carrying enum variant", () => {
    const result = codec.decode("Action", ["0", "42"]);
    ok(result instanceof CairoCustomEnum);
    deepStrictEqual(result.activeVariant(), "Move");
    deepStrictEqual(result.unwrap(), 42n);
  });

  it("roundtrips encode → decode", () => {
    const original = new CairoCustomEnum({ Move: 99n });
    const encoded = codec.encode("Action", original);
    const decoded = codec.decode("Action", encoded);
    ok(decoded instanceof CairoCustomEnum);
    deepStrictEqual(decoded.activeVariant(), "Move");
    deepStrictEqual(decoded.unwrap(), 99n);
  });
});

// -- ContractAddress parsing --

const addressAbi = [
  {
    type: "struct",
    name: "Transfer",
    members: [
      { name: "sender", type: "core::starknet::contract_address::ContractAddress" },
      { name: "recipient", type: "core::starknet::contract_address::ContractAddress" },
      { name: "amount", type: "core::integer::u64" },
    ],
  },
] as const;

const ADDR_A = "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";
const ADDR_B = "0x0000000000000000000000000000000000000000000000000000000000000001";

describe("createTypedCodec (ContractAddress)", () => {
  const codec = createTypedCodec(addressAbi);

  it("encodes addresses as decimal felts (starknet.js compile behavior)", () => {
    const result = codec.encode("Transfer", {
      sender: ADDR_A,
      recipient: ADDR_B,
      amount: 500n,
    });
    // compile always produces decimal strings
    deepStrictEqual(result[0], BigInt(ADDR_A).toString());
    deepStrictEqual(result[1], BigInt(ADDR_B).toString());
    deepStrictEqual(result[2], "500");
  });

  it("decodes addresses as 0x-prefixed, zero-padded 64-char hex", () => {
    const encoded = codec.encode("Transfer", {
      sender: ADDR_A,
      recipient: ADDR_B,
      amount: 500n,
    });
    const decoded = codec.decode("Transfer", encoded);
    // The custom parser zero-pads to 64 hex chars (32 bytes)
    deepStrictEqual(decoded.sender, ADDR_A);
    deepStrictEqual(decoded.recipient, ADDR_B);
    deepStrictEqual(decoded.amount, 500n);
  });

  it("decodes address from raw decimal calldata", () => {
    // 0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7 as decimal
    const senderDecimal = "2087021424722619777119509474943472645767659996348769578120564519014510906823";
    const decoded = codec.decode("Transfer", [senderDecimal, "1", "500"]);
    deepStrictEqual(decoded.sender, ADDR_A);
    deepStrictEqual(decoded.recipient, ADDR_B);
  });

  it("roundtrips with short address (leading zeros)", () => {
    const shortAddr = "0x0000000000000000000000000000000000000000000000000000000000000042";
    const data = { sender: shortAddr, recipient: shortAddr, amount: 1n };
    const encoded = codec.encode("Transfer", data);
    const decoded = codec.decode("Transfer", encoded);
    deepStrictEqual(decoded.sender, shortAddr);
    deepStrictEqual(decoded.recipient, shortAddr);
  });
});

// -- One-off helpers --

describe("encodeTyped / decodeTyped", () => {
  it("struct one-off matches codec output", () => {
    const codec = createTypedCodec(structAbi);
    const fromCodec = codec.encode("MyStruct", myStruct);
    const fromOneOff = encodeTyped(structAbi, "MyStruct", myStruct);
    deepStrictEqual(fromOneOff, fromCodec);
  });

  it("enum one-off roundtrips", () => {
    const original = new CairoCustomEnum({ Down: {} });
    const encoded = encodeTyped(enumAbi, "Direction", original);
    const decoded = decodeTyped(enumAbi, "Direction", encoded);
    ok(decoded instanceof CairoCustomEnum);
    deepStrictEqual(decoded.activeVariant(), "Down");
  });
});
