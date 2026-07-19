// Route Node's global fetch (undici) through the environment's egress proxy, and
// trust the proxy's TLS-re-termination CA. viem's http transport uses global
// fetch, so setting a global dispatcher here makes all RPC/API calls work.
// Import this module FIRST, before any network call.
import { setGlobalDispatcher, ProxyAgent, Agent } from "undici";
import { readFileSync } from "node:fs";

const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy;
const caPath = process.env.NODE_EXTRA_CA_CERTS || "/root/.ccr/ca-bundle.crt";

let ca;
try {
  ca = readFileSync(caPath);
} catch {
  ca = undefined; // no bundle present (e.g. local dev) — proceed without it
}

if (proxyUrl) {
  setGlobalDispatcher(
    new ProxyAgent({
      uri: proxyUrl,
      requestTls: ca ? { ca } : undefined,
      connectTimeout: 15_000,
    })
  );
} else if (ca) {
  // No proxy but a custom CA — still trust it.
  setGlobalDispatcher(new Agent({ connect: { ca } }));
}
