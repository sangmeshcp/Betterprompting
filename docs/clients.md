# Client configuration

## The one-command path

```
betterprompting install
```

That's it. The installer:

1. Detects every supported AI tool on your machine (Cursor, Claude Code,
   Claude Desktop, Continue.dev, Aider, Cline, Zed).
2. Writes the right base-URL setting into each tool's own config file.
3. Appends a fenced `export ANTHROPIC_BASE_URL=…` / `OPENAI_BASE_URL=…`
   block to your shell rc (`.zshrc` / `.bashrc` / fish / PowerShell profile).
4. Registers an auto-start service (LaunchAgent on macOS, systemd user unit
   on Linux, Task Scheduler on Windows) so the proxy is always running.

Preview without touching anything:

```
betterprompting install --dry-run
```

Only configure specific tools:

```
betterprompting install --only cursor,claude-code
```

Override an existing base URL (installer refuses by default to be safe):

```
betterprompting install --force
```

Undo everything:

```
betterprompting uninstall
```

Every file the installer writes is either wrapped in a fenced
`# >>> betterprompting >>>` block (rc / YAML files) or tagged with a
`__betterprompting` sentinel key (JSON files). `uninstall` uses those markers
to restore each file exactly to its pre-install state; a hash-based backup in
`~/.betterprompting/install-state.json` is the fallback.

## What each tool does under the hood

| Tool | Where we write | What we set |
|---|---|---|
| Claude Code | `~/.claude/settings.json` | `env.ANTHROPIC_BASE_URL` |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` (+ Linux/Windows equivalents) | `env.ANTHROPIC_BASE_URL` for MCP subprocesses |
| Cursor | `<config>/Cursor/User/settings.json` | `cursor.general.openAIBaseUrl` |
| Continue.dev | `~/.continue/config.json` | `models[*].apiBase` for `openai` provider |
| Aider | `~/.aider.conf.yml` | fenced `openai-api-base:` block |
| Cline | VS Code `settings.json` | `cline.openAiBaseUrl` |
| Zed | `<config>/zed/settings.json` | `language_models.openai.api_url` |

Shell exports go into whichever of these exist (or the one matching your
`$SHELL`): `~/.zshrc`, `~/.bashrc`, `~/.bash_profile`, `~/.profile`,
`~/.config/fish/config.fish`, or the PowerShell `$PROFILE` on Windows.

Existing tools with an existing non-Betterprompting base URL are left alone
and reported as `[!] conflict` — pass `--force` to override, or configure them
manually (see below) if you want to chain proxies.

## Advanced / manual configuration

If you're on a headless server, in CI, or want to wire a tool the installer
doesn't yet know about, set the base URL yourself. Every AI tool listed here
respects one of two env vars:

```bash
# Anthropic-native
export ANTHROPIC_BASE_URL=http://127.0.0.1:8787

# OpenAI-compatible
export OPENAI_BASE_URL=http://127.0.0.1:8787/v1
```

### Claude Code

```bash
export ANTHROPIC_BASE_URL=http://127.0.0.1:8787
```

### Anthropic SDK

```python
from anthropic import Anthropic
client = Anthropic(base_url="http://127.0.0.1:8787")
```

```ts
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic({ baseURL: "http://127.0.0.1:8787" });
```

### OpenAI SDK

```python
from openai import OpenAI
client = OpenAI(base_url="http://127.0.0.1:8787/v1")
```

### Cursor (manual)

Settings → Models → Override OpenAI Base URL → `http://127.0.0.1:8787/v1`.

### Continue.dev (YAML config)

The installer skips `~/.continue/config.yaml` because YAML editing is
brittle. Set `apiBase` on each OpenAI-provider model manually:

```yaml
models:
  - name: my-model
    provider: openai
    apiBase: http://127.0.0.1:8787/v1
```

### GitHub Copilot (not yet supported)

Copilot hardcodes its upstream URL, so a base-URL override doesn't help.
Coverage would require a system-level HTTPS proxy with a locally-trusted CA,
or narrow-scope DNS+TLS interception for `api.githubcopilot.com`. Both are
tracked as Tier 2 work — see [architecture.md](./architecture.md).

## Verifying it works

```bash
betterprompting doctor
```

Prints:

- Which tools were detected on this machine.
- What each tool's currently-configured base URL is (should point to the
  proxy after `install`).
- Whether the auto-start service is registered.
- Whether the AI analyzer has an API key.

Then run a request from your tool and watch it land:

```bash
betterprompting events --limit 5
```
