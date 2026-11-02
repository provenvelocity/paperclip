import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { access, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { aiProviderRoutingSchema } from "@paperclipai/shared";
import { runChildProcess } from "@paperclipai/adapter-utils/server-utils";
import type { AdapterExecutionTarget } from "@paperclipai/adapter-utils/execution-target";
import type { CommandManagedRuntimeRunner } from "@paperclipai/adapter-utils/command-managed-runtime";
import { prepareAiProviderTls, stageAiProviderTls } from "../services/ai-provider-tls.js";

let home: string;
let certificate: string;
let key: string;

beforeAll(async () => {
  home = await mkdtemp(path.join(tmpdir(), "paperclip-provider-tls-test-"));
  const certificatePath = path.join(home, "server.pem");
  const keyPath = path.join(home, "server-key.pem");
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
    "-keyout", keyPath, "-out", certificatePath, "-subj", "/CN=127.0.0.1",
    "-addext", "subjectAltName=IP:127.0.0.1",
  ], { stdio: "ignore" });
  certificate = await readFile(certificatePath, "utf8");
  key = await readFile(keyPath, "utf8");
});
afterAll(async () => { if (home) await rm(home, { recursive: true, force: true }); });

describe("connection-scoped certificate trust", () => {
  it("keeps ordinary HTTP and verified HTTPS routes unchanged", async () => {
    for (const baseUrl of ["http://192.168.68.84:8000/v1", "https://gateway.example/v1"]) {
      expect(await prepareAiProviderTls(aiProviderRoutingSchema.parse({
        kind: "gateway", protocol: "responses", baseUrl,
      }), home)).toEqual({});
    }
  });

  it("rejects structurally PEM-shaped data that is not an X.509 certificate", async () => {
    await expect(prepareAiProviderTls(aiProviderRoutingSchema.parse({
      kind: "local", protocol: "responses", baseUrl: "https://127.0.0.1/v1",
      caCertificate: "-----BEGIN CERTIFICATE-----\nZmFrZQ==\n-----END CERTIFICATE-----",
    }), home)).rejects.toThrow("not a valid PEM X.509 certificate");
  });

  it("transfers trust to an execution target and explicitly handles staging and cleanup failures", async () => {
    const localEnv = await prepareAiProviderTls(aiProviderRoutingSchema.parse({
      kind: "local", protocol: "responses", baseUrl: "https://127.0.0.1/v1",
      caCertificate: certificate,
    }), home);
    const execute = vi.fn<CommandManagedRuntimeRunner["execute"]>(input =>
      runChildProcess("certificate-fixture", input.command, input.args ?? [], {
        cwd: input.cwd ?? home, env: { ...process.env, ...input.env }, stdin: input.stdin,
        timeoutSec: 10, graceSec: 1, onLog: async () => {},
      }));
    const target: AdapterExecutionTarget = {
      kind: "remote", transport: "sandbox", remoteCwd: home, runner: { execute },
    };
    const staged = await stageAiProviderTls(home, target);
    try {
      expect(staged.env.SSL_CERT_FILE).not.toBe(localEnv.SSL_CERT_FILE);
      expect(await readFile(staged.env.SSL_CERT_FILE, "utf8"))
        .toBe(await readFile(localEnv.SSL_CERT_FILE, "utf8"));
      expect((await stat(staged.env.SSL_CERT_FILE)).mode & 0o777).toBe(0o600);
      execute.mockResolvedValueOnce({ exitCode: 1, signal: null, timedOut: false, stdout: "", stderr: "fixture failure" });
      await expect(staged.cleanup()).rejects.toThrow("Could not remove");
    } finally { await staged.cleanup(); }
    await expect(access(staged.env.SSL_CERT_FILE)).rejects.toMatchObject({ code: "ENOENT" });
    await staged.cleanup();
    execute.mockResolvedValueOnce({ exitCode: 1, signal: null, timedOut: false, stdout: "", stderr: "fixture failure" });
    await expect(stageAiProviderTls(home, target)).rejects.toThrow("Could not install");
    execute.mockResolvedValueOnce({ exitCode: null, signal: "SIGTERM", timedOut: true, stdout: "", stderr: "" });
    await expect(stageAiProviderTls(home, target)).rejects.toThrow("Could not install");
  });

  it("accepts a self-signed HTTPS response only with the selected certificate and matching identity", async () => {
    const server = createServer({ cert: certificate, key }, (_request, response) => response.end("ready"));
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing HTTPS fixture address");
    const env = await prepareAiProviderTls(aiProviderRoutingSchema.parse({
      kind: "local", protocol: "responses", baseUrl: `https://127.0.0.1:${address.port}/v1`,
      caCertificate: certificate,
    }), home);
    expect((await stat(env.SSL_CERT_FILE)).mode & 0o777).toBe(0o600);
    expect(env).not.toHaveProperty("NODE_TLS_REJECT_UNAUTHORIZED");
    expect(process.env.NODE_EXTRA_CA_CERTS).not.toBe(env.NODE_EXTRA_CA_CERTS);
    // The parent must serve TLS while the child performs the request.
    const { spawn } = await import("node:child_process");
    const request = async (trusted: boolean, servername = "127.0.0.1") => {
      const child = spawn(process.execPath, ["-e", `
        require("node:https").get({
          hostname: "127.0.0.1", port: ${address.port}, servername: ${JSON.stringify(servername)},
        }, r => { r.pipe(process.stdout); }).on("error", e => {
          process.stderr.write(e.code); process.exitCode = 1;
        });
      `], { env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: "1", NODE_EXTRA_CA_CERTS: "", ...(trusted ? env : {}) } });
      let output = "";
      let error = "";
      child.stdout.on("data", chunk => { output += chunk; });
      child.stderr.on("data", chunk => { error += chunk; });
      const [code] = await once(child, "close");
      return { code, output, error };
    };
    try {
      expect(await request(false)).toMatchObject({ code: 1, output: "" });
      expect(await request(true)).toMatchObject({ code: 0, output: "ready" });
      expect(await request(true, "different.local")).toMatchObject({ code: 1, output: "", error: expect.stringContaining("ERR_TLS_CERT_ALTNAME_INVALID") });
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
});
