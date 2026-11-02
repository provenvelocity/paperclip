import { describe, expect, it } from "vitest";
import { aiProviderRoutingSchema } from "./ai-provider-routing.js";

const route = (baseUrl: string, extra = {}) => ({
  kind: "local", protocol: "responses", auth: "none", baseUrl, ...extra,
});
const pem = "-----BEGIN CERTIFICATE-----\nZmFrZQ==\n-----END CERTIFICATE-----";

describe("private model endpoint policy", () => {
  it.each([
    "localhost", "127.0.0.1", "127.0.0.2", "[::1]",
    "10.0.0.1", "10.255.255.254", "172.16.0.1", "172.31.255.254",
    "192.168.68.84", "[fc00::1]", "[fd12:3456::1]",
  ])("allows HTTP and HTTPS for %s", host => {
    for (const protocol of ["http", "https"]) {
      expect(aiProviderRoutingSchema.safeParse(route(`${protocol}://${host}:8000/v1`)).success).toBe(true);
      expect(aiProviderRoutingSchema.safeParse(route(`${protocol}://${host}:8000/v1`, { kind: "gateway" })).success).toBe(true);
    }
  });

  it.each([
    "8.8.8.8", "172.15.255.255", "172.32.0.1", "192.169.0.1",
    "169.254.169.254", "169.254.1.1", "100.100.100.200", "0.0.0.0",
    "224.0.0.1", "255.255.255.255", "[::]", "[fe80::1]",
    "[2001:4860:4860::8888]", "[::ffff:192.168.68.84]",
    "model.example.com", "model.local", "localhost.example.com",
  ])("does not grant private endpoint exceptions to %s", host => {
    expect(aiProviderRoutingSchema.safeParse(route(`http://${host}/v1`)).success).toBe(false);
    expect(aiProviderRoutingSchema.safeParse(route(`https://${host}/v1`)).success).toBe(false);
    expect(aiProviderRoutingSchema.safeParse(route(`http://${host}/v1`, { kind: "gateway" })).success).toBe(false);
    expect(aiProviderRoutingSchema.safeParse(route(`https://${host}/v1`, { kind: "gateway", caCertificate: pem })).success).toBe(false);
  });

  it("preserves verified public HTTPS gateways without local certificate trust", () => {
    expect(aiProviderRoutingSchema.safeParse(route("https://gateway.example/v1", { kind: "gateway" })).success).toBe(true);
  });

  it.each([
    "http://user:password@192.168.68.84:8000/v1",
    "http://192.168.68.84:8000/v1?key=secret",
    "http://192.168.68.84:8000/v1#fragment",
    "file:///etc/passwd", "ftp://192.168.68.84/v1",
  ])("rejects malformed or credential-bearing private URLs: %s", url => {
    expect(aiProviderRoutingSchema.safeParse(route(url)).success).toBe(false);
  });

  it("allows explicit PEM trust only with private HTTPS", () => {
    expect(aiProviderRoutingSchema.safeParse(route("https://192.168.68.84/v1", { caCertificate: pem })).success).toBe(true);
    expect(aiProviderRoutingSchema.safeParse(route("http://192.168.68.84/v1", { caCertificate: pem })).success).toBe(false);
    expect(aiProviderRoutingSchema.safeParse({
      kind: "openrouter", protocol: "responses", caCertificate: pem,
    }).success).toBe(false);
    for (const caCertificate of ["invalid", "-----BEGIN PRIVATE KEY-----\nZmFrZQ==\n-----END PRIVATE KEY-----", pem + "\nprivate bytes"]) {
      expect(aiProviderRoutingSchema.safeParse(route("https://127.0.0.1/v1", { caCertificate })).success).toBe(false);
    }
  });
});
