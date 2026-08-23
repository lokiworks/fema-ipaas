import { startFixtureServer, stopFixtureServer } from './fixture-server'

export async function setup(): Promise<void> {
    const baseUrl = await startFixtureServer()
    process.env.FEMA_TEST_FIXTURE_URL = baseUrl
}

export async function teardown(): Promise<void> {
    await stopFixtureServer()
}
