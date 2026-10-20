"use client";

import React from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { base } from "wagmi/chains";

const CRTVAI_TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_CRTVAI_ADDRESS ||
  "0x0000000000000000000000000000000000000000") as `0x${string}`;
const METOKEN_HUB_ROUTER = (process.env.NEXT_PUBLIC_METOKEN_ROUTER_ADDRESS ||
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

// Required holding threshold set to 10 CRTVAI
const REQUIRED_BALANCE = parseUnits("10", 18);

const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const METOKEN_ROUTER_ABI = [
  {
    name: "buy",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "meToken", type: "address" },
      { name: "depositAmount", type: "uint256" },
      { name: "minReturn", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

interface DispatchAssetGateProps {
  slug: string;
  assetTitle: string;
  assetDescription?: string;
  children: React.ReactNode;
}

export function DispatchAssetGate({
  slug,
  assetTitle,
  assetDescription = "Access the full execution pipeline, agent prompt templates, and raw schema designs.",
  children,
}: DispatchAssetGateProps) {
  const { address, isConnected } = useAccount();

  // 1. Read CRTVAI balance on Base
  const { data: balance, refetch } = useReadContract({
    address: CRTVAI_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: base.id,
    query: {
      enabled:
        !!address &&
        CRTVAI_TOKEN_ADDRESS !== "0x0000000000000000000000000000000000000000",
    },
  });

  // 2. Bonding curve mint action (mints ~10 CRTVAI with USDC)
  const { data: txHash, isPending, writeContract } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  React.useEffect(() => {
    if (isSuccess) refetch();
  }, [isSuccess, refetch]);

  const hasAccess = balance ? balance >= REQUIRED_BALANCE : false;

  if (hasAccess) {
    return (
      <div
        id={`dispatch-asset-gate-${slug}`}
        className="relative my-8 border border-zinc-700/60 bg-zinc-900/60 rounded-xl overflow-hidden p-6 shadow-xl"
      >
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-xs font-mono font-medium tracking-wide text-zinc-300 uppercase">
              Execution Asset Unlocked
            </span>
          </div>
          <span className="text-xs text-zinc-500 font-mono">
            CRTVAI Staker (
            {balance ? Number(formatUnits(balance, 18)).toFixed(1) : "10"} held)
          </span>
        </div>
        {children}
      </div>
    );
  }

  const handleMintWithUsdc = () => {
    // Deposit 1 USDC into the curve to mint qualifying CRTVAI
    const depositUsdc = parseUnits("1", 6);
    writeContract({
      address: METOKEN_HUB_ROUTER,
      abi: METOKEN_ROUTER_ABI,
      functionName: "buy",
      chainId: base.id,
      args: [CRTVAI_TOKEN_ADDRESS, depositUsdc, BigInt(0)],
    });
  };

  return (
    <div
      id={`dispatch-asset-gate-${slug}`}
      className="relative my-8 border border-zinc-800 bg-zinc-950 rounded-2xl p-6 md:p-8 text-center space-y-4 max-w-lg mx-auto"
    >
      <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400">
        🔒
      </div>

      <h3 className="text-lg font-semibold text-white tracking-tight">
        {assetTitle}
      </h3>
      <p className="text-sm text-zinc-400 leading-relaxed">
        {assetDescription}
      </p>

      <div className="p-4 rounded-xl border border-zinc-800/80 bg-zinc-900/50 text-left space-y-2">
        <div className="flex justify-between items-center text-xs font-mono">
          <span className="text-zinc-400">Required Stake:</span>
          <span className="text-white font-semibold">10 CRTVAI</span>
        </div>
        <div className="flex justify-between items-center text-xs font-mono">
          <span className="text-zinc-400">Your Wallet:</span>
          <span className="text-zinc-300">
            {balance
              ? `${Number(formatUnits(balance, 18)).toFixed(2)} CRTVAI`
              : "0 CRTVAI"}
          </span>
        </div>
      </div>

      <button
        onClick={handleMintWithUsdc}
        disabled={!isConnected || isPending || isConfirming}
        className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-xs font-semibold text-white transition disabled:opacity-50"
      >
        {!isConnected
          ? "Connect Wallet to Verify Stake"
          : isPending
            ? "Confirm in Wallet..."
            : isConfirming
              ? "Minting via Bonding Curve..."
              : "Mint 10 CRTVAI with USDC (Base)"}
      </button>

      <p className="text-[11px] text-zinc-500">
        Holding 10 CRTVAI unlocks all gated dispatches, agent prompts, and
        datasets across Dear Creative.
      </p>
    </div>
  );
}
