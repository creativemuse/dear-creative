import { AdminConsole } from "./admin-console";

export default function AdminPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="mb-2 text-3xl font-semibold">Admin</h1>
      <p className="mb-8 text-zinc-600 dark:text-zinc-400">
        Privy-protected console for G2. Server routes verify access tokens with{" "}
        <code className="text-sm">PRIVY_APP_SECRET</code>.
      </p>
      <AdminConsole />
    </main>
  );
}
