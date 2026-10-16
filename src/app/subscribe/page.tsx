import { SubscribeForm } from "@/components/subscribe-form";

export default function SubscribePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="mb-2 text-3xl font-semibold">Subscribe</h1>
      <p className="mb-8 text-zinc-600 dark:text-zinc-400">
        Double opt-in: we send a confirmation email before adding you to the list.
      </p>
      <SubscribeForm />
    </main>
  );
}
