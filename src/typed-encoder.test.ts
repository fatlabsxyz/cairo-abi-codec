import { describe, it } from "node:test";
import { deepStrictEqual, ok } from "node:assert";
import { CairoOption, CairoOptionVariant, CairoCustomEnum } from "starknet";
import {
  createTypedCodec,
  encodeTyped,
  decodeTyped,
  encodeConstructor,
  decodeConstructor,
  encodeEvent,
  decodeEvent,
  type AbiType,
  type ConstructorArgs,
  type AbiEventType,
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

// -- ContractAddress in nested types --

const nestedAddressAbi = [
  {
    type: "struct",
    name: "Wallet",
    members: [
      { name: "owner", type: "core::starknet::contract_address::ContractAddress" },
      { name: "balance", type: "core::integer::u64" },
    ],
  },
  {
    type: "struct",
    name: "WithOptionalAddress",
    members: [
      { name: "maybe_addr", type: "core::option::Option::<core::starknet::contract_address::ContractAddress>" },
    ],
  },
  {
    type: "enum",
    name: "core::option::Option::<core::starknet::contract_address::ContractAddress>",
    variants: [
      { name: "Some", type: "core::starknet::contract_address::ContractAddress" },
      { name: "None", type: "()" },
    ],
  },
  {
    type: "struct",
    name: "WithOptionalWallet",
    members: [
      { name: "maybe_wallet", type: "core::option::Option::<Wallet>" },
    ],
  },
  {
    type: "enum",
    name: "core::option::Option::<Wallet>",
    variants: [
      { name: "Some", type: "Wallet" },
      { name: "None", type: "()" },
    ],
  },
  {
    type: "struct",
    name: "WalletList",
    members: [
      { name: "wallets", type: "core::array::Array::<Wallet>" },
    ],
  },
  {
    type: "struct",
    name: "NestedStruct",
    members: [
      { name: "wallet", type: "Wallet" },
      { name: "tag", type: "core::integer::u64" },
    ],
  },
  {
    type: "enum",
    name: "Target",
    variants: [
      { name: "Address", type: "core::starknet::contract_address::ContractAddress" },
      { name: "None", type: "()" },
    ],
  },
] as const;

describe("createTypedCodec (nested ContractAddress)", () => {
  const codec = createTypedCodec(nestedAddressAbi);

  it("transforms address inside Option Some", () => {
    const data = {
      maybe_addr: new CairoOption(CairoOptionVariant.Some, ADDR_A),
    };
    const encoded = codec.encode("WithOptionalAddress", data);
    const decoded = codec.decode("WithOptionalAddress", encoded);
    ok(decoded.maybe_addr instanceof CairoOption);
    ok(decoded.maybe_addr.isSome());
    deepStrictEqual(decoded.maybe_addr.unwrap(), ADDR_A);
  });

  it("preserves Option None", () => {
    const data = {
      maybe_addr: new CairoOption<string>(CairoOptionVariant.None),
    };
    const encoded = codec.encode("WithOptionalAddress", data);
    const decoded = codec.decode("WithOptionalAddress", encoded);
    ok(decoded.maybe_addr instanceof CairoOption);
    ok(decoded.maybe_addr.isNone());
  });

  it("transforms address inside Option<Struct>", () => {
    const wallet = { owner: ADDR_A, balance: 1000n };
    const data = {
      maybe_wallet: new CairoOption(CairoOptionVariant.Some, wallet),
    };
    const encoded = codec.encode("WithOptionalWallet", data);
    const decoded = codec.decode("WithOptionalWallet", encoded);
    ok(decoded.maybe_wallet.isSome());
    deepStrictEqual(decoded.maybe_wallet.unwrap().owner, ADDR_A);
    deepStrictEqual(decoded.maybe_wallet.unwrap().balance, 1000n);
  });

  it("transforms addresses inside Array<Struct>", () => {
    const data = {
      wallets: [
        { owner: ADDR_A, balance: 100n },
        { owner: ADDR_B, balance: 200n },
      ],
    };
    const encoded = codec.encode("WalletList", data);
    const decoded = codec.decode("WalletList", encoded);
    ok(Array.isArray(decoded.wallets));
    deepStrictEqual(decoded.wallets[0].owner, ADDR_A);
    deepStrictEqual(decoded.wallets[1].owner, ADDR_B);
  });

  it("transforms address in nested struct", () => {
    const data = { wallet: { owner: ADDR_B, balance: 50n }, tag: 7n };
    const encoded = codec.encode("NestedStruct", data);
    const decoded = codec.decode("NestedStruct", encoded);
    deepStrictEqual(decoded.wallet.owner, ADDR_B);
    deepStrictEqual(decoded.tag, 7n);
  });

  it("transforms address inside custom enum variant", () => {
    const data = new CairoCustomEnum({ Address: ADDR_A });
    const encoded = codec.encode("Target", data);
    const decoded = codec.decode("Target", encoded);
    ok(decoded instanceof CairoCustomEnum);
    deepStrictEqual(decoded.activeVariant(), "Address");
    deepStrictEqual(decoded.unwrap(), ADDR_A);
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

// -- Constructor ABI fixtures --

const constructorAbi = [
  {
    type: "constructor",
    name: "constructor",
    inputs: [
      { name: "owner", type: "core::starknet::contract_address::ContractAddress" },
      { name: "initial_supply", type: "core::integer::u64" },
    ],
  },
] as const;

const constructorWithStructAbi = [
  {
    type: "struct",
    name: "Config",
    members: [
      { name: "admin", type: "core::starknet::contract_address::ContractAddress" },
      { name: "threshold", type: "core::integer::u64" },
    ],
  },
  {
    type: "constructor",
    name: "constructor",
    inputs: [
      { name: "owner", type: "core::starknet::contract_address::ContractAddress" },
      { name: "config", type: "Config" },
    ],
  },
] as const;

const noConstructorAbi = [
  {
    type: "struct",
    name: "Simple",
    members: [{ name: "value", type: "core::integer::u64" }],
  },
] as const;

// -- Constructor tests --

describe("createTypedCodec (constructor)", () => {
  const codec = createTypedCodec(constructorAbi);

  it("encodes constructor args", () => {
    const result = codec.encodeConstructor({
      owner: ADDR_A,
      initial_supply: 1000n,
    });
    deepStrictEqual(result[0], BigInt(ADDR_A).toString());
    deepStrictEqual(result[1], "1000");
  });

  it("decodes constructor calldata", () => {
    const encoded = codec.encodeConstructor({
      owner: ADDR_A,
      initial_supply: 1000n,
    });
    const decoded = codec.decodeConstructor(encoded);
    deepStrictEqual(decoded.owner, ADDR_A);
    deepStrictEqual(decoded.initial_supply, 1000n);
  });

  it("roundtrips constructor encode → decode", () => {
    const data: ConstructorArgs<typeof constructorAbi> = {
      owner: ADDR_B,
      initial_supply: 42n,
    };
    const encoded = codec.encodeConstructor(data);
    const decoded = codec.decodeConstructor(encoded);
    deepStrictEqual(decoded.owner, ADDR_B);
    deepStrictEqual(decoded.initial_supply, 42n);
  });
});

describe("createTypedCodec (constructor with struct)", () => {
  const codec = createTypedCodec(constructorWithStructAbi);

  it("encodes constructor with nested struct", () => {
    const result = codec.encodeConstructor({
      owner: ADDR_A,
      config: { admin: ADDR_B, threshold: 5n },
    });
    deepStrictEqual(result[0], BigInt(ADDR_A).toString());
    deepStrictEqual(result[1], BigInt(ADDR_B).toString());
    deepStrictEqual(result[2], "5");
  });

  it("decodes constructor with nested struct and address transformation", () => {
    const encoded = codec.encodeConstructor({
      owner: ADDR_A,
      config: { admin: ADDR_B, threshold: 5n },
    });
    const decoded = codec.decodeConstructor(encoded);
    deepStrictEqual(decoded.owner, ADDR_A);
    deepStrictEqual(decoded.config.admin, ADDR_B);
    deepStrictEqual(decoded.config.threshold, 5n);
  });
});

describe("createTypedCodec (no constructor)", () => {
  const codec = createTypedCodec(noConstructorAbi);

  it("throws on encodeConstructor when ABI has no constructor", () => {
    let threw = false;
    try {
      codec.encodeConstructor({} as any);
    } catch (e: any) {
      threw = true;
      ok(e.message.includes("does not contain a constructor"));
    }
    ok(threw, "expected encodeConstructor to throw");
  });

  it("throws on decodeConstructor when ABI has no constructor", () => {
    let threw = false;
    try {
      codec.decodeConstructor(["1"]);
    } catch (e: any) {
      threw = true;
      ok(e.message.includes("does not contain a constructor"));
    }
    ok(threw, "expected decodeConstructor to throw");
  });
});

describe("encodeConstructor / decodeConstructor one-off helpers", () => {
  it("one-off matches codec output", () => {
    const data: ConstructorArgs<typeof constructorAbi> = {
      owner: ADDR_A,
      initial_supply: 500n,
    };
    const codec = createTypedCodec(constructorAbi);
    const fromCodec = codec.encodeConstructor(data);
    const fromOneOff = encodeConstructor(constructorAbi, data);
    deepStrictEqual(fromOneOff, fromCodec);
  });

  it("one-off decode roundtrips", () => {
    const data: ConstructorArgs<typeof constructorAbi> = {
      owner: ADDR_B,
      initial_supply: 99n,
    };
    const encoded = encodeConstructor(constructorAbi, data);
    const decoded = decodeConstructor(constructorAbi, encoded);
    deepStrictEqual(decoded.owner, ADDR_B);
    deepStrictEqual(decoded.initial_supply, 99n);
  });
});

// -- Event ABI fixtures --

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

const eventWithStructAbi = [
  {
    type: "struct",
    name: "PubKey",
    members: [
      { name: "x", type: "core::integer::u128" },
      { name: "y", type: "core::integer::u128" },
    ],
  },
  {
    type: "event",
    name: "Deployed",
    kind: "struct",
    members: [
      { name: "tag", type: "core::felt252", kind: "key" },
      { name: "address", type: "core::starknet::contract_address::ContractAddress", kind: "data" },
      { name: "rate", type: "core::integer::u64", kind: "data" },
    ],
  },
] as const;

const dataOnlyEventAbi = [
  {
    type: "event",
    name: "Log",
    kind: "struct",
    members: [
      { name: "value", type: "core::integer::u64", kind: "data" },
      { name: "flag", type: "core::bool", kind: "data" },
    ],
  },
] as const;

// -- Event tests --

describe("createTypedCodec (events)", () => {
  const codec = createTypedCodec(eventAbi);

  it("encodes event into keys and data", () => {
    const result = codec.encodeEvent("Transfer", {
      from: ADDR_A,
      to: ADDR_B,
      amount: 500n,
    });
    deepStrictEqual(result.keys[0], BigInt(ADDR_A).toString());
    deepStrictEqual(result.keys[1], BigInt(ADDR_B).toString());
    deepStrictEqual(result.data, ["500"]);
  });

  it("decodes event from keys and data with address transformation", () => {
    const encoded = codec.encodeEvent("Transfer", {
      from: ADDR_A,
      to: ADDR_B,
      amount: 500n,
    });
    const decoded = codec.decodeEvent("Transfer", encoded);
    deepStrictEqual(decoded.from, ADDR_A);
    deepStrictEqual(decoded.to, ADDR_B);
    deepStrictEqual(decoded.amount, 500n);
  });

  it("roundtrips event encode → decode", () => {
    const data: AbiEventType<typeof eventAbi, "Transfer"> = {
      from: ADDR_B,
      to: ADDR_A,
      amount: 42n,
    };
    const encoded = codec.encodeEvent("Transfer", data);
    const decoded = codec.decodeEvent("Transfer", encoded);
    deepStrictEqual(decoded.from, ADDR_B);
    deepStrictEqual(decoded.to, ADDR_A);
    deepStrictEqual(decoded.amount, 42n);
  });
});

describe("createTypedCodec (event with struct in data)", () => {
  const codec = createTypedCodec(eventWithStructAbi);

  it("encodes and decodes event with address in data", () => {
    const data = { tag: 123n, address: ADDR_A, rate: 10n };
    const encoded = codec.encodeEvent("Deployed", data);
    // tag is a key
    deepStrictEqual(encoded.keys, ["123"]);
    // address + rate are data
    deepStrictEqual(encoded.data[0], BigInt(ADDR_A).toString());
    deepStrictEqual(encoded.data[1], "10");

    const decoded = codec.decodeEvent("Deployed", encoded);
    deepStrictEqual(decoded.tag, 123n);
    deepStrictEqual(decoded.address, ADDR_A);
    deepStrictEqual(decoded.rate, 10n);
  });
});

describe("createTypedCodec (data-only event)", () => {
  const codec = createTypedCodec(dataOnlyEventAbi);

  it("handles event with no key members", () => {
    const data = { value: 99n, flag: true };
    const encoded = codec.encodeEvent("Log", data);
    deepStrictEqual(encoded.keys, []);
    deepStrictEqual(encoded.data, ["99", "1"]);

    const decoded = codec.decodeEvent("Log", encoded);
    deepStrictEqual(decoded.value, 99n);
    deepStrictEqual(decoded.flag, true);
  });
});

describe("encodeEvent / decodeEvent one-off helpers", () => {
  it("one-off matches codec output", () => {
    const data: AbiEventType<typeof eventAbi, "Transfer"> = {
      from: ADDR_A,
      to: ADDR_B,
      amount: 100n,
    };
    const codec = createTypedCodec(eventAbi);
    const fromCodec = codec.encodeEvent("Transfer", data);
    const fromOneOff = encodeEvent(eventAbi, "Transfer", data);
    deepStrictEqual(fromOneOff, fromCodec);
  });

  it("one-off decode roundtrips", () => {
    const data: AbiEventType<typeof eventAbi, "Transfer"> = {
      from: ADDR_B,
      to: ADDR_A,
      amount: 77n,
    };
    const encoded = encodeEvent(eventAbi, "Transfer", data);
    const decoded = decodeEvent(eventAbi, "Transfer", encoded);
    deepStrictEqual(decoded.from, ADDR_B);
    deepStrictEqual(decoded.to, ADDR_A);
    deepStrictEqual(decoded.amount, 77n);
  });
});
