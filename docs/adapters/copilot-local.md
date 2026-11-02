---
title: GitHub Copilot CLI
summary: GitHub Copilot CLI local adapter setup and configuration
---

The `copilot_local` adapter runs the GitHub Copilot CLI (`copilot`, npm package `@github/copilot`) locally. It runs headless with `copilot -p` and parses the JSONL event stream (`--output-format json`). It supports session persistence and structured output parsing.

## Prerequisites

- GitHub Copilot CLI installed (`copilot` command available):
  - `npm i -g @github/copilot`, or
  - Homebrew: `brew install copilot-cli`
- An active GitHub Copilot entitlement for the authenticated account
- Authentication configured via one of:
  - `copilot login` (device code or web flow; the token is stored in the OS keychain, with a plaintext fallback in `~/.copilot/config.json`)
  - `COPILOT_GITHUB_TOKEN` set in the adapter env or server shell. Use a fine-grained personal access token with the "Copilot Requests" permission. Classic `ghp_` tokens are not supported.
  - The CLI also honours `GH_TOKEN` and `GITHUB_TOKEN`, but this is not recommended in Paperclip because Paperclip reserves those variables for git remote access.

## Onboarding with a Copilot subscription

Choose **GitHub Copilot** in **Connect a model**, or **GitHub Copilot CLI** when
creating an agent. This direct CLI adapter is distinct from the experimental
Copilot-through-Paperclip-Runner path. No OpenAI or Anthropic API key is needed.

Install the CLI in the execution environment, then run `copilot login`
interactively as the same operating-system user that executes Paperclip agents,
using the same `COPILOT_HOME`. Complete GitHub authorization yourself; do not
send tokens to another agent or embed credentials in an image.

In Docker, provide a dedicated persistent Copilot home and only explicitly
approved workspaces. Do not mount the operator's entire home directory. Configure
`COPILOT_HOME` consistently for login and agent execution. A successful environment
probe verifies model access; creating an agent alone does not establish that an
authenticated task can run.

The onboarding Connect action tests authentication before hiring. Use the existing
CLI login, or choose **Use a GitHub token instead** for the managed connection
described below. Failed authentication remains blocking and can be retried.
Browser-managed Copilot OAuth login is not implemented by this adapter.

## Connect a token from the dashboard

For an existing **GitHub Copilot CLI** agent, open **Configuration** and find
**Connection** beside its harness/model settings. If it is using the execution
environment's existing login, choose **Choose a managed connection**, then
**Connect an account…** in the connection selector.

Enter a personal fine-grained GitHub token with **Copilot Requests** permission.
This is not an OpenAI API key, and a Copilot subscription does not issue one.
Classic `ghp_` tokens are not supported. Choose the intended agent audience,
connect, confirm adoption of the managed binding, and **Save** the agent.
Run its connection test or **Retry now** after saving. A connected account does
not prove that a Paperclip-managed task has completed.

This reuses Paperclip's managed AI connection form, company/user authorization,
encrypted vault and grant references. Only the binding is stored in
`runtimeConfig.aiConnection`; the token is not saved as plaintext in agent
configuration or browser draft storage. Run preparation injects the selected
credential as `COPILOT_GITHUB_TOKEN`, blanks `GH_TOKEN`/`GITHUB_TOKEN` for Copilot,
and supplies a temporary `COPILOT_HOME` so an unrelated persistent CLI login
cannot silently replace the chosen account. This leaves the operator's stored
OAuth directory unchanged. Only CLI `session-state` is retained across runs under
the instance's `runtime/copilot/<company>/<agent>/<grant>/session-state` directory;
temporary credential/configuration homes are removed. This preserves session
resumption without sharing OAuth configuration. Use HTTPS unless the LAN is trusted.

Direct CLI token verification currently requires an allowed **Local**
environment with `copilot` on its PATH. It runs the adapter's bounded hello
probe in a temporary empty directory with built-in MCPs disabled, and may consume
Copilot usage. It still enables arbitrary tools and is not sandboxed. Failed,
timed-out or skipped authentication does not save a new connection. This path
does not require or qualify the separately versioned native Copilot Runner
installation. Existing CLI OAuth remains supported when no managed binding
is selected.

### Exact fine-grained token permissions

For the Copilot token entered in this form:

| GitHub setting | Required selection |
| --- | --- |
| Resource owner | Your personal account, **not an organization** |
| Repository access | **Public repositories** is sufficient for Copilot authentication; no private repository access required |
| Permissions → Account → Copilot Requests | **Read and write** (`copilot_requests=write`) |
| All other account/repository permissions | **No access**; GitHub may include automatic **Metadata: Read-only** |

GitHub's [account-permission reference](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#account-permissions)
lists `copilot_requests` with access level `write`. This authorizes Copilot requests
against your subscription, not Git repository writes. It does not limit local
file changes or shell commands; the adapter still enables all tools.
Choose an expiration appropriate for the pilot and keep the token out of source.

If you separately configure a Git/GitHub repository credential, select **Only
select repositories**, then only the pilot repository. These are optional and
**not** required on the Copilot-only token:

| Repository permission | Read-only use | Write use |
| --- | --- | --- |
| Contents | Clone/read code | **Read and write** to push code |
| Pull requests | View pull requests | **Read and write** to open/update pull requests |
| Issues | View issues | **Read and write** to create/update issues or comments, only if needed |
| Metadata | **Read-only**, automatically required | No write permission |
| Workflows | Leave **No access** for ordinary code changes | **Read and write** only to change Actions workflow files |

Leave Administration, Secrets, Actions and other permissions at **No access**
unless a separately scoped task needs them. This form does not provision that
repository connection. A repository token owned by an organization cannot replace
the personal-account Copilot token.

## CLI execution versus GitHub cloud agent

`copilot_local` runs the CLI inside the selected execution environment to work
with its filesystem and report run/session events to Paperclip. The model
service remains remote; this is not local inference.

GitHub also exposes a separate
[cloud agent tasks API](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/use-cloud-agent-via-the-api)
in public preview. It starts repository-scoped asynchronous tasks using
`POST /agents/repos/{owner}/{repo}/tasks`, supports status polling and can create
pull requests. It uses user-to-server authentication; GitHub App installation
tokens are not supported. Such a connection would not need this local CLI or
mount its workspace, but would need a separate adapter mapping GitHub task
states, repository permissions, cancellation and PR results to Paperclip.
Saving a token here does not select cloud execution or implement that adapter.

## Configuration fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cwd` | string | Yes | Working directory for the agent process (absolute path; created automatically if missing when permissions allow) |
| `model` | string | No | Model id passed via `--model`. Defaults to `auto`. |
| `reasoningEffort` | string | No | Reasoning effort: `none` \| `minimal` \| `low` \| `medium` \| `high` \| `xhigh` \| `max`. Passed via `--reasoning-effort`. |
| `promptTemplate` | string | No | Prompt used for all runs |
| `instructionsFilePath` | string | No | Markdown instructions file prepended to the prompt |
| `allowAllPaths` | boolean | No | Toggle: pass `--allow-all-paths` so the agent can access files outside the working directory |
| `disableBuiltinMcps` | boolean | No | Toggle: pass `--disable-builtin-mcps` to drop the built-in `github-mcp-server` |
| `command` | string | No | CLI command override. Defaults to `copilot`. |
| `extraArgs` | string[] | No | Additional CLI arguments appended to every run |
| `env` | object | No | Environment variables (supports secret refs) |
| `timeoutSec` | number | No | Process timeout (0 = no timeout) |

## How Runs Work

Each heartbeat runs the CLI headless:

```
copilot -p "<prompt>" --output-format json --allow-all-tools --no-ask-user ...
```

- `-p` runs a single prompt non-interactively and exits.
- `--output-format json` emits one JSON event per line. The final line is always a `result` object carrying the exit code, session id, and usage (`premiumRequests`).
- `--allow-all-tools` is required for non-interactive mode; without it, write and shell permission requests are auto-denied.
- `--no-ask-user` removes the `ask_user` tool so the agent never blocks waiting for input.

All tools, including arbitrary shell commands, are allowed. Disabling
`allowAllPaths` limits CLI path allowances; it does not sandbox arbitrary tools.
Use a dedicated workspace without sensitive files and human approval for
consequential actions. This contribution is experimental; offline tests are not
production or authenticated-run qualification.

## Session Persistence

The session is pinned with `--session-id <uuid>` on the first run, and resumed with `--resume=<id>` on later heartbeats so the agent retains context. The session id is taken from the final `result` line (the stream does not reliably include a `session.start` event).

If resume fails because the session no longer exists (`No session, task, or name matched ...`), the adapter clears the stored session and retries with a fresh one.

## Billing

Copilot usage is billed in premium requests (AI credits). Each model has a multiplier (for example `auto` gets a 10% discount, `claude-haiku-4.5` is 0.33, `claude-sonnet-4.6` is 9, `gpt-5.5` is 57). Usage is reported as unpriced credits: Paperclip records the premium-request count but no dollar cost. The count in `result.usage.premiumRequests` is cumulative per session, so the per-run figure is the difference from the previous run.

## Limits

- v1 supports the headless CLI lane only. There is no ACP engine.
- Local execution environment only.

## Troubleshooting

- **Authentication failure**: with no usable login the CLI exits 1 with empty stdout and `Error: No authentication information found.` on stderr. Run `copilot login` or set `COPILOT_GITHUB_TOKEN`. Note that an invalid `COPILOT_GITHUB_TOKEN` can silently fall back to a keychain login.
- **`No session, task, or name matched '<id>'`**: the stored session is gone. The adapter clears it and retries with a fresh session automatically.
- **CLI versions**: the Homebrew binary can have an older version built in and auto-load a newer downloaded package from its cache. Set `CI=1` to stop update downloads while keeping the cached newest version. Do not set `COPILOT_AUTO_UPDATE=false`: it downgrades to the bundled older version, which may lack flags such as `--usage-output-file`.
