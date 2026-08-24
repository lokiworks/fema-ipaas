<h1 align="center">
  <img src="docs/resources/logo/light.svg#gh-light-mode-only" alt="FEMA Integration Platform" width="320" />
  <img src="docs/resources/logo/dark.svg#gh-dark-mode-only" alt="FEMA Integration Platform" width="320" />
</h1>

<p align="center">
  <a href="/LICENSE"><img src="https://img.shields.io/badge/license-MIT-green?style=for-the-badge" alt="MIT license" /></a>&nbsp;<img src="https://img.shields.io/github/commit-activity/w/lokiworks/fema-ipaas/main?style=for-the-badge" alt="commit activity" />
</p>

<p align="center">
  An open source integration platform for connecting the systems a company already runs on.
</p>

<p align="center">
  <a href="docs/overview"><b>Documentation</b></a>&nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="docs/install/overview.mdx"><b>Deploy</b></a>&nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="docs/build-connectors/building-connectors/overview.mdx"><b>Build a Connector</b></a>&nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="docs/adr/index.md"><b>Architecture Decisions</b></a>
</p>

<br>

## What this is

Companies run on many systems at once — ERP, CRM, HR, ticketing, and a pile of internal tools — and
those systems do not talk to each other. This platform connects them: a visual workflow builder, a
connector for each system, and a runtime that executes the result reliably.

It is an **enterprise integration platform**, not a personal automation tool. The unit of work is a
project owned by a team, versioned and published, with run logs and permissions around it. Data
transformation lives inside workflows, as expressions and script nodes — there is no separate ETL
product here, and none is planned.

**Self-hosted first.** There is no managed tier, no edition split, and no feature behind a licence
key. Everything in this repository is the whole product, MIT licensed.

## What it does

- **Visual workflow builder** — branches, loops, parallel execution, sub-workflows, and join edges,
  on a canvas that shows the real execution graph.
- **Typed connector framework** — connectors are TypeScript packages with typed actions, triggers,
  and auth. Hot reloading for local connector development.
- **Connections as first-class objects** — a connection carries the connector, the credential, and
  the endpoint, so moving a workflow between environments does not mean editing every node.
- **Error handling per node** — terminate, ignore, retry, or branch, matched on the error the
  connector actually returned.
- **Run logs** — every run keeps per-node input, output, and error, with retry from the failure.
- **MCP** — connectors and workflows can be exposed as MCP tools for LLM clients.
- **Human in the loop** — approval steps, forms, and chat interfaces as ordinary connectors.

## Getting started

```bash
npm start          # set up the dev environment and start everything
npm run dev        # frontend + backend only
```

For deploying a real instance — Docker, Docker Compose, Kubernetes — see
[the install guide](docs/install/overview.mdx).

## Building a connector

Connectors are npm packages under `packages/connectors`. They are written in TypeScript against a
typed SDK, validated with `fema connectors validate`, and published like any other package.

```bash
fema connector dev     # scaffold and iterate with hot reload
fema connector test    # run a connector's actions against real credentials
```

See the [connector guide](docs/build-connectors/building-connectors/overview.mdx) to write one.

## Contributing

Read [CLAUDE.md](CLAUDE.md) for the conventions this codebase holds itself to, and
[docs/adr](docs/adr/index.md) for the decisions behind them — the *why* is written down, so a change
that contradicts one is a conversation rather than a surprise.

Durable project context lives in [brain/knowledge](brain/knowledge) — subsystem pages, domain
vocabulary, and the gotchas each area carries. Read the page for an area before changing it.

## License

MIT. See [LICENSE](LICENSE).

This project began as a fork of [Activepieces](https://github.com/activepieces/activepieces)
Community Edition and remains a derivative work under its MIT licence. It has since diverged in
domain model, vocabulary, and product direction. Thanks to the Activepieces community for the
foundation.
