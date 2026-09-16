/**
 * Minimal live check of ANTHROPIC_API_KEY: one tiny messages.create call.
 * Usage: npm run check:anthropic   (reads .env.local; never prints the key)
 * Exit codes: 0 ok · 1 the API rejected the key or the account · 2 key missing
 */
import Anthropic from "@anthropic-ai/sdk";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: rely on the environment.
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    console.error("Falta ANTHROPIC_API_KEY en .env.local");
    process.exit(2);
  }
  const client = new Anthropic({ apiKey });
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 10,
      messages: [{ role: "user", content: "Responde solo: hola" }],
    });
    console.log(`OK: la llave funciona (modelo ${response.model}, stop_reason ${response.stop_reason}).`);
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      const status = error.status ?? 0;
      if (status === 401) {
        console.error("401: la llave no es válida.");
      } else if (status === 429 || status === 402 || /billing|credit/i.test(error.message)) {
        console.error(`${status}: la llave es buena pero la cuenta no tiene créditos o pasó el límite.`);
      } else {
        console.error(`${status}: ${error.message}`);
      }
      process.exit(1);
    }
    throw error;
  }
}

main();
