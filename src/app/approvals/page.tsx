import Link from "next/link";

export default function ApprovalsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="mb-2 text-3xl font-semibold">Approvals</h1>
      <p className="mb-6 text-zinc-600 dark:text-zinc-400">
        Approval queue data is loaded from{" "}
        <code className="text-sm">/api/approvals</code> with a verified Privy
        admin token.
      </p>
      <Link href="/admin" className="text-sm font-medium underline">
        Sign in via Admin
      </Link>
    </main>
  );
}
