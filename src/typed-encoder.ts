import { CallData, type RawArgs } from "starknet";
import type {
  Abi,
  ExtractAbiStructNames,
  StringToPrimitiveType,
} from "abi-wan-kanabi/kanabi";

// Re-export useful types from abi-wan-kanabi
export type { Abi, ExtractAbiStructNames } from "abi-wan-kanabi/kanabi";

// ============================================================================
// Public Type Utilities
// ============================================================================

/**
 * Gets the TypeScript type for a struct defined in the ABI.
 * starknet.js already configures abi-wan-kanabi to use CairoOption<T>
 * for Option types via module declaration merging.
 *
 * @example
 * const abi = [...] as const;
 * type MyStruct = StructType<typeof abi, "MyStruct">;
 */
export type StructType<
  TAbi extends Abi,
  TStructName extends ExtractAbiStructNames<TAbi>,
> = StringToPrimitiveType<TAbi, TStructName>;

// ============================================================================
// Internal Helpers
// ============================================================================

function buildWrappedAbi<TAbi extends Abi>(abi: TAbi) {
  return [
    {
      type: "interface" as const,
      name: "__Wrapper__",
      items: [
        {
          type: "function" as const,
          name: "__codec__",
          inputs: [{ name: "data", type: "__PLACEHOLDER__" }],
          outputs: [{ type: "__PLACEHOLDER__" }],
          state_mutability: "external" as const,
        },
      ],
    },
    ...abi,
  ];
}

function patchAbi(
  wrappedAbi: ReturnType<typeof buildWrappedAbi>,
  structName: string
) {
  return wrappedAbi.map((item) => {
    if (item.type === "interface" && item.name === "__Wrapper__") {
      return {
        ...item,
        items: item.items.map((fn) => ({
          ...fn,
          inputs: [{ name: "data", type: structName }],
          outputs: [{ type: structName }],
        })),
      };
    }
    return item;
  });
}

// ============================================================================
// Type-Safe Codec
// ============================================================================

/**
 * Creates a type-safe codec for structs defined in an ABI.
 * Uses abi-wan-kanabi for type inference.
 *
 * @example
 * const abi = [
 *   { type: "struct", name: "MyStruct", members: [...] },
 * ] as const;
 *
 * const codec = createTypedCodec(abi);
 * const encoded = codec.encode("MyStruct", myData);
 * const decoded = codec.decode("MyStruct", encoded);
 */
export function createTypedCodec<TAbi extends Abi>(abi: TAbi) {
  const wrappedAbi = buildWrappedAbi(abi);

  return {
    encode<TStructName extends ExtractAbiStructNames<TAbi>>(
      structName: TStructName,
      data: StructType<TAbi, TStructName>
    ): string[] {
      const patchedAbi = patchAbi(wrappedAbi, structName);
      const callData = new CallData(patchedAbi);
      return callData.compile("__codec__", [data] as RawArgs) as string[];
    },

    decode<TStructName extends ExtractAbiStructNames<TAbi>>(
      structName: TStructName,
      calldata: string[]
    ): StructType<TAbi, TStructName> {
      const patchedAbi = patchAbi(wrappedAbi, structName);
      const callData = new CallData(patchedAbi);
      return callData.parse(
        "__codec__",
        calldata
      ) as StructType<TAbi, TStructName>;
    },
  };
}

/**
 * One-off type-safe encoding.
 */
export function encodeStructTyped<
  TAbi extends Abi,
  TStructName extends ExtractAbiStructNames<TAbi>,
>(
  abi: TAbi,
  structName: TStructName,
  data: StructType<TAbi, TStructName>
): string[] {
  const codec = createTypedCodec(abi);
  return codec.encode(structName, data);
}

/**
 * One-off type-safe decoding.
 */
export function decodeStructTyped<
  TAbi extends Abi,
  TStructName extends ExtractAbiStructNames<TAbi>,
>(
  abi: TAbi,
  structName: TStructName,
  calldata: string[]
): StructType<TAbi, TStructName> {
  const codec = createTypedCodec(abi);
  return codec.decode(structName, calldata);
}

/** @deprecated Use `createTypedCodec` instead. */
export const createTypedEncoder = createTypedCodec;
