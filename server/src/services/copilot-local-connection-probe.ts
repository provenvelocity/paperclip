import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Db } from "@paperclipai/db";
import { testEnvironment } from "@paperclipai/adapter-copilot-local/server";
import { environmentService } from "./environments.js";
import { instanceSettingsService } from "./instance-settings.js";
import { assertEnvironmentSelectionForCompany } from "./environment-selection.js";
import { forbidden, unprocessable } from "../errors.js";
import { logger } from "../middleware/logger.js";

export async function probeCopilotLocalConnection(
  db: Db,
  companyId: string,
  token: string,
  suppliedEnvironmentId?: string | null,
): Promise<void> {
  const settings = instanceSettingsService(db);
  const experimental = await settings.getExperimental();
  const general = await settings.getGeneral();
  if (experimental.enableManagedSandboxOnly || general.executionMode === "kubernetes")
    throw unprocessable("Direct Copilot token verification requires an allowed Local execution environment.", { code: "copilot_environment_unavailable" });
  const environments = environmentService(db);
  const environmentId = suppliedEnvironmentId ?? (await settings.get()).defaultEnvironmentId;
  if (environmentId) {
    await assertEnvironmentSelectionForCompany(environments, companyId, environmentId, { allowedDrivers: ["local"] });
    const boundCompanyIds = await environments.listBoundCompanyIds(environmentId);
    if (boundCompanyIds.length && !boundCompanyIds.includes(companyId))
      throw forbidden("The selected environment belongs to another company.", { code: "environment_company_mismatch" });
    const environment = await environments.getById(environmentId);
    if (!environment || environment.status !== "active")
      throw unprocessable("Choose an active Local Copilot execution environment.", { code: "copilot_environment_unavailable" });
  }
  const home = await mkdtemp(path.join(os.tmpdir(), "paperclip-copilot-check-"));
  try {
    const result = await testEnvironment({
      companyId,
      adapterType: "copilot_local",
      config: {
        cwd: home,
        helloProbeTimeoutSec: 30,
        disableBuiltinMcps: true,
        allowAllPaths: false,
        env: {
          HOME: home,
          COPILOT_HOME: home,
          XDG_CONFIG_HOME: home,
          XDG_DATA_HOME: home,
          COPILOT_GITHUB_TOKEN: token,
          GH_TOKEN: "",
          GITHUB_TOKEN: "",
        },
      },
    }).catch(() => {
      logger.warn({ companyId, code: "COPILOT_REQUEST_FAILED" }, "Direct Copilot token verification failed");
      throw unprocessable("Copilot token verification could not complete. Check the installed CLI and retry.", { code: "COPILOT_REQUEST_FAILED" });
    });
    if (result.status !== "pass" || !result.checks.some(check => check.code === "copilot_hello_probe_passed"))
      throw unprocessable("Copilot token verification failed. Check Copilot Requests permission, your subscription and the installed CLI, then retry.", { code: "COPILOT_AUTH_REQUIRED" });
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}
