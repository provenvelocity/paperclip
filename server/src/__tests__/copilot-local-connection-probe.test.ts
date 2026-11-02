import { access } from "node:fs/promises";
import type { Db } from "@paperclipai/db";
import { beforeEach, expect, it, vi } from "vitest";
import { createAiConnectionSchema, isAiConnectionCompatible } from "@paperclipai/shared";

const mocks = vi.hoisted(() => ({
  test: vi.fn(), get: vi.fn(), bound: vi.fn(), defaults: vi.fn(), experimental: vi.fn(), general: vi.fn(), warn: vi.fn(),
}));
vi.mock("@paperclipai/adapter-copilot-local/server", () => ({ testEnvironment: mocks.test }));
vi.mock("../services/environments.js", () => ({ environmentService: () => ({ getById: mocks.get, listBoundCompanyIds: mocks.bound }) }));
vi.mock("../services/instance-settings.js", () => ({ instanceSettingsService: () => ({ get: mocks.defaults, getExperimental: mocks.experimental, getGeneral: mocks.general }) }));
vi.mock("../middleware/logger.js", () => ({ logger: { warn: mocks.warn } }));
import { probeCopilotLocalConnection } from "../services/copilot-local-connection-probe.js";

const db = {} as Db;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.defaults.mockResolvedValue({ defaultEnvironmentId: "local" });
  mocks.experimental.mockResolvedValue({});
  mocks.general.mockResolvedValue({ executionMode: "local" });
  mocks.get.mockResolvedValue({ id: "local", driver: "local", status: "active", config: {} });
  mocks.bound.mockResolvedValue(["company"]);
  mocks.test.mockResolvedValue({ status: "pass", checks: [{ code: "copilot_hello_probe_passed" }] });
});

it("verifies the direct CLI using an isolated temporary home and deletes it", async () => {
  await probeCopilotLocalConnection(db, "company", "github_pat_fixture", "local");
  expect(mocks.test).toHaveBeenCalledExactlyOnceWith({
    companyId: "company", adapterType: "copilot_local",
    config: {
      cwd: expect.stringContaining("paperclip-copilot-check-"),
      helloProbeTimeoutSec: 30, disableBuiltinMcps: true, allowAllPaths: false,
      env: {
        HOME: expect.any(String), COPILOT_HOME: expect.any(String),
        XDG_CONFIG_HOME: expect.any(String), XDG_DATA_HOME: expect.any(String),
        COPILOT_GITHUB_TOKEN: "github_pat_fixture", GH_TOKEN: "", GITHUB_TOKEN: "",
      },
    },
  });
  const { config } = mocks.test.mock.calls[0][0];
  expect(config.env.COPILOT_HOME).toBe(config.cwd);
  expect(config.env.HOME).toBe(config.cwd);
  await expect(access(config.cwd)).rejects.toThrow();
});

it.each([
  { status: "warn", checks: [{ code: "copilot_hello_probe_auth_required", detail: "private-token" }] },
  { status: "fail", checks: [{ code: "copilot_hello_probe_failed", detail: "private-token" }] },
  { status: "pass", checks: [{ code: "copilot_command_resolvable" }] },
])("rejects unsuccessful or skipped authentication: $status", async result => {
  mocks.test.mockResolvedValue(result);
  await expect(probeCopilotLocalConnection(db, "company", "private-token")).rejects.toThrow("Copilot token verification failed.");
  await expect(access(mocks.test.mock.calls[0][0].config.cwd)).rejects.toThrow();
});

it("redacts thrown provider errors and still removes its credential home", async () => {
  mocks.test.mockRejectedValue(new Error("provider echoed private-token"));
  await expect(probeCopilotLocalConnection(db, "company", "private-token")).rejects.toThrow("Copilot token verification could not complete.");
  expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain("private-token");
  await expect(access(mocks.test.mock.calls[0][0].config.cwd)).rejects.toThrow();
});

it.each(["managed", "kubernetes", "ssh", "foreign", "archived"])("rejects %s execution before submitting a token", async policy => {
  if (policy === "managed") mocks.experimental.mockResolvedValue({ enableManagedSandboxOnly: true });
  if (policy === "kubernetes") mocks.general.mockResolvedValue({ executionMode: "kubernetes" });
  if (policy === "ssh") mocks.get.mockResolvedValue({ id: "local", driver: "ssh", status: "active" });
  if (policy === "foreign") mocks.bound.mockResolvedValue(["other-company"]);
  if (policy === "archived") mocks.get.mockResolvedValue({ id: "local", driver: "local", status: "archived" });
  await expect(probeCopilotLocalConnection(db, "company", "private-token")).rejects.toThrow();
  expect(mocks.test).not.toHaveBeenCalled();
});

it("accepts only GitHub API-token connections for direct verification", () => {
  const input = {
    provider: "github", method: "api_key", name: "Copilot", ownership: "personal",
    apiKey: "github_pat_fixture", verificationAdapter: "copilot_local",
  };
  expect(createAiConnectionSchema.safeParse(input).success).toBe(true);
  expect(createAiConnectionSchema.safeParse({ ...input, provider: "openai" }).success).toBe(false);
  expect(isAiConnectionCompatible({ provider: "github", method: "api_key" }, "copilot_local")).toBe(true);
  expect(isAiConnectionCompatible({ provider: "openai", method: "api_key" }, "copilot_local")).toBe(false);
});
