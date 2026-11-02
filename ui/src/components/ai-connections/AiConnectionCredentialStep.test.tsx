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
  expect(container.textContent).toContain("Copilot Requests: Read-only");
  expect(container.textContent).toContain("user_copilot_requests=read");
  expect(container.textContent).not.toContain("copilot_requests=write");
  const tokenLink = Array.from(container.querySelectorAll("a")).find(link => link.textContent === "Open prefilled Copilot token form")!;
  const tokenUrl = new URL(tokenLink.href);
  expect(tokenUrl.origin).toBe("https://github.com");
  expect(tokenUrl.pathname).toBe("/settings/personal-access-tokens/new");
  expect(tokenUrl.searchParams.get("user_copilot_requests")).toBe("read");
  expect(tokenUrl.searchParams.get("expires_in")).toBe("30");
  expect([...tokenUrl.searchParams.entries()]).toEqual([
    ["name", "Paperclip Copilot"], ["user_copilot_requests", "read"], ["metadata", "read"],
    ["contents", "write"], ["issues", "write"], ["pull_requests", "write"],
    ["workflows", "write"], ["expires_in", "30"],
  ]);
  expect(container.textContent).toContain("Do not select All repositories");
  expect(container.textContent).toContain("Contents, Issues, Pull requests and Workflows: Read and write");
  expect(container.textContent).toContain("not a Git credential helper");
  expect(container.textContent).toContain("All other account and repository permissions: No access");
  expect(container.textContent).toContain("Contents: Read-only to clone/read; Read and write to push code");
  expect(container.textContent).toContain("Pull requests: Read-only to view; Read and write to open/update pull requests");
  expect(container.textContent).toContain("Issues: Read-only to view; Read and write to create/update issues");
  expect(container.textContent).toContain("Workflows: Read and write only if changing GitHub Actions workflow files");
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
