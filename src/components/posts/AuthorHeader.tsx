"use client";

import React, { useState } from "react";
import { QuickTradeModal } from "@/components/metoken/QuickTradeModal";

export interface AuthorProfile {
  name: string;
  slug?: string;
  bio?: string | null;
  avatarUrl?: string | null;
  payoutAddress?: string;
  meTokenAddress?: `0x${string}` | null;
  meTokenSymbol?: string | null;
}

interface AuthorHeaderProps {
  author: AuthorProfile;
  publishedDate?: string;
  className?: string;
}

export function AuthorHeader({
  author,
  publishedDate,
  className = "",
}: AuthorHeaderProps) {
  const [isTradeOpen, setIsTradeOpen] = useState(false);
  const symbol = author.meTokenSymbol || "CRTVAI";

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-4 py-4 border-b border-zinc-200 dark:border-zinc-800 ${className}`}
    >
      {/* Author Byline */}
      <div className="flex items-center gap-3">
        {author.avatarUrl ? (
          <img
            src={author.avatarUrl}
            alt={author.name}
            className="w-10 h-10 rounded-full object-cover border border-zinc-200 dark:border-zinc-800"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-semibold text-sm text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700">
            {author.name.slice(0, 2).toUpperCase()}
          </div>
        )}

        <div>
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
            <span>{author.name}</span>
            {author.slug ? (
              <span className="text-xs text-zinc-500 font-normal">
                @{author.slug}
              </span>
            ) : null}
          </div>
          {author.bio ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-1">
              {author.bio}
            </p>
          ) : publishedDate ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {publishedDate}
            </p>
          ) : null}
        </div>
      </div>

      {/* Patron / Back Author Button */}
      {author.meTokenAddress ? (
        <>
          <button
            type="button"
            onClick={() => setIsTradeOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 border border-zinc-700/80 transition shadow-xs"
            title={`Back ${author.name} with $${symbol}`}
          >
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            Back with ${symbol}
          </button>

          <QuickTradeModal
            isOpen={isTradeOpen}
            onClose={() => setIsTradeOpen(false)}
            targetMeTokenAddress={author.meTokenAddress}
            targetSymbol={symbol}
            creatorName={author.name}
          />
        </>
      ) : null}
    </div>
  );
}
