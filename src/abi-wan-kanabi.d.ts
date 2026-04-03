import { CairoOption, CairoResult, CairoCustomEnum } from "starknet";

// starknet.js's augmentation via 'abi-wan-kanabi' doesn't reach
// the Config checked by ResolvedConfig (moduleResolution: node16 resolves
// the subpath 'abi-wan-kanabi/kanabi' to a separate module identity).
// We re-declare all overrides here at the correct path.
// The Config interface that ResolvedConfig checks is defined in
// abi-wan-kanabi's dist/config.d.ts, re-exported via dist/kanabi.d.ts.
// With moduleResolution: node16, 'abi-wan-kanabi/kanabi' resolves as
// a separate module identity, so augmentations must target it directly.
declare module "abi-wan-kanabi/kanabi" {
  interface Config<OptionT = any, ResultT = any, ErrorT = any> {
    Option: CairoOption<OptionT>;
    Result: CairoResult<ResultT, ErrorT>;
    Enum: CairoCustomEnum;
  }
}

// BigIntType/IntType live on the non-generic Config shape.
// They must be augmented at the base module path where
// config.d.ts is resolved from.
declare module "abi-wan-kanabi" {
  interface Config {
    BigIntType: bigint;
    IntType: bigint;
    U256Type: bigint;
  }
}
