# Security Policy

## Reporting a vulnerability

If you discover a security vulnerability in Asciify, **please do not file a public issue.** Instead, report it privately:

- 𝕏 / Twitter DM: [@yashsaindane](https://x.com/yashsaindane)
- GitHub Security Advisories: https://github.com/yashsaindane/asciify/security/advisories/new

I'll acknowledge receipt within 72 hours and aim to ship a fix within 14 days for critical issues.

## What counts as a vulnerability

- Cross-site scripting (XSS) via uploaded files or shared URL state
- Arbitrary code execution via the Figma plugin sandbox
- Local file disclosure via the standalone dashboard
- Bypass of the anti-copy / DOM hardening (low severity but still reported)

## What doesn't count

- Browser quirks that don't lead to user harm
- Issues that require a malicious browser extension or a compromised local machine
- The fact that bundled client-side JS is, by nature, readable when devtools are forced open — anti-copy measures are deterrents, not security boundaries

## Disclosure

After a fix is shipped, I'll credit reporters in the release notes (unless you'd prefer to stay anonymous).
