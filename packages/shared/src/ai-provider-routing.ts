import { z } from "zod";

/** Only explicit private addresses qualify; arbitrary DNS names can rebind. */
export function isLocalAiProviderHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "[::1]") return true;
  if (/^\[(?:fc|fd)[0-9a-f]{2}:/.test(host)) return true;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
  const octets = host.split(".").map(Number);
  if (octets.some((octet) => octet > 255)) return false;
  return octets[0] === 127 || octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168);
}

const certificateBundlePattern = /^(?:-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----\s*)+$/;

/** Value-free routing stored on the connection, never supplied by an agent binding. */
export const aiProviderRoutingSchema = z
  .object({
    kind: z.enum(["openrouter", "bedrock", "gateway", "local"]),
    protocol: z.enum(["responses", "messages", "chat", "bedrock"]),
    baseUrl: z.string().trim().max(2048).optional(),
    caCertificate: z.string().trim().min(1).max(65536)
      .regex(certificateBundlePattern, "Enter PEM certificates only, never a private key.").optional(),
    auth: z
      .enum(["bearer", "api_key", "none"])
      .default("bearer"),
    region: z
      .string()
      .regex(/^[a-z]{2}(?:-[a-z]+)+-\d$/)
      .optional(),
    models: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).max(256),
            label: z.string().trim().max(160).optional(),
          })
          .strict(),
      )
      .max(200)
      .default([]),
  })
  .strict()
  .superRefine((route, ctx) => {
    const invalid = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (route.kind === "bedrock") {
      if (
        route.protocol !== "bedrock" ||
        !route.region ||
        route.auth !== "bearer" ||
        route.baseUrl
      )
        invalid(
          "Bedrock requires a region and a Bedrock API key.",
        );
    } else if (
      route.protocol === "bedrock" ||
      route.region
    )
      invalid("AWS settings require Bedrock.");
    if (
      route.kind === "openrouter" &&
      (route.baseUrl || route.auth !== "bearer")
    )
      invalid("OpenRouter uses its official endpoint and an API key.");
    if (route.auth === "api_key" && route.protocol !== "messages")
      invalid("API-key header authentication requires Anthropic Messages.");
    if (route.caCertificate && route.kind !== "local" && route.kind !== "gateway")
      invalid("Custom certificates require a private-network model endpoint.");
    if (route.kind === "gateway" || route.kind === "local") {
      try {
        const url = new URL(route.baseUrl ?? "");
        const local = isLocalAiProviderHostname(url.hostname);
        if (
          url.username ||
          url.password ||
          url.search ||
          url.hash ||
          (url.protocol !== "https:" && !(url.protocol === "http:" && local))
        )
          throw new Error();
        if (route.kind === "local" && !local)
          invalid("A local endpoint must use loopback or a private IP address (10/8, 172.16/12, 192.168/16, or IPv6 ULA).");
        if (route.caCertificate && (!local || url.protocol !== "https:"))
          invalid("Custom certificates require HTTPS with a loopback or private IP address.");
      } catch {
        invalid(
          "Enter an HTTPS base URL without credentials, query parameters, or a fragment. Loopback and private IP addresses may use HTTP.",
        );
      }
    }
  });
export type AiProviderRouting = z.infer<typeof aiProviderRoutingSchema>;
export function aiRoutingHarness(
  adapter: string,
  provider?: unknown,
  acpxAgent?: unknown,
): string {
  if (adapter !== "paperclip_runner") return adapter;
  if (provider === "acpx" && acpxAgent === "copilot") return "copilot_runtime";
  if (provider === "acpx" && acpxAgent === "antigravity") return "antigravity_runtime";
  const runner =
    provider === "acpx" && ["claude", "grok", "pi"].includes(String(acpxAgent))
      ? acpxAgent
      : provider;
  return (
    (
      {
        claude: "claude_local",
        codex: "codex_local",
        opencode: "opencode_local",
        grok: "grok_local",
        pi: "pi_local",
      } as Record<string, string>
    )[String(runner)] ?? "unsupported"
  );
}
export function isAiRoutingCompatible(
  route: AiProviderRouting,
  harness: string,
): boolean {
  if (route.kind === "bedrock") return harness === "claude_local";
  if (route.kind === "openrouter")
    return [
      "claude_local",
      "codex_local",
      "opencode_local",
      "pi_local",
      "hermes_local",
    ].includes(harness);
  if (route.protocol === "responses") return harness === "codex_local";
  if (route.protocol === "messages") return harness === "claude_local";
  return ["opencode_local", "hermes_local"].includes(harness);
}
export function aiRoutingBaseUrl(
  route: AiProviderRouting,
  harness: string,
): string {
  return route.kind === "openrouter"
    ? `https://openrouter.ai/api${harness === "claude_local" ? "" : "/v1"}`
    : (route.baseUrl ?? "").replace(/\/+$/, "");
}

export function aiRoutingModel(
  route: AiProviderRouting,
  harness: string,
  model: string,
): string {
  if (!model || (harness !== "opencode_local" && !(harness === "pi_local" && route.kind === "openrouter"))) return model;
  const prefix = route.kind === "openrouter" ? "openrouter" : "paperclip";
  return model.startsWith(`${prefix}/`) ? model : `${prefix}/${model}`;
}

/** Catalog identity is derived from routing, including accounts saved before these rows existed. */
export function aiConnectionCatalogSlug(provider: string, routing?: Pick<AiProviderRouting, "kind" | "protocol">): string {
  if (routing?.kind === "gateway") {
    return routing.protocol === "messages" ? "messages-api"
      : routing.protocol === "chat" ? "chat-completions-api" : "responses-api";
  }
  return routing?.kind ?? provider;
}

/** Direct catalog setup presets; legacy gateway links still open their existing setup. */
export function aiProviderSetupPreset(source: string | null): {
  provider: "openrouter" | "bedrock" | "gateway" | "local" | "google";
  protocol?: AiProviderRouting["protocol"];
  label?: string;
} | undefined {
  switch (source) {
    case "responses-api": return { provider: "gateway", protocol: "responses", label: "Responses API" };
    case "messages-api": return { provider: "gateway", protocol: "messages", label: "Messages API" };
    case "chat-completions-api": return { provider: "gateway", protocol: "chat", label: "Chat Completions API" };
    case "google-ai": return { provider: "google" };
    case "google": case "openrouter": case "bedrock": case "gateway": case "local": return { provider: source };
    default: return undefined;
  }
}
