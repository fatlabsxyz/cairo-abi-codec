import { CallData, type Abi, type RawArgs } from "starknet";

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
  const wrappedAbi: Abi = [
    {
      type: "interface",
      name: "__Wrapper__",
      items: [
        {
          type: "function",
          name: "__encode__",
          inputs: [{ name: "data", type: structType }],
          outputs: [],
          state_mutability: "external",
        },
      ],
    },
    ...structAbi,
  ];

  const callData = new CallData(wrappedAbi);
  return callData.compile("__encode__", [data] as RawArgs) as string[];
}

/**
 * Creates a reusable encoder for a specific struct type.
 * Useful when encoding multiple instances of the same struct.
 */
export function createStructEncoder(structAbi: Abi, structType: string) {
  const wrappedAbi: Abi = [
    {
      type: "interface",
      name: "__Wrapper__",
      items: [
        {
          type: "function",
          name: "__encode__",
          inputs: [{ name: "data", type: structType }],
          outputs: [],
          state_mutability: "external",
        },
      ],
    },
    ...structAbi,
  ];

  const callData = new CallData(wrappedAbi);

  return (data: unknown): string[] => {
    return callData.compile("__encode__", [data] as RawArgs) as string[];
  };
}
