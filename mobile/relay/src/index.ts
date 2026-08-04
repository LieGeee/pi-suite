import { createRelayHttpServer } from "./server.js";
import { RelayStore } from "./store.js";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? "8787");
const dbPath = process.env.RELAY_DB_PATH ?? "data/relay.sqlite";
const tokenSalt = process.env.PAIR_TOKEN_SALT ?? "pi-mobile-relay-local-development-salt";

const store = await RelayStore.openFile(dbPath, { tokenSalt });
const app = createRelayHttpServer({ store });

app.server.listen(port, host, () => {
  const address = app.server.address();
  const bound = typeof address === "object" && address ? `${address.address}:${address.port}` : `${host}:${port}`;
  console.log(`pi-mobile-relay listening on http://${bound}`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}; shutting down pi-mobile-relay...`);
  await app.close();
  store.close();
}

process.on("SIGINT", () => {
  void shutdown("SIGINT").finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM").finally(() => process.exit(0));
});
