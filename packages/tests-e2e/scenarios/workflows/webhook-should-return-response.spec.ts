import { test } from '../../fixtures';

test.describe('Webhooks', () => {
  test('should handle webhook with return response', async ({ page, automationsPage, builderPage }) => {
    test.setTimeout(120000);

    await automationsPage.waitFor();

    await automationsPage.newWorkflowFromScratch();

    await builderPage.selectInitialTrigger({
      connector: 'Webhook',
      trigger: 'Catch Webhook'
    });

    const webhookInput = page.locator('input.grow.bg-background');
    const webhookUrl = await webhookInput.inputValue();
    const runVersion = Math.floor(Math.random() * 100000);
    const urlWithParams = `${webhookUrl}/sync?targetRunVersion=${runVersion}`;

    await builderPage.testTrigger();

    await page.context().request.get(urlWithParams);
    await page.waitForTimeout(5000);

    await builderPage.addAction({
      connector: 'Webhook',
      action: 'Return Response'
    });

    //clear
    await page.locator('div.cm-activeLine.cm-line').fill(
      ''
    );

    await page.locator('div.cm-activeLine.cm-line').fill(
      '{"targetRunVersion": "{{trigger[\'output\'][\'queryParams\'][\'targetRunVersion\']}}"}'
    );

    await page.waitForTimeout(1000);
    await builderPage.publishWorkflow();

    await builderPage.expectSyncWebhookResponse({
      url: urlWithParams,
      key: 'targetRunVersion',
      expected: runVersion.toString(),
    });
  });

}); 