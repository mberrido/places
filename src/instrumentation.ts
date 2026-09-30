// Runs once when the server starts.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Opt out with DISABLE_NIGHTLY=1 (e.g. when running a second copy against the same data).
  if (process.env.DISABLE_NIGHTLY === "1") return;
  const { startNightly } = await import("./lib/nightly");
  startNightly();
}
