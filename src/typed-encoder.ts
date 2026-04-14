import {
  CallData,
  CairoOption,
  CairoCustomEnum,
  CairoResult,
  type Abi as StarknetAbi,
  type RawArgs,
} from "starknet";
import type {
  Abi,
  ExtractAbiStructNames,
  ExtractAbiEnumNames,
  StringToPrimitiveType,
} from "abi-wan-kanabi/kanabi";

// Re-export useful types from abi-wan-kanabi
export type { Abi, ExtractAbiStructNames, ExtractAbiEnumNames } from "abi-wan-kanabi/kanabi";

// ============================================================================
// Constructor Type Utilities
// ============================================================================

/** Extracts the constructor entry from an ABI. */
export type ExtractAbiConstructor<TAbi extends Abi> =
  Extract<TAbi[number], { type: "constructor" }>;

/** Typed object for constructor arguments, keyed by input name. */
export type ConstructorArgs<TAbi extends Abi> = {
  [K in ExtractAbiConstructor<TAbi>["inputs"][number] as K["name"]]: StringToPrimitiveType<
    TAbi,
    K["type"]
  >;
};

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

type TypeInfo =
  | { kind: "struct"; members: Map<string, string> }
  | { kind: "enum"; variants: Map<string, string> };

/**
 * Build a lookup of struct and enum member/variant types from the ABI.
 */
function buildTypeMap(abi: StarknetAbi): Map<string, TypeInfo> {
  const typeMap = new Map<string, TypeInfo>();
  for (const entry of abi) {
    if (entry.type === "struct" && "members" in entry) {
      const members = new Map<string, string>();
      for (const m of entry.members) {
        members.set(m.name, m.type);
      }
      typeMap.set(entry.name, { kind: "struct", members });
    } else if (entry.type === "enum" && "variants" in entry) {
      const variants = new Map<string, string>();
      for (const v of entry.variants) {
        variants.set(v.name, v.type);
      }
      typeMap.set(entry.name, { kind: "enum", variants });
    }
  }
  return typeMap;
}

const OPTION_RE = /^core::option::Option::<(.+)>$/;
const RESULT_RE = /^core::result::Result::<(.+),\s*(.+)>$/;
const ARRAY_RE = /^core::array::(?:Array|Span)::<(.+)>$/;

function extractInnerType(cairoType: string): { wrapper: string; inner: string[] } | null {
  let m = OPTION_RE.exec(cairoType);
  if (m) return { wrapper: "option", inner: [m[1]] };
  m = RESULT_RE.exec(cairoType);
  if (m) return { wrapper: "result", inner: [m[1], m[2]] };
  m = ARRAY_RE.exec(cairoType);
  if (m) return { wrapper: "array", inner: [m[1]] };
  return null;
}

/**
 * Recursively walk a decoded value and transform address fields
 * from bigint/number to 0x-prefixed, zero-padded hex strings.
 * Handles structs, Options, Results, CustomEnums, and arrays.
 */
function transformAddresses(
  value: unknown,
  cairoType: string,
  typeMap: Map<string, TypeInfo>
): unknown {
  // Direct address type
  if (ADDRESS_TYPES.has(cairoType)) {
    return toChecksumAddress(value as bigint | string | number);
  }

  // Generic wrappers: Option<T>, Result<T,E>, Array<T>
  const generic = extractInnerType(cairoType);
  if (generic) {
    if (generic.wrapper === "option" && value instanceof CairoOption) {
      if (value.isNone()) return value;
      const inner = transformAddresses(value.unwrap(), generic.inner[0], typeMap);
      return new CairoOption(0, inner); // 0 = Some
    }
    if (generic.wrapper === "result" && value instanceof CairoResult) {
      if (value.isOk()) {
        const inner = transformAddresses(value.unwrap(), generic.inner[0], typeMap);
        return new CairoResult(0, inner); // 0 = Ok
      }
      const inner = transformAddresses(value.unwrap(), generic.inner[1], typeMap);
      return new CairoResult(1, inner); // 1 = Err
    }
    if (generic.wrapper === "array" && Array.isArray(value)) {
      return value.map((el) => transformAddresses(el, generic.inner[0], typeMap));
    }
  }

  const info = typeMap.get(cairoType);
  if (!info || typeof value !== "object" || value === null) return value;

  // Struct: transform each member
  if (info.kind === "struct") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const memberType = info.members.get(key);
      result[key] = memberType ? transformAddresses(val, memberType, typeMap) : val;
    }
    return result;
  }

  // Custom enum (CairoCustomEnum): transform the active variant's data
  if (info.kind === "enum" && value instanceof CairoCustomEnum) {
    const active = value.activeVariant();
    const variantType = info.variants.get(active);
    if (variantType && variantType !== "()") {
      const transformed = transformAddresses(value.unwrap(), variantType, typeMap);
      return new CairoCustomEnum({ [active]: transformed });
    }
    return value;
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

  // Precompute constructor codec if the ABI has a constructor
  const constructorEntry = (abi as readonly any[]).find(
    (e: any) => e.type === "constructor"
  );
  let constructorCallData: CallData | undefined;
  let constructorTypeMap: Map<string, TypeInfo> | undefined;
  if (constructorEntry) {
    const syntheticStruct = {
      type: "struct" as const,
      name: "__ConstructorArgs__",
      members: (constructorEntry.inputs as readonly any[]).map((i: any) => ({
        name: i.name,
        type: i.type,
      })),
    };
    const typeEntries = (abi as readonly any[]).filter(
      (e: any) => e.type === "struct" || e.type === "enum"
    );
    const constructorAbi = [syntheticStruct, ...typeEntries];
    const wrapped = buildWrappedAbi(constructorAbi as unknown as Abi);
    const patched = patchAbi(wrapped, "__ConstructorArgs__");
    constructorCallData = new CallData(patched);
    constructorTypeMap = buildTypeMap(constructorAbi as unknown as StarknetAbi);
  }

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

    encodeConstructor(data: ConstructorArgs<TAbi>): string[] {
      if (!constructorCallData) {
        throw new Error("ABI does not contain a constructor");
      }
      return constructorCallData.compile("__codec__", [data] as RawArgs) as string[];
    },

    decodeConstructor(calldata: string[]): ConstructorArgs<TAbi> {
      if (!constructorCallData || !constructorTypeMap) {
        throw new Error("ABI does not contain a constructor");
      }
      const raw = constructorCallData.parse("__codec__", calldata);
      return transformAddresses(raw, "__ConstructorArgs__", constructorTypeMap) as ConstructorArgs<TAbi>;
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

/**
 * One-off constructor encoding.
 */
export function encodeConstructor<TAbi extends Abi>(
  abi: TAbi,
  data: ConstructorArgs<TAbi>
): string[] {
  return createTypedCodec(abi).encodeConstructor(data);
}

/**
 * One-off constructor decoding.
 */
export function decodeConstructor<TAbi extends Abi>(
  abi: TAbi,
  calldata: string[]
): ConstructorArgs<TAbi> {
  return createTypedCodec(abi).decodeConstructor(calldata);
}

