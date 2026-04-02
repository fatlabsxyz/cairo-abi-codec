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
// Type-Safe Encoder
// ============================================================================

/**
 * Creates a type-safe encoder for structs defined in an ABI.
 * Uses abi-wan-kanabi for type inference.
 *
 * @example
 * const abi = [
 *   { type: "struct", name: "MyStruct", members: [...] },
 * ] as const;
 *
 * const encoder = createTypedEncoder(abi);
 * const encoded = encoder.encode("MyStruct", myData); // Type-checked!
 */
export function createTypedEncoder<TAbi extends Abi>(abi: TAbi) {
  const wrappedAbi = [
    {
      type: "interface" as const,
      name: "__Wrapper__",
      items: [
        {
          type: "function" as const,
          name: "__encode__",
          inputs: [{ name: "data", type: "__PLACEHOLDER__" }],
          outputs: [],
          state_mutability: "external" as const,
        },
      ],
    },
    ...abi,
  ];

  return {
    /**
     * Encodes a struct to calldata.
     * @param structName - The name of the struct type (autocompleted from ABI)
     * @param data - The data to encode (type-checked against ABI)
     */
    encode<TStructName extends ExtractAbiStructNames<TAbi>>(
      structName: TStructName,
      data: StructType<TAbi, TStructName>
    ): string[] {
      // Patch the placeholder with the actual struct type
      const patchedAbi = wrappedAbi.map((item) => {
        if (item.type === "interface" && item.name === "__Wrapper__") {
          return {
            ...item,
            items: item.items.map((fn) => ({
              ...fn,
              inputs: [{ name: "data", type: structName }],
            })),
          };
        }
        return item;
      });

      const callData = new CallData(patchedAbi);
      return callData.compile("__encode__", [data] as RawArgs) as string[];
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
  const encoder = createTypedEncoder(abi);
  return encoder.encode(structName, data);
}
