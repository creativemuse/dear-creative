import { getAddress, type Address } from "viem";
import {
  BASE_USDC_ADDRESS,
  CRTVAI_DECIMALS,
  CRTVAI_TOKEN_ADDRESS,
} from "./metoken-curve-config";

export const paymentTokenEnum = ["usdc", "crtvai"] as const;
export type PaymentTokenRail = (typeof paymentTokenEnum)[number];

export type ResolvedPaymentToken = {
  rail: PaymentTokenRail;
  tokenAddress: Address;
  decimals: number;
};

/** Reads PAYMENT_TOKEN (`usdc` | `crtvai`, default `usdc`). Invalid values fail closed (null). */
export function paymentTokenRail(): PaymentTokenRail | null {
  const raw = process.env.PAYMENT_TOKEN?.trim().toLowerCase();
  if (!raw) {
    return "usdc";
  }
  if (raw === "usdc" || raw === "crtvai") {
    return raw;
  }
  return null;
}

export function resolvePaymentTokenForQuote(): ResolvedPaymentToken | null {
  const rail = paymentTokenRail();
  if (!rail) {
    return null;
  }
  if (rail === "usdc") {
    return {
      rail,
      tokenAddress: getAddress(BASE_USDC_ADDRESS),
      decimals: 6,
    };
  }
  return {
    rail,
    tokenAddress: getAddress(CRTVAI_TOKEN_ADDRESS),
    decimals: CRTVAI_DECIMALS,
  };
}
