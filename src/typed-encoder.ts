import { CallData, type Abi as StarknetAbi, type RawArgs } from "starknet";
import type {
  Abi,
  ExtractAbiStructNames,
  ExtractAbiEnumNames,
  StringToPrimitiveType,
} from "abi-wan-kanabi/kanabi";

// Re-export useful types from abi-wan-kanabi
export type { Abi, ExtractAbiStructNames, ExtractAbiEnumNames } from "abi-wan-kanabi/kanabi";

// ============================================================================
// Public Type Utilities
// ============================================================================

/** Union of all struct and enum type names in the ABI. */
export type ExtractAbiTypeNames<TAbi extends Abi> =
  | ExtractAbiStructNames<TAbi>
  | ExtractAbiEnumNames<TAbi>;

export type ExtractAbiType<TAbi extends Abi, K extends ExtractAbiTypeNames<TAbi>> =
  Extract<TAbi[number], { type: "struct" | "enum"; name: K; }>;

export type FilterTuple<T extends readonly any[], Match> =
  T extends readonly [infer Head, ...infer Tail]
  ? Head extends Match
  ? [Head, ...FilterTuple<Tail, Match>]
  : FilterTuple<Tail, Match>
  : [];

export type NarrowedAbi<
  TAbi extends Abi,
  TNames extends readonly ExtractAbiTypeNames<TAbi>[]
> = FilterTuple<TAbi, { name: TNames[number]; }>;

export function narrowAbi<
  TAbi extends Abi,
  const TNames extends readonly ExtractAbiTypeNames<TAbi>[]
>(abi: TAbi, names: TNames):
  FilterTuple<TAbi, { name: TNames[number]; }> {
  return abi.filter(
    (item): item is ExtractAbiType<TAbi, TNames[number]> =>
      (item.type === "struct" || item.type === "enum") &&
      (names as readonly string[]).includes(item.name)
  ) as FilterTuple<TAbi, { name: TNames[number]; }>;
}


/**
 * Gets the TypeScript type for a struct or enum defined in the ABI.
 * starknet.js configures abi-wan-kanabi to use CairoOption<T> for Options
 * and CairoCustomEnum for custom enums via module declaration merging.
 */
export type AbiType<
  TAbi extends Abi,
  TName extends ExtractAbiTypeNames<TAbi>,
> = StringToPrimitiveType<TAbi, TName>;

/** @deprecated Use `AbiType` instead. */
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

const ADDRESS_TYPES = new Set([
  "core::starknet::contract_address::ContractAddress",
  "core::starknet::eth_address::EthAddress",
]);

function toChecksumAddress(value: bigint | string | number): string {
  return "0x" + BigInt(value).toString(16).padStart(64, "0");
}

/**
 * Build a lookup of struct/enum member types from the ABI.
 * Returns a map: typeName -> { memberName -> cairoType }
 */
function buildTypeMap(abi: StarknetAbi): Map<string, Map<string, string>> {
  const typeMap = new Map<string, Map<string, string>>();
  for (const entry of abi) {
    if (entry.type === "struct" && "members" in entry) {
      const members = new Map<string, string>();
      for (const m of entry.members) {
        members.set(m.name, m.type);
      }
      typeMap.set(entry.name, members);
    }
  }
  return typeMap;
}

/**
 * Recursively walk a decoded struct and transform address fields
 * from bigint/number to 0x-prefixed, zero-padded hex strings.
 */
function transformAddresses(
  value: unknown,
  cairoType: string,
  typeMap: Map<string, Map<string, string>>
): unknown {
  if (ADDRESS_TYPES.has(cairoType)) {
    return toChecksumAddress(value as bigint | string | number);
  }
  const members = typeMap.get(cairoType);
  if (members && typeof value === "object" && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const memberType = members.get(key);
      if (memberType) {
        result[key] = transformAddresses(val, memberType, typeMap);
      } else {
        result[key] = val;
      }
    }
    return result;
  }
  return value;
}

// ============================================================================
// Type-Safe Codec
// ============================================================================


/**
 * Creates a type-safe codec for structs and enums defined in an ABI.
 * Uses abi-wan-kanabi for type inference.
 *
 * @example
 * const codec = createTypedCodec(abi);
 * const encoded = codec.encode("MyStruct", myData);
 * const decoded = codec.decode("MyStruct", encoded);
 * const enumEncoded = codec.encode("Direction", myEnum);
 */
export function createTypedCodec<TAbi extends Abi>(abi: TAbi) {
  const wrappedAbi = buildWrappedAbi(abi);
  const typeMap = buildTypeMap(abi as unknown as StarknetAbi);

  return {
    encode<TName extends ExtractAbiTypeNames<TAbi>>(
      typeName: TName,
      data: AbiType<TAbi, TName>
    ): string[] {
      const patchedAbi = patchAbi(wrappedAbi, typeName);
      const callData = new CallData(patchedAbi);
      return callData.compile("__codec__", [data] as RawArgs) as string[];
    },

    decode<TName extends ExtractAbiTypeNames<TAbi>>(
      typeName: TName,
      calldata: string[]
    ): AbiType<TAbi, TName> {
      const patchedAbi = patchAbi(wrappedAbi, typeName);
      const callData = new CallData(patchedAbi);
      const raw = callData.parse("__codec__", calldata);
      return transformAddresses(raw, typeName, typeMap) as AbiType<TAbi, TName>;
    },
  };
}

/**
 * One-off type-safe encoding.
 */
export function encodeTyped<
  TAbi extends Abi,
  TName extends ExtractAbiTypeNames<TAbi>,
>(abi: TAbi, typeName: TName, data: AbiType<TAbi, TName>): string[] {
  return createTypedCodec(abi).encode(typeName, data);
}

/**
 * One-off type-safe decoding.
 */
export function decodeTyped<
  TAbi extends Abi,
  TName extends ExtractAbiTypeNames<TAbi>,
>(abi: TAbi, typeName: TName, calldata: string[]): AbiType<TAbi, TName> {
  return createTypedCodec(abi).decode(typeName, calldata);
}

/** @deprecated Use `createTypedCodec` instead. */
export const createTypedEncoder = createTypedCodec;
/** @deprecated Use `encodeTyped` instead. */
export const encodeStructTyped = encodeTyped;
/** @deprecated Use `decodeTyped` instead. */
export const decodeStructTyped = decodeTyped;
