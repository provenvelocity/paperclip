export function CopilotTokenPermissions() {
  return <div className="space-y-2 text-sm text-muted-foreground">
    <p className="font-medium text-foreground">Fine-grained token settings</p>
    <ul className="list-disc space-y-1 pl-5">
      <li><strong>Resource owner:</strong> your personal GitHub account, not an organization.</li>
      <li><strong>Repository access:</strong> choose Only select repositories and select the pilot repository yourself. Do not select All repositories.</li>
      <li><strong>Permissions → Account → Copilot Requests:</strong> Read-only (<code>user_copilot_requests=read</code>). GitHub currently offers only Read-only for this permission; it still allows sending Copilot requests.</li>
      <li><strong>Metadata:</strong> Read-only.</li>
      <li><strong>Contents, Issues, Pull requests and Workflows:</strong> Read and write.</li>
      <li><strong>All other account and repository permissions:</strong> No access.</li>
    </ul>
    <p>These coding defaults allow billable Copilot requests and repository code, issue, pull-request and workflow changes. Repository write permissions are not required just to authenticate Copilot. They do not restrict local file edits or shell tools.</p>
    <p><a className="underline" href="https://github.com/settings/personal-access-tokens/new?name=Paperclip%20Copilot&amp;user_copilot_requests=read&amp;metadata=read&amp;contents=write&amp;issues=write&amp;pull_requests=write&amp;workflows=write&amp;expires_in=30" target="_blank" rel="noreferrer">Open prefilled Copilot token form</a>. Review the permissions, explicitly select repositories and generate the token yourself in GitHub; this link does not create a token or select repositories.</p>
    <details>
      <summary className="cursor-pointer">Reduce permissions for a narrower task</summary>
      <p className="mt-2">The template defaults to the coding permissions above. Remove or reduce repository permissions if you only need Copilot authentication or read-only work:</p>
      <p className="mt-2">Add permissions selects the permission category. Use the Access dropdown on each added row to choose Read-only or Read and write where GitHub offers both. Metadata is fixed to Read-only; Copilot Requests also currently offers only Read-only.</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li><strong>Contents:</strong> Read-only to clone/read; Read and write to push code.</li>
        <li><strong>Pull requests:</strong> Read-only to view; Read and write to open/update pull requests.</li>
        <li><strong>Issues:</strong> Read-only to view; Read and write to create/update issues or comments, only if needed.</li>
        <li><strong>Metadata:</strong> Read-only (automatically required for selected repositories).</li>
        <li><strong>Workflows:</strong> Read and write only if changing GitHub Actions workflow files; otherwise No access.</li>
        <li>Leave Administration, Secrets, Actions and all other permissions at No access unless a separate task specifically requires them.</li>
      </ul>
      <p className="mt-2">Saving this token configures Copilot authentication, not a Git credential helper or a separate repository connection. Repository permissions do not prove Git push access is configured. An organization-owned repository token cannot replace the personal-account Copilot token.</p>
    </details>
    <a className="underline" href="https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#account-permissions" target="_blank" rel="noreferrer">GitHub permission names and access levels</a>
  </div>;
}
