import { AdminConsole } from "./admin-console";

export default function AdminPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <div className="mb-8">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-100 px-3 py-0.5 text-xs font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          <span>Newsletter Administration</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Sign-In / Sign-Out</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Authenticate as the Dear Creative owner to unlock Adam Studio, Approvals,
          Lens Grove banner uploads, and post editing tools.
        </p>
      </div>
      <AdminConsole />
    </main>
  );
}
