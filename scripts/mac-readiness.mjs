// Exit 0 only for this app's successful state response, never just an open port.
const once = process.argv.includes("--once");
for (let attempt = 0; attempt < (once ? 1 : 60); attempt++) {
  try {
    const response = await fetch("http://127.0.0.1:3000/api/state", {
      signal: AbortSignal.timeout(2000),
    });
    if (response.ok) {
      const data = await response.json();
      if (
        Array.isArray(data.courses) &&
        Array.isArray(data.sessions) &&
        Array.isArray(data.attempts)
      )
        process.exit(0);
    }
  } catch {}
  if (!once) await new Promise((resolve) => setTimeout(resolve, 500));
}
process.exit(1);
