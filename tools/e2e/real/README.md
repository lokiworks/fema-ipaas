# Real tenant acceptance

Use a dedicated test enterprise and prefix created employee names, employee numbers and department names with `e2e-`. Keep credentials in local environment variables or saved platform connections. Never write credentials or personal records into reports.

`beisen-probe.mjs` is read-only. Build the Beisen connector, configure `E2E_BEISEN_APP_KEY`, `E2E_BEISEN_APP_SECRET` and `E2E_BEISEN_ROOT_ORGANIZATION_ID`, then run `node tools/e2e/real/beisen-probe.mjs`. It obtains credentials through the connector and reads a recent change window, organization tree and employee page. Reports contain types and missing field names, without field values. An empty page cannot establish field compatibility; repeat with a known test employee.

`feishu-cleanup.mjs` scans using `E2E_FEISHU_APP_ID`, `E2E_FEISHU_APP_SECRET` and an existing `E2E_FEISHU_ARCHIVE_DEPARTMENT_ID`. Its default prints selected IDs. `--apply` pauses and moves test users and archives test departments; it never deletes. Accounts must have both name and employee number starting with `e2e-`. The archive parent must be outside the cleanup set. Both scripts refuse mock base URL overrides.

Run organization sync first, then the people sync and approval ledger scenarios through the platform against saved real connections. Record provider error codes, actual quotas, requested scopes, counts, elapsed time and final read-back checks. Use a test-only tenant; mock scenarios are not proof of real permissions, visibility or quotas. Verify cleanup by reading back the same selected IDs.

Acceptance still requires test enterprises for Feishu, WeCom and DingTalk, Beisen read-only access and two test hosts. The checked-in mock scenarios do not stand in for those environments.
