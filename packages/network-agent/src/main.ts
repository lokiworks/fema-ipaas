import { createNetworkAgent } from './lib/network-agent'

const serverUrl = process.env['FEMA_SERVER_URL']
const token = process.env['FEMA_NETWORK_AGENT_TOKEN']

if (!serverUrl || !token) {
    console.error('Set FEMA_SERVER_URL and FEMA_NETWORK_AGENT_TOKEN before starting the agent.')
    process.exit(1)
}

const agent = createNetworkAgent({ serverUrl, token })
agent.start()

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
        agent.stop()
        process.exit(0)
    })
}
