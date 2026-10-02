# Workloom

A self-hosted collaborative workspace for knowledge, documents, structured tables, schedules and email.

[简体中文](README.md) · [English](README.en.md) · [Deployed instance](https://company.2dqy.com) · [MCP and CLI guide](MCP_USAGE.md)

Workloom is developed by [bbmy85552](https://github.com/bbmy85552) from the open-source [Jianji](https://github.com/staklab/jianji) project for personal knowledge organization and small-team collaboration. Its development spans document organization, batch imports, editing and layout, shared-document saves, team access, branding, OA integration and a document trash. MCP and the CLI provide external access to this workspace.

## Workloom development and extensions

| Area | Additions and improvements |
| --- | --- |
| Knowledge organization | Explicit folders, path navigation, folder grids and drag-and-drop organization; copy your own private non-folder documents into public space, move private documents or folder trees into public space, and let administrators move public content into their own private space |
| Batch imports and file handling | Batch DOCX, Markdown and TXT imports with sequential processing, progress and failure feedback; improved imported-image attachment storage and references, plus DOCX image and table export compatibility |
| Reading and editing | Heading navigation on larger screens, clipboard image pasting, Markdown-to-rich-text pasting, and improvements to read-only documents and shared pages |
| Tables and forms | User-triggered layout for document tables, an optional content-based width and alignment mode for data tables, and fixes for public-form select options |
| Shared-document saves | Save-version checks, side-by-side conflict comparison and version selection, queued saves and fixes for false conflicts during consecutive edits; shared links return to their original location after sign-in |
| Team access and branding | Google sign-in, invitation-code registration, and consistent brand and company names across the interface, authentication pages and system emails |
| OA integration | A configurable sidebar entry that embeds an external OA system, with an option to open it in a new window |
| Public-document trash | Soft deletion of public documents and their descendants; administrators can restore a selected document and its required parent chain or permanently delete items; private documents are still deleted directly |
| External tools | User API keys, remote MCP, a CLI and a dedicated settings page, with account permissions applied to document and table access |

These extensions build on the upstream document, table, calendar, email and administration modules. Concurrent document edits use conflict detection and version selection, without automatic merging. OA integration embeds a separate system.

## Workspace capabilities

| Module | Capabilities |
| --- | --- |
| Documents | Private, public, shared and favorite views; document hierarchies and folders; TipTap rich text; attachments; imports and exports; comments, sharing and version recovery |
| Tables | Fields and templates; grid, kanban, calendar and Gantt views; formulas; CSV import; CSV/XLSX export; public forms |
| Dashboard and calendar | Tasks, recent documents and schedules; month/week/day views; recurring events; in-app and email reminders |
| Email | IMAP/SMTP accounts, folder synchronization, in-app composition and attachments, mail-to-task workflows |
| Team administration | Users, groups, sessions, registration settings, Google sign-in, branding, OA and a public-document trash |
| Self-hosting | React, Express, TipTap and SQLite; Docker Compose deployment; backup, recovery and migration |

## Deployed instance and repository version

The [deployed instance](https://company.2dqy.com) requires sign-in and applies account permissions to content access. It also shows project memory for facts, decisions and preferences, with personal, public and shared-project entry points and a dedicated memory MCP interface. **That module is not yet included in this public repository.** For the document and table MCP tools available when deploying this repository, see [MCP_USAGE.md](MCP_USAGE.md).

## Base-module previews

The following four images are inherited upstream screenshots of the base modules. See the extensions above and the current source for Workloom-specific functionality.

<table>
  <tr>
    <td><img src="docs/images/screenshot-dashboard.png" width="420" alt="Dashboard" /></td>
    <td><img src="docs/images/screenshot-doc-editor.png" width="420" alt="Document editor" /></td>
  </tr>
  <tr>
    <td align="center">Dashboard</td>
    <td align="center">Document Editor</td>
  </tr>
  <tr>
    <td><img src="docs/images/screenshot-mail.png" width="420" alt="Mail aggregation" /></td>
    <td><img src="docs/images/screenshot-admin-settings.png" width="420" alt="Admin settings" /></td>
  </tr>
  <tr>
    <td align="center">Mail</td>
    <td align="center">Admin Console</td>
  </tr>
</table>

## Quick Deploy

Docker Compose is the recommended production setup. A working SMTP configuration is required to complete first-run setup. The installer generates `.env`, a strong `JWT_SECRET`, a private first-run setup link, and starts the container. The administrator account, SMTP settings, and registration policy are configured in the web setup wizard.

```bash
curl -fsSL https://raw.githubusercontent.com/bbmy85552/Workloom/main/scripts/install.sh | bash -s -- \
  --repo https://github.com/bbmy85552/Workloom.git \
  --dir Workloom \
  --app-url https://workloom.example.com \
  --yes
```

The `--repo` argument explicitly selects Workloom. The installer retains an upstream default for compatibility, so keep this argument.

You can also clone first:

```bash
git clone https://github.com/bbmy85552/Workloom.git
cd Workloom
bash scripts/install.sh
```

Check the service and the setup link:

```bash
docker compose ps
docker compose logs -f jianji
cat ./SETUP_URL.txt
```

For environment variables, SMTP, Nginx, certificates, and migration details, see [配置说明.md](配置说明.md).

## Updates

Workloom checks GitHub branch commits for updates. When deployed using the commands above, the installer writes the update repository, branch and current commit from the Git checkout. For manual deployments, explicitly set the Workloom update source in `.env`; compatibility defaults still point to upstream:

```env
JIANJI_UPDATE_REPO=https://github.com/bbmy85552/Workloom.git
JIANJI_UPDATE_BRANCH=main
JIANJI_UPDATE_CHECK_URL=https://api.github.com/repos/bbmy85552/Workloom/commits/main
```

Safe server update:

```bash
bash scripts/update.sh
```

For low-memory servers with host-side builds and a runtime image:

```bash
bash scripts/update-runtime.sh
```

The update scripts back up `.env` and `SETUP_URL.txt`, preserve SQLite and upload Docker volumes, pull the latest source, rebuild the container, and wait for the health check to pass. If the deployment directory is not a Git checkout, the scripts refresh source from the GitHub branch archive defined by `JIANJI_UPDATE_REPO` / `JIANJI_UPDATE_BRANCH` while still protecting runtime config and data. A single-container deployment can still have a very short restart window; strict zero-downtime deployments should use blue-green release behind Nginx.

If your deployment environment cannot reliably reach GitHub repository APIs or source archive endpoints, server-side automatic fetch updates will not be available. Run a push update from a local machine that can obtain the latest source:

```bash
git pull
bash scripts/push-update.sh --host root@example.com --dir /opt/jianji --runtime
```

Push updates sync source over SSH/rsync and ask the server to skip remote fetching before rebuilding safely. The server-side `.env`, setup link, certificates, database, uploads, and backups are preserved.

## AI and command-line access

Generate a user API key under **Settings → AI and CLI**. Remote MCP uses Streamable HTTP at `https://your-domain/mcp` with `Authorization: Bearer <API Key>`. The current settings page uses the deployed instance in its examples; replace that address with your own domain when self-hosting.

The CLI retains its existing command and environment variable names:

```bash
export DOCS_PLATFORM_BASE_URL="https://workloom.example.com"
export DOCS_PLATFORM_API_KEY="<your API key>"
npm run docs-platform -- docs list
npm run docs-platform -- tables list
```

See [MCP_USAGE.md](MCP_USAGE.md) for tools, parameters and client configuration. Configure Google sign-in with `NEXT_PUBLIC_GOOGLE_CLIENT_ID`; invitation codes, branding and the OA URL are configured in the admin console. New registrations require a valid invitation code even when registration is enabled.

## Local Development

On a fresh clone, create `server/.env` and edit the configuration before installing dependencies. Keep any existing environment file.

```bash
cp -n server/.env.example server/.env
npm run setup
npm run dev
```

Default development URLs:

| Service | URL |
| --- | --- |
| Web | `http://localhost:3000` |
| API | `http://localhost:4000` |

## Test And Build

```bash
npm run lint
npm run test
npm run build
```

## Data And Security

The `jianji` service, `jianji:*` image names, `JIANJI_*` settings and volume names are retained for deployment compatibility. Existing instances should keep their deployment directory and Compose project name to continue using the same data volumes.

Docker deployment uses two persistent volumes:

| Volume | Content |
| --- | --- |
| `jianji-data` | SQLite database at `/app/data` |
| `jianji-uploads` | Avatars, attachments, and uploaded files at `/app/uploads` |

The repository and Docker build context exclude `.env`, `SETUP_URL.txt`, SQLite databases, uploads, certificates, private keys, and local caches. Migration packages can include encrypted mail credentials and user-uploaded files, so treat them as private backups.

## License

Workloom builds on [staklab/jianji](https://github.com/staklab/jianji), preserves the original attribution, and continues to use the [MIT License](LICENSE). Bundled font references follow their own OFL licenses; see [LICENSES/FONTS.md](LICENSES/FONTS.md).
