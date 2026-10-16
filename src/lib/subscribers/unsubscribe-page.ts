export function renderUnsubscribeConfirmPage(token: string): string {
  const action = `/api/unsubscribe?token=${encodeURIComponent(token)}`;
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Confirm unsubscribe</title>
  </head>
  <body>
    <main>
      <h1>Unsubscribe from Dear Creative</h1>
      <p>Confirm below to stop receiving emails. Opening this page alone does not unsubscribe you.</p>
      <form method="post" action="${action}">
        <input type="hidden" name="confirm" value="1" />
        <button type="submit">Confirm unsubscribe</button>
      </form>
    </main>
  </body>
</html>`;
}

export function renderUnsubscribeCompletePage(): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Unsubscribed</title></head>
  <body><main><p>You have been unsubscribed.</p></main></body>
</html>`;
}
