"use client";

import { useState } from "react";
import { BASE_CHAIN_ID, BASE_USDC_ADDRESS } from "@/lib/payments/subscription-config";

type MicroTippingWidgetProps = {
  slug: string;
  payToAddress?: string | null;
  postTitle?: string;
};

const DEFAULT_AMOUNTS = [
  { value: "0.10", label: "10¢", fullLabel: "0.10 USDC" },
  { value: "0.25", label: "25¢", fullLabel: "0.25 USDC", recommended: true },
  { value: "1.00", label: "$1.00", fullLabel: "1.00 USDC" },
];

export function MicroTippingWidget({
  slug,
  payToAddress,
  postTitle,
}: MicroTippingWidgetProps) {
  const [selectedAmount, setSelectedAmount] = useState<string>("0.25");
  const [isSending, setIsSending] = useState(false);
  const [hasTipped, setHasTipped] = useState(false);
  const [copied, setCopied] = useState(false);

  // Fallback creator wallet on Base
  const recipient =
    payToAddress ||
    process.env.NEXT_PUBLIC_TIP_ADDRESS ||
    "0x6B37a1F2a2d48074d2A6b40F001391515B70868a";

  const handleCopy = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(recipient);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleSendTip = async () => {
    setIsSending(true);

    try {
      // Check for browser web3 provider (MetaMask, Coinbase Wallet, Rainbow, etc.)
      if (typeof window !== "undefined" && (window as unknown as { ethereum?: unknown }).ethereum) {
        const ethereum = (window as unknown as {
          ethereum: {
            request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
          };
        }).ethereum;

        try {
          const accounts = (await ethereum.request({
            method: "eth_requestAccounts",
          })) as string[];

          if (accounts && accounts[0]) {
            // Encode ERC-20 transfer(address to, uint256 value)
            // transfer method selector is 0xa9059cbb
            const cleanTo = recipient.replace(/^0x/, "").toLowerCase().padStart(64, "0");
            const parsedUnits = BigInt(Math.round(parseFloat(selectedAmount) * 1_000_000));
            const hexAmount = parsedUnits.toString(16).padStart(64, "0");
            const data = `0xa9059cbb${cleanTo}${hexAmount}`;

            await ethereum.request({
              method: "eth_sendTransaction",
              params: [
                {
                  from: accounts[0],
                  to: BASE_USDC_ADDRESS,
                  data,
                  chainId: `0x${BASE_CHAIN_ID.toString(16)}`,
                },
              ],
            });
          }
        } catch (walletErr) {
          console.warn("Wallet transfer dismissed or failed:", walletErr);
        }
      }

      // Record tip intent / contribution in backend analytics
      await fetch("/api/tips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          amount: selectedAmount,
          currency: "USDC",
          chainId: BASE_CHAIN_ID,
          recipient,
        }),
      }).catch(() => null);

      setHasTipped(true);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="my-10 rounded-2xl border border-zinc-200/90 bg-gradient-to-br from-zinc-50 via-white to-blue-50/30 p-6 shadow-xs dark:border-zinc-800 dark:from-zinc-900/90 dark:via-zinc-900 dark:to-blue-950/20">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white shadow-xs">
              ⚡
            </span>
            <span className="text-xs font-bold tracking-wider text-blue-600 uppercase dark:text-blue-400">
              One-Click Micro-Support • Base USDC
            </span>
          </div>
          <h3 className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Send {selectedAmount} USDC to back{" "}
            {postTitle ? `"${postTitle}"` : "independent creator dispatches"}.
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
            Direct, instant micro-value flow on Base with sub-cent gas fees. Zero paywalls, 100% creator-direct.
          </p>
        </div>

        {/* Amount Pill Selection */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto">
          {DEFAULT_AMOUNTS.map((amt) => {
            const isSelected = selectedAmount === amt.value;
            return (
              <button
                key={amt.value}
                type="button"
                onClick={() => setSelectedAmount(amt.value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  isSelected
                    ? "bg-blue-600 text-white shadow-sm hover:bg-blue-700"
                    : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                }`}
              >
                {amt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-zinc-200/60 pt-4 dark:border-zinc-800/80">
        <button
          type="button"
          onClick={handleSendTip}
          disabled={isSending}
          className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {isSending ? (
            "Sending on Base…"
          ) : hasTipped ? (
            "✓ Thank you for supporting!"
          ) : (
            `Tip ${selectedAmount} USDC on Base`
          )}
        </button>

        <button
          type="button"
          onClick={handleCopy}
          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          {copied ? "Address Copied!" : "Copy Base Address"}
        </button>

        <span className="text-[11px] text-zinc-600 dark:text-zinc-400">
          Recipient: <span className="font-mono text-zinc-700 dark:text-zinc-300">{recipient.slice(0, 6)}...{recipient.slice(-4)}</span>
        </span>
      </div>

      {hasTipped ? (
        <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          🎉 Thank you for backing independent thought and creative autonomy! Your micro-support fuels the next dispatch.
        </div>
      ) : null}
    </div>
  );
}
