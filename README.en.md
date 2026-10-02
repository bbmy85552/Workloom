# Workloom

A self-hosted collaborative workspace connecting knowledge, documents, data, schedules and everyday team work.

[简体中文](README.md) · [English](README.en.md) · [Live instance](https://company.2dqy.com) · [Deployment configuration](配置说明.md) · [MCP and CLI](MCP_USAGE.md)

Workloom helps individuals and small teams organize source material into a knowledge base, write documents, manage structured information and follow through with tasks, calendars, email and OA access. Content stays in your own instance, with access controlled by account permissions. External AI clients and scripts can use authorized content through MCP and the CLI.

## From information to everyday work

| Workflow | Capabilities |
| --- | --- |
| Organize knowledge | Private, public, shared and favorite views; document hierarchies, folders, path navigation and drag-and-drop organization; copying and moving content between spaces |
| Bring in material | Batch DOCX, Markdown and TXT imports, progress and failure feedback, document-image and attachment-reference handling |
| Write and read | TipTap rich text, images and attachments, Markdown and image pasting, document-table layout, heading navigation on larger screens, read-only and shared-page views |
| Collaborate on documents | Share links, collaborator permissions, comments, version recovery, automatic saves, save queues, side-by-side conflict comparison and version selection |
| Manage structured information | Fields, templates and formulas; grid/kanban/calendar/Gantt views; optional content-based widths; CSV import and CSV/XLSX export; public forms |
| Track tasks and schedules | Dashboard, tasks and recent documents; month/week/day calendars, recurring events, task scheduling, in-app and email reminders |
| Handle email | IMAP/SMTP accounts, folder synchronization, in-app composition and replies, attachments and mail-to-task workflows |
| Keep project context | Project memory in the live instance records facts, decisions and preferences, with personal, public and shared-project entry points and a dedicated memory MCP |
| Set up team access | Email and Google sign-in, invitation-code registration, brand and company settings, sidebar and embedded OA access |
| Maintain content and the instance | Public-document trash, users and groups, sessions, auditing, backups, recovery, migration and update management |
| Connect external tools | User API keys, remote MCP and a CLI for documents, tables, fields and records under account permissions |

## Ways to use Workloom

- **A personal knowledge space:** import documents and notes in batches, then organize long-term material with folders, favorites, heading navigation and search.
- **A shared team knowledge base:** turn private drafts into public content, assign access and editing permissions, and maintain documents through comments, history and conflict selection.
- **Projects and daily office work:** track tasks and information in tables, schedule time on the calendar, create tasks from email and access OA from the same sidebar.
- **Context for AI:** let remote MCP clients read and update authorized content, or connect documents and tables to scripted workflows through the CLI.

## How content is handled

You can copy your own private non-folder documents into public space and move private documents or folder trees into public space. Administrators can move public content into their own private space. Deleted public documents and their descendants enter the trash; administrators can restore a selected document and its required parent chain. Private documents are deleted directly.

Concurrent edits use save-version checks, conflict comparison and version selection, without automatically merging two versions. Document-table layout is user-triggered, and content-based widths in data tables are optional. The OA page loads a configured external system.

Current Workloom interface running locally with demo data.

| Knowledge and folders | Rich-text editor and heading navigation |
| --- | --- |
| ![Knowledge](docs/images/workloom-knowledge.jpg) | ![Document editor](docs/images/workloom-editor.jpg) |
| Multi-view tables | AI and CLI settings |
| ![Tables](docs/images/workloom-tables.jpg) | ![AI and CLI](docs/images/workloom-ai-settings.jpg) |

## Quick deployment

You need Docker Engine, Docker Compose v2 and working SMTP settings for first-run setup. The installer generates `.env`, random secrets and a private setup link, then starts the service.

```bash
curl -fsSL https://raw.githubusercontent.com/bbmy85552/Workloom/main/scripts/install.sh | bash -s -- \
  --repo https://github.com/bbmy85552/Workloom.git \
  --dir workloom \
  --app-url https://workloom.example.com \
  --yes
```

Alternatively, install from a clone:

```bash
git clone https://github.com/bbmy85552/Workloom.git
cd Workloom
bash scripts/install.sh
```

From the deployment directory, check the service and find the first-run setup link:

```bash
docker compose ps
docker compose logs -f workloom
cat SETUP_URL.txt
```

Open the private link to create the administrator and configure SMTP and registration policy. Then configure an invitation code, branding, company name and OA URL in the admin console. Google sign-in uses `NEXT_PUBLIC_GOOGLE_CLIENT_ID`; enabling registration still requires a valid invitation code.

**Deployment note:** the live instance requires sign-in. Its project memory and dedicated memory MCP have not yet been synchronized to the public source; a cloned deployment provides the functionality implemented in this repository.

See [配置说明.md](配置说明.md) for environment variables, reverse proxy configuration, volumes and migration.

## AI and command-line access

Generate an API key under **Settings → AI and CLI**. Remote MCP uses Streamable HTTP at `https://your-domain/mcp`, with `Authorization: Bearer <API Key>`. Use your own instance URL and key.

```bash
export WORKLOOM_BASE_URL="https://workloom.example.com"
export WORKLOOM_API_KEY="<your API key>"
npm run workloom -- docs list
npm run workloom -- tables list
```

See [MCP_USAGE.md](MCP_USAGE.md) for tools, parameters and client configuration.

## Updates and data

The installer writes the current repository, branch and commit into deployment configuration. For a manual deployment, set:

```env
WORKLOOM_UPDATE_REPO=https://github.com/bbmy85552/Workloom.git
WORKLOOM_UPDATE_BRANCH=main
WORKLOOM_UPDATE_CHECK_URL=https://api.github.com/repos/bbmy85552/Workloom/commits/main
```

Update from the deployment directory:

```bash
bash scripts/update.sh
```

Low-memory servers can use host-side builds and a runtime image:

```bash
bash scripts/update-runtime.sh
```

If the server cannot fetch GitHub source, push an update from a computer that has the latest checkout. Set `--dir` to the actual server deployment directory:

```bash
git pull
bash scripts/push-update.sh --host root@example.com --dir /opt/workloom --runtime
```

SQLite and uploaded files use the `workloom-data` and `workloom-uploads` persistent volumes. Updates preserve data and runtime configuration; rebuilding a single container involves a restart window. For an existing instance, obtain the new scripts before the first deployment-name migration, then follow the [migration instructions](配置说明.md#已有实例迁移) to verify volumes and run the update. An already-running old script does not gain the new migration safeguards. Keep existing secrets and data volumes.

## Local development

On a fresh clone, create `server/.env` and edit the local configuration. Existing files are preserved.

```bash
cp -n server/.env.example server/.env
npm run setup
npm run dev
```

The web app defaults to `http://localhost:3000`, and the API to `http://localhost:4000`. Production Docker deployments use `.env` in the project root.

```bash
npm run lint
npm run test
npm run build
```

The stack is React, TypeScript, Vite, TipTap, Express, Prisma and SQLite. See the [product description](docs/PRD.md) and [maintenance guide](docs/MAINTENANCE.md).

## Origin and license

Workloom is substantially improved and continuously developed by [bbmy85552](https://github.com/bbmy85552) based on [Jianji](https://github.com/staklab/jianji). Original copyright notices are preserved. Application code uses the [MIT License](LICENSE); see [LICENSES/FONTS.md](LICENSES/FONTS.md) for font licenses.
