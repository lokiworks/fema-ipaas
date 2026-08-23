import { test } from '../../../fixtures';

/**
 * Warmup resilience smoke test.
 *
 * Triggers a connector sync (which may cause warmup for some connectors) and then
 * verifies the worker remains healthy by successfully running a Webhook flow.
 * A broken connector published with workspace:* dependencies must not prevent other
 * flows from executing.
 */
test.describe('Connector isolation — CE', () => {
  test('worker stays healthy after connector sync and can execute a webhook flow', async ({ page, automationsPage, builderPage, request }) => {
    test.setTimeout(120000);

    // Trigger a connector sync — this exercises the warmup path
    const token = await page.evaluate(() => localStorage.getItem('token'));
    await request.post('/api/v1/connectors/sync', {
      headers: { Authorization: `Bearer ${token}` },
    });

    await automationsPage.waitFor();
    await automationsPage.newFlowFromScratch();

    await builderPage.selectInitialTrigger({
      connector: 'Webhook',
      trigger: 'Catch Webhook'
    });

    const webhookInput = page.locator('input.grow.bg-background');
    const webhookUrl = await webhookInput.inputValue();

    await builderPage.testTrigger();

    const runVersion = Math.floor(Math.random() * 100000);
    await page.context().request.get(`${webhookUrl}?runVersion=${runVersion}`);
    await page.waitForTimeout(3000);

    await builderPage.addAction({
      connector: 'Webhook',
      action: 'Return Response'
    });

    await page.locator('div.cm-activeLine.cm-line').fill('');
    await page.locator('div.cm-activeLine.cm-line').fill(
      '{"runVersion": "{{trigger[\'output\'][\'queryParams\'][\'runVersion\']}}"}'
    );

    await page.waitForTimeout(1000);
    await builderPage.publishFlow();

    await builderPage.expectSyncWebhookResponse({
      url: `${webhookUrl}/sync?runVersion=${runVersion}`,
      key: 'runVersion',
      expected: runVersion.toString(),
    });
  });
});
