import { describe, it } from "node:test";
import { deepStrictEqual, ok } from "node:assert";
import { CairoOption, CairoOptionVariant } from "starknet";
import {
  createTypedCodec,
  encodeStructTyped,
  decodeStructTyped,
  type StructType,
} from "./typed-encoder.ts";

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

const inner: StructType<typeof structAbi, "InnerStruct"> = {
  value: 100n,
  maybe_number: new CairoOption<bigint>(CairoOptionVariant.Some, 42n),
};

const myStruct: StructType<typeof structAbi, "MyStruct"> = {
  id: 1n,
  maybe_inner: new CairoOption(CairoOptionVariant.Some, inner),
};

const myStructEmpty: StructType<typeof structAbi, "MyStruct"> = {
  id: 2n,
  maybe_inner: new CairoOption(CairoOptionVariant.None),
};

describe("createTypedCodec", () => {
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
    deepStrictEqual(result.maybe_inner.unwrap().value, 100n);
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
    deepStrictEqual(decoded.maybe_inner.unwrap().value, 100n);
    deepStrictEqual(decoded.maybe_inner.unwrap().maybe_number.unwrap(), 42n);
  });
});

describe("encodeStructTyped", () => {
  it("produces same output as createTypedCodec", () => {
    const codec = createTypedCodec(structAbi);
    const fromCodec = codec.encode("MyStruct", myStruct);
    const fromOneOff = encodeStructTyped(structAbi, "MyStruct", myStruct);
    deepStrictEqual(fromOneOff, fromCodec);
  });
});

describe("decodeStructTyped", () => {
  it("produces same output as createTypedCodec", () => {
    const codec = createTypedCodec(structAbi);
    const encoded = codec.encode("MyStruct", myStruct);
    const fromCodec = codec.decode("MyStruct", encoded);
    const fromOneOff = decodeStructTyped(structAbi, "MyStruct", encoded);
    deepStrictEqual(fromOneOff.id, fromCodec.id);
  });
});
