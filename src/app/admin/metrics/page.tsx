import { Metadata } from "next";
import { AdminMetricsClient } from "./admin-metrics-client";

export const metadata: Metadata = {
  title: "Metrics | Dear Creative Admin",
  description: "Newsletter metrics dashboard",
};

export default async function AdminMetricsPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Metrics Dashboard</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Real-time newsletter performance metrics
        </p>
      </div>
      <AdminMetricsClient />
    </main>
  );
}