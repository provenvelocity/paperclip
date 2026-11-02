import { randomUUID, X509Certificate } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { rootCertificates } from "node:tls";
import { aiProviderRoutingSchema, type AiProviderRouting } from "@paperclipai/shared";
import { unprocessable } from "../errors.js";
import { runAdapterExecutionTargetProcess, type AdapterExecutionTarget } from "@paperclipai/adapter-utils/execution-target";

export const AI_PROVIDER_TLS_ENV_KEYS = [
  "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "REQUESTS_CA_BUNDLE",
] as const;
export const AI_PROVIDER_CA_FILENAME = "model-provider-ca.pem";

export function validateAiProviderCertificate(route: AiProviderRouting): void {
  aiProviderRoutingSchema.parse(route);
  if (!route.caCertificate) return;
  try {
    const certificates = route.caCertificate.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g)!;
    for (const certificate of certificates) new X509Certificate(certificate);
  } catch {
    throw unprocessable("The model endpoint certificate is not a valid PEM X.509 certificate.");
  }
}

/** Trust is confined to this connection's disposable provider processes. */
export async function prepareAiProviderTls(
  route: AiProviderRouting,
  providerHome: string,
): Promise<Record<string, string>> {
  validateAiProviderCertificate(route);
  if (!route.caCertificate) return {};
  const filename = path.join(providerHome, AI_PROVIDER_CA_FILENAME);
  await writeFile(filename, [...rootCertificates, route.caCertificate, ""].join("\n"), { mode: 0o600 });
  return Object.fromEntries(AI_PROVIDER_TLS_ENV_KEYS.map(key => [key, filename]));
}

/** Transport the public trust bundle, not a controller-local filename. */
export async function stageAiProviderTls(providerHome: string, target: AdapterExecutionTarget) {
  const directory = `/tmp/paperclip-ai-ca-${randomUUID()}`;
  const filename = `${directory}/${AI_PROVIDER_CA_FILENAME}`;
  const run = (script: string, stdin?: string) => runAdapterExecutionTargetProcess(
    "model-provider-certificate", target, "sh", ["-c", script, "paperclip-ai-ca", directory, filename],
    { cwd: target.kind === "remote" ? target.remoteCwd : "/tmp", env: {}, stdin,
      timeoutSec: 10, graceSec: 1, onLog: async () => {} },
  );
  const result = await run(
    'set -eu; umask 077; mkdir -- "$1"; trap \'rm -f -- "$2"; rmdir -- "$1"\' EXIT; cat > "$2"; trap - EXIT',
    await readFile(path.join(providerHome, AI_PROVIDER_CA_FILENAME), "utf8"),
  );
  if (result.timedOut || result.exitCode !== 0) {
    throw unprocessable("Could not install the model certificate in the selected execution environment.");
  }
  let cleaned = false;
  return {
    env: Object.fromEntries(AI_PROVIDER_TLS_ENV_KEYS.map(key => [key, filename])),
    cleanup: async () => {
      if (cleaned) return;
      const removed = await run('set -eu; rm -f -- "$2"; rmdir -- "$1"');
      if (removed.timedOut || removed.exitCode !== 0) {
        throw new Error("Could not remove the model certificate from the execution environment.");
      }
      cleaned = true;
    },
  };
}
