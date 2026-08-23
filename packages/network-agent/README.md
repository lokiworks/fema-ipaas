# FEMA Network Agent

Reaches systems inside an enterprise network without opening an inbound port. The agent connects
**out** to the platform and waits; the platform sends it requests down that connection.

## Running

```bash
export FEMA_SERVER_URL=https://your-instance.example.com
export FEMA_NETWORK_AGENT_TOKEN=<the token shown once when the agent was created>
fema-network-agent
```

Create the agent first (tenant admin): `POST /v1/network-agents` with a display name and the hosts
or CIDR ranges it may reach. The response carries the token — it is shown once and only its HMAC is
stored, so save it then.

## What it does and does not decide

The agent decides nothing about what it may reach. The **server** checks every request against the
agent's host and CIDR allowlist before sending it, and records an audit event afterwards. The agent
performs the HTTP call and returns the result.

An agent whose allowlist is empty can reach nothing. That is deliberate: a newly created agent has
authorised no targets, not every target.

## Protocol

The wire contract is declared twice on purpose — here in `src/lib/tunnel-contract.ts` and on the
server in `packages/core/shared/src/lib/management/network-agent/tunnel-contract.ts`. The agent is a
binary installed inside a customer network and does not depend on the platform's shared package.
The two files are a pair: change one without the other and the mismatch appears at runtime as a
request that is never answered.
