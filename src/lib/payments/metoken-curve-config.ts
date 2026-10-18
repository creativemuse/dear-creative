/** meToken / CRTVAI curve constants (aligned with Creative Pixels staging). */

export const BASE_CHAIN_ID = 8453;

export const METOKENS_DIAMOND_ADDRESS =
  "0xba5502db2aC2cBff189965e991C07109B14eB3f5" as const;

/** CRTVAI ERC-20 on Base (not the meTokens Diamond). */
export const CRTVAI_TOKEN_ADDRESS =
  "0xecb695544a3d2a64d579b3828f3f60f6932f4846" as const;

export const CRTVAI_DECIMALS = 18;

export const METOKEN_HUB_ID = 2;

export const METOKEN_VAULT_ADDRESS =
  "0xd4b3f4d2c44Feba751F30e19D7e1047A29eE085d" as const;

export const BASE_USDC_ADDRESS =
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

export const METOKEN_CURVE_RPC_TIMEOUT_MS = 8_000;

/** Subscription quote lifetime (seconds). */
export const SUBSCRIPTION_QUOTE_EXPIRY_SECONDS = 300;

/** Slippage band vs quoted CRTVAI at settlement (basis points). */
export const SUBSCRIPTION_QUOTE_SLIPPAGE_BPS = 250;

/** Reject new quotes when curve output moved more than this vs recent stored quote. */
export const SUBSCRIPTION_CURVE_STABILITY_MAX_BPS = 2_000;

export const SUBSCRIPTION_CURVE_STABILITY_WINDOW_MS = 10 * 60 * 1000;
