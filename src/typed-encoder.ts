import { CallData, CairoOption, type RawArgs } from "starknet";

// ============================================================================
// ABI Type Definitions (from abi-wan-kanabi)
// ============================================================================

type AbiParameter = { name: string; type: string };
type AbiMember = { name: string; type: string };

type AbiStruct = {
  type: "struct";
  name: string;
  members: readonly AbiMember[];
};

type AbiEnum = {
  type: "enum";
  name: string;
  variants: readonly AbiParameter[];
};

type AbiInterface = {
  type: "interface";
  name: string;
  items: readonly AbiFunction[];
};

type AbiFunction = {
  type: "function";
  name: string;
  inputs: readonly AbiParameter[];
  outputs: readonly { type: string }[];
  state_mutability: "view" | "external";
};

export type Abi = readonly (AbiStruct | AbiEnum | AbiInterface | AbiFunction)[];

// ============================================================================
// Type Extraction Utilities
// ============================================================================

type ExtractAbiStructs<TAbi extends Abi> = Extract<TAbi[number], { type: "struct" }>;
type ExtractAbiEnums<TAbi extends Abi> = Extract<TAbi[number], { type: "enum" }>;

export type ExtractAbiStructNames<TAbi extends Abi> = ExtractAbiStructs<TAbi>["name"];

type ExtractAbiStruct<
  TAbi extends Abi,
  TStructName extends string,
> = Extract<ExtractAbiStructs<TAbi>, { name: TStructName }>;

type ExtractAbiEnum<
  TAbi extends Abi,
  TEnumName extends string,
> = Extract<ExtractAbiEnums<TAbi>, { name: TEnumName }>;

// ============================================================================
// Cairo Primitive Types
// ============================================================================

type CairoFelt = "core::felt252";
type CairoInt = `core::integer::u${8 | 16 | 32}`;
type CairoBigInt = `core::integer::u${64 | 128}`;
type CairoU256 = "core::integer::u256";
type CairoBool = "core::bool";
type CairoVoid = "()";
type CairoContractAddress = "core::starknet::contract_address::ContractAddress";
type CairoByteArray = "core::byte_array::ByteArray";

type CairoPrimitive =
  | CairoFelt
  | CairoInt
  | CairoBigInt
  | CairoU256
  | CairoBool
  | CairoVoid
  | CairoContractAddress
  | CairoByteArray;

// ============================================================================
// Generic Type Patterns
// ============================================================================

type CairoOptionPattern<T extends string> = `core::option::Option::<${T}>`;
type CairoArrayPattern<T extends string> =
  | `core::array::Array::<${T}>`
  | `core::array::Span::<${T}>`;

// ============================================================================
// Primitive Type Mapping
// ============================================================================

type PrimitiveTypeMap = {
  [K in CairoFelt]: bigint | number | string;
} & {
  [K in CairoInt]: number;
} & {
  [K in CairoBigInt]: bigint;
} & {
  [K in CairoU256]: bigint | { low: bigint; high: bigint };
} & {
  [K in CairoBool]: boolean;
} & {
  [K in CairoVoid]: void;
} & {
  [K in CairoContractAddress]: string;
} & {
  [K in CairoByteArray]: string;
};

// ============================================================================
// Main Type Conversion: ABI String -> TypeScript Type
// ============================================================================

/**
 * Converts a Cairo type string to its TypeScript equivalent.
 * Uses CairoOption<T> for option types (compatible with starknet.js runtime).
 */
export type AbiTypeToPrimitive<
  TAbi extends Abi,
  T extends string,
> =
  // Primitive types
  T extends CairoPrimitive
    ? PrimitiveTypeMap[T]
    // Option<T> -> CairoOption<T>
    : T extends CairoOptionPattern<infer Inner>
      ? CairoOption<AbiTypeToPrimitive<TAbi, Inner>>
      // Array<T> -> T[]
      : T extends CairoArrayPattern<infer Inner>
        ? AbiTypeToPrimitive<TAbi, Inner>[]
        // Struct lookup
        : ExtractAbiStruct<TAbi, T> extends {
              type: "struct";
              members: infer TMembers extends readonly AbiMember[];
            }
          ? {
              [M in TMembers[number] as M["name"]]: AbiTypeToPrimitive<TAbi, M["type"]>;
            }
          // Enum lookup (union of variants)
          : ExtractAbiEnum<TAbi, T> extends {
                type: "enum";
                variants: infer TVariants extends readonly AbiParameter[];
              }
            ? {
                [V in TVariants[number] as V["name"]]: AbiTypeToPrimitive<TAbi, V["type"]>;
              }[TVariants[number]["name"]]
            // Unknown type
            : unknown;

/**
 * Gets the TypeScript type for a struct defined in the ABI.
 */
export type StructType<
  TAbi extends Abi,
  TStructName extends ExtractAbiStructNames<TAbi>,
> = AbiTypeToPrimitive<TAbi, TStructName>;

// ============================================================================
// Type-Safe Encoder
// ============================================================================

/**
 * Creates a type-safe encoder for structs defined in an ABI.
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
