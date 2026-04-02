import { describe, it } from "node:test";
import { deepStrictEqual, ok } from "node:assert";
import { CairoOption, CairoOptionVariant } from "starknet";
import {
  encodeStruct,
  decodeStruct,
  createStructCodec,
  createStructEncoder,
} from "./encoder.ts";

const structAbi = [
  {
    type: "struct" as const,
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
    type: "struct" as const,
    name: "MyStruct",
    members: [
      { name: "id", type: "core::integer::u64" },
      { name: "maybe_inner", type: "core::option::Option::<InnerStruct>" },
    ],
  },
  {
    type: "enum" as const,
    name: "core::option::Option::<core::integer::u64>",
    variants: [
      { name: "Some", type: "core::integer::u64" },
      { name: "None", type: "()" },
    ],
  },
  {
    type: "enum" as const,
    name: "core::option::Option::<InnerStruct>",
    variants: [
      { name: "Some", type: "InnerStruct" },
      { name: "None", type: "()" },
    ],
  },
];

describe("encodeStruct", () => {
  it("encodes a simple struct", () => {
    const simpleAbi = [
      {
        type: "struct" as const,
        name: "Simple",
        members: [
          { name: "a", type: "core::integer::u64" },
          { name: "b", type: "core::integer::u64" },
        ],
      },
    ];
    const result = encodeStruct(simpleAbi, "Simple", { a: 1n, b: 2n });
    deepStrictEqual(result, ["1", "2"]);
  });

  it("encodes nested struct with Option Some", () => {
    const inner = {
      value: 100n,
      maybe_number: new CairoOption<bigint>(CairoOptionVariant.Some, 42n),
    };
    const data = {
      id: 1n,
      maybe_inner: new CairoOption(CairoOptionVariant.Some, inner),
    };
    const result = encodeStruct(structAbi, "MyStruct", data);
    deepStrictEqual(result, ["1", "0", "100", "0", "42"]);
  });

  it("encodes nested struct with Option None", () => {
    const data = {
      id: 2n,
      maybe_inner: new CairoOption(CairoOptionVariant.None),
    };
    const result = encodeStruct(structAbi, "MyStruct", data);
    deepStrictEqual(result, ["2", "1"]);
  });
});

describe("decodeStruct", () => {
  it("decodes a simple struct", () => {
    const simpleAbi = [
      {
        type: "struct" as const,
        name: "Simple",
        members: [
          { name: "a", type: "core::integer::u64" },
          { name: "b", type: "core::integer::u64" },
        ],
      },
    ];
    const result = decodeStruct(simpleAbi, "Simple", ["1", "2"]) as any;
    deepStrictEqual(result.a, 1n);
    deepStrictEqual(result.b, 2n);
  });

  it("decodes nested struct with Option Some", () => {
    const result = decodeStruct(structAbi, "MyStruct", [
      "1", "0", "100", "0", "42",
    ]) as any;
    deepStrictEqual(result.id, 1n);
    ok(result.maybe_inner instanceof CairoOption);
    deepStrictEqual(result.maybe_inner.unwrap().value, 100n);
    deepStrictEqual(result.maybe_inner.unwrap().maybe_number.unwrap(), 42n);
  });

  it("decodes nested struct with Option None", () => {
    const result = decodeStruct(structAbi, "MyStruct", ["2", "1"]) as any;
    deepStrictEqual(result.id, 2n);
    ok(result.maybe_inner instanceof CairoOption);
    ok(result.maybe_inner.isNone());
  });
});

describe("createStructCodec", () => {
  it("roundtrips encode → decode", () => {
    const codec = createStructCodec(structAbi, "MyStruct");
    const data = {
      id: 5n,
      maybe_inner: new CairoOption(CairoOptionVariant.None),
    };
    const encoded = codec.encode(data);
    const decoded = codec.decode(encoded) as any;
    deepStrictEqual(decoded.id, 5n);
    ok(decoded.maybe_inner.isNone());
  });
});

describe("createStructEncoder (deprecated)", () => {
  it("still works for backwards compatibility", () => {
    const encode = createStructEncoder(structAbi, "MyStruct");
    const data = {
      id: 5n,
      maybe_inner: new CairoOption(CairoOptionVariant.None),
    };
    const result = encode(data);
    deepStrictEqual(result, ["5", "1"]);
  });
});
