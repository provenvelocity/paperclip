export function CopilotTokenPermissions() {
  return <div className="space-y-2 text-sm text-muted-foreground">
    <p className="font-medium text-foreground">Fine-grained token settings</p>
    <ul className="list-disc space-y-1 pl-5">
      <li><strong>Resource owner:</strong> your personal GitHub account, not an organization.</li>
      <li><strong>Repository access:</strong> Public repositories is sufficient for this Copilot-only connection; no private repository access is required.</li>
      <li><strong>Permissions → Account → Copilot Requests:</strong> Read and write (<code>copilot_requests=write</code>).</li>
      <li><strong>All other account and repository permissions:</strong> No access. Metadata may appear as automatic Read-only access.</li>
    </ul>
    <p>This permission allows billable Copilot requests, not repository writes. It does not restrict local file edits or shell tools.</p>
    <details>
      <summary className="cursor-pointer">Optional repository permissions (separate connection)</summary>
      <p className="mt-2">For a separate repository credential, choose Only select repositories and only the pilot repository. Grant only the operations you need:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li><strong>Contents:</strong> Read-only to clone/read; Read and write to push code.</li>
        <li><strong>Pull requests:</strong> Read-only to view; Read and write to open/update pull requests.</li>
        <li><strong>Issues:</strong> Read-only to view; Read and write to create/update issues or comments, only if needed.</li>
        <li><strong>Metadata:</strong> Read-only (automatically required for selected repositories).</li>
        <li><strong>Workflows:</strong> Read and write only if changing GitHub Actions workflow files; otherwise No access.</li>
        <li>Leave Administration, Secrets, Actions and all other permissions at No access unless a separate task specifically requires them.</li>
      </ul>
      <p className="mt-2">This Copilot form does not configure repository credentials. An organization-owned repository token cannot replace the personal-account Copilot token.</p>
    </details>
    <a className="underline" href="https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#account-permissions" target="_blank" rel="noreferrer">GitHub permission names and access levels</a>
  </div>;
}
