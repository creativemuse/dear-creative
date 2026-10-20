"use client";

import React, { useState } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { base } from "wagmi/chains";

export interface QuickTradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetMeTokenAddress: `0x${string}`;
  targetSymbol: string;
  creatorName: string;
}

// MeTokens Diamond / FoundryFacet Router on Base
export const METOKEN_DIAMOND_BASE = (process.env.NEXT_PUBLIC_METOKEN_DIAMOND_ADDRESS ||
  "0x0000000000000000000000000000000000000000") as `0x${string}`;
export const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

// Minimal FoundryFacet ABI for buy / deposit
export const FOUNDRY_FACET_ABI = [
  {
    name: "calculateReturn",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "meToken", type: "address" },
      { name: "depositToken", type: "address" },
      { name: "depositAmount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "mint",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "meToken", type: "address" },
      { name: "depositToken", type: "address" },
      { name: "depositAmount", type: "uint256" },
      { name: "minReturn", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export function QuickTradeModal({
  isOpen,
  onClose,
  targetMeTokenAddress,
  targetSymbol,
  creatorName,
}: QuickTradeModalProps) {
  const { isConnected } = useAccount();
  const [usdcAmount, setUsdcAmount] = useState("5.00");

  const parsedDeposit = parseUnits(usdcAmount || "0", 6);

  // Estimate return from FoundryFacet bonding curve
  const { data: estimatedReturn } = useReadContract({
    address: METOKEN_DIAMOND_BASE,
    abi: FOUNDRY_FACET_ABI,
    functionName: "calculateReturn",
    args: [targetMeTokenAddress, USDC_BASE, parsedDeposit],
    chainId: base.id,
    query: {
      enabled: Boolean(
        targetMeTokenAddress &&
          parseFloat(usdcAmount) > 0 &&
          METOKEN_DIAMOND_BASE !== "0x0000000000000000000000000000000000000000",
      ),
    },
  });

  const { data: txHash, isPending, writeContract } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  if (!isOpen) return null;

  const handleExecuteTrade = () => {
    const depositAmount = parseUnits(usdcAmount, 6);
    writeContract({
      address: METOKEN_DIAMOND_BASE,
      abi: FOUNDRY_FACET_ABI,
      functionName: "mint",
      chainId: base.id,
      args: [targetMeTokenAddress, USDC_BASE, depositAmount, BigInt(0)],
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-md rounded-2xl bg-zinc-950 border border-zinc-800 p-6 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div>
            <h3 className="text-base font-semibold text-white">
              Quick Trade: ${targetSymbol}
            </h3>
            <p className="text-xs text-zinc-400">Back {creatorName} on Base</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-white text-sm p-1 rounded-md"
            aria-label="Close trade dialog"
          >
            ✕
          </button>
        </div>

        {/* Input Card */}
        <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-2">
          <div className="flex justify-between text-xs text-zinc-400 font-mono">
            <span>Pay With</span>
            <span>Asset: USDC</span>
          </div>
          <div className="flex items-center justify-between">
            <input
              type="number"
              step="1"
              min="1"
              value={usdcAmount}
              onChange={(e) => setUsdcAmount(e.target.value)}
              className="bg-transparent text-xl font-bold font-mono text-white focus:outline-none w-2/3"
            />
            <span className="text-xs font-semibold px-2 py-1 rounded bg-zinc-800 text-blue-400">
              USDC (Base)
            </span>
          </div>
        </div>

        {/* Output Estimation */}
        <div className="p-4 rounded-xl bg-zinc-900/30 border border-zinc-800/80 space-y-1">
          <div className="text-[11px] text-zinc-500 font-mono">
            Estimated Received
          </div>
          <div className="text-lg font-bold font-mono text-emerald-400">
            {estimatedReturn
              ? Number(formatUnits(estimatedReturn, 18)).toFixed(3)
              : "0.000"}{" "}
            ${targetSymbol}
          </div>
        </div>

        <button
          type="button"
          onClick={handleExecuteTrade}
          disabled={!isConnected || isPending || isConfirming}
          className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold uppercase tracking-wider transition disabled:opacity-50"
        >
          {!isConnected
            ? "Connect Wallet"
            : isPending
              ? "Approve in Wallet..."
              : isConfirming
                ? "Mining Swap on Base..."
                : `Swap ${usdcAmount} USDC for $${targetSymbol}`}
        </button>

        {isSuccess && (
          <p className="text-xs text-emerald-400 text-center font-mono">
            Trade Complete! You are now holding ${targetSymbol}.
          </p>
        )}
      </div>
    </div>
  );
}
