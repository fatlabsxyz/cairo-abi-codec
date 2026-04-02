import { CallData, type Abi, type RawArgs } from "starknet";

function wrapAbi(structAbi: Abi, structType: string): Abi {
  return [
    {
      type: "interface",
      name: "__Wrapper__",
      items: [
        {
          type: "function",
          name: "__encode__",
          inputs: [{ name: "data", type: structType }],
          outputs: [{ type: structType }],
          state_mutability: "external",
        },
      ],
    },
    ...structAbi,
  ];
}

/**
 * Encodes a Cairo struct to calldata without needing a full contract ABI.
 *
 * @param structAbi - Array of ABI type definitions (structs, enums) needed to encode the data
 * @param structType - The name of the root struct type to encode
 * @param data - The data to encode
 * @returns Encoded calldata as string array
 */
export function encodeStruct(
  structAbi: Abi,
  structType: string,
  data: unknown
): string[] {
  const callData = new CallData(wrapAbi(structAbi, structType));
  return callData.compile("__encode__", [data] as RawArgs) as string[];
}

/**
 * Decodes calldata back into a structured object.
 *
 * @param structAbi - Array of ABI type definitions (structs, enums) needed to decode the data
 * @param structType - The name of the root struct type to decode
 * @param calldata - The encoded calldata string array
 * @returns Decoded struct data
 */
export function decodeStruct(
  structAbi: Abi,
  structType: string,
  calldata: string[]
): unknown {
  const callData = new CallData(wrapAbi(structAbi, structType));
  const result = callData.parse("__encode__", calldata);
  return result;
}

/**
 * Creates a reusable encoder/decoder for a specific struct type.
 * Useful when encoding/decoding multiple instances of the same struct.
 */
export function createStructCodec(structAbi: Abi, structType: string) {
  const callData = new CallData(wrapAbi(structAbi, structType));

  return {
    encode(data: unknown): string[] {
      return callData.compile("__encode__", [data] as RawArgs) as string[];
    },
    decode(calldata: string[]): unknown {
      return callData.parse("__encode__", calldata);
    },
  };
}

/**
 * @deprecated Use `createStructCodec` instead.
 */
export function createStructEncoder(structAbi: Abi, structType: string) {
  const codec = createStructCodec(structAbi, structType);
  return codec.encode;
}
