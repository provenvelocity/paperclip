// @vitest-environment jsdom
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AiConnectionCredentialStep } from "./AiConnectionCredentialStep";

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/api/ai-connections", () => ({ aiConnectionsApi: mocks }));
vi.mock("@/api/environments", () => ({ environmentsApi: { list: async () => [{ id: "local", name: "Local", driver: "local", status: "active" }] } }));
vi.mock("@/api/instanceSettings", () => ({ instanceSettingsApi: { get: async () => ({ defaultEnvironmentId: "local" }) } }));
vi.mock("@/pages/apps/AppLogo", () => ({ AppLogo: () => null }));
let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
const complete = vi.fn();
async function settle() {
  for (let i = 0; i < 5; i++) {
    await new Promise(resolve => setTimeout(resolve, 0));
    flushSync(() => {});
  }
}
beforeEach(() => {
  vi.resetAllMocks();
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});
afterEach(() => { flushSync(() => root.unmount()); client.clear(); container.remove(); });

it.each([true, false])("submits a masked direct Copilot token through the existing managed API and clears it (%s)", async succeeds => {
  if (succeeds) mocks.create.mockResolvedValue({ connectionId: "connection", grantId: "grant" });
  else mocks.create.mockRejectedValue(new Error("Copilot token verification failed."));
  flushSync(() => root.render(<QueryClientProvider client={client}>
    <AiConnectionCredentialStep companyId="company" provider="github" verificationAdapter="copilot_local"
      name="My Copilot" ownership="personal" agentIds={["agent"]} allAgents={false}
      environmentId="local" onComplete={complete} onCancel={() => {}} />
  </QueryClientProvider>));
  await settle();
  expect(container.textContent).toContain("personal access token");
  expect(container.textContent).toContain("Copilot Requests");
  expect(container.textContent).toContain("short CLI model prompt");
  expect(container.textContent).toContain("encrypted secret storage");
  const field = container.querySelector<HTMLInputElement>('input[type="password"]')!;
  expect(field).not.toBeNull();
  flushSync(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, "github_pat_fixture");
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const connect = Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Connect")!;
  expect(connect.disabled).toBe(false);
  flushSync(() => connect.click());
  await settle();
  expect(mocks.create).toHaveBeenCalledExactlyOnceWith("company", expect.objectContaining({
    provider: "github", method: "api_key", apiKey: "github_pat_fixture",
    verificationAdapter: "copilot_local", environmentId: "local", allAgents: false, agentIds: ["agent"],
  }));
  expect(field.value).toBe("");
  expect(container.textContent).not.toContain("github_pat_fixture");
  if (succeeds) expect(complete).toHaveBeenCalledExactlyOnceWith({ connectionId: "connection", grantId: "grant", method: "api_key" });
  else {
    expect(complete).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Copilot token verification failed.");
  }
});
