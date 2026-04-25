# Security Policy

## Reporting a vulnerability

Please report security issues privately via GitHub's
[security advisory form](https://github.com/medevs/hyperframes-yt-studio/security/advisories/new)
rather than opening a public issue.

Include:

- A description of the vulnerability and its impact.
- Steps to reproduce, or a proof-of-concept.
- The commit hash or release version you observed it on.

I will acknowledge the report within seven days and follow up with a fix
or mitigation timeline. Responsible disclosure is appreciated.

## Scope

This is a personal automation project. There is no production deployment
and no user data is processed by the project itself. Risk is limited to:

- Malicious content in fetched RSS / HN articles being executed at render time
  (mitigated by Puppeteer sandboxing and read-only screenshot capture).
- Supply-chain risk via npm dependencies (mitigated by pinned `hyperframes`
  and lock-file commits).

Reports about the upstream `hyperframes` framework should go to its own
repository.
