import { prepareApprovalLedger } from './lib/actions/prepare-approval-ledger';
import { ledgerActions } from './lib/actions/ledger-records';
import { approvalActions } from './lib/actions/approvals';
import { approvalTriggers } from './lib/triggers/approvals';
import { enumerateUsers } from './lib/actions/enumerate-users';
import { enumerateDepartments } from './lib/actions/enumerate-departments';
import { archiveDepartment } from './lib/actions/archive-department';
import { upsertDepartment } from './lib/actions/upsert-department';
import { getDepartment } from './lib/actions/get-department';
import { ConnectorCategory, createConnector } from '@fema-ipaas/connector-sdk';

import { feishuAuth } from './lib/auth';
import { createBitableRecord } from './lib/actions/create-bitable-record';
import { findUser } from './lib/actions/find-user';
import { getUser } from './lib/actions/get-user';
import { listDepartments } from './lib/actions/list-departments';
import { listDepartmentUsers } from './lib/actions/list-department-users';
import { provisionUser } from './lib/actions/provision-user';
import { resumeUser } from './lib/actions/resume-user';
import { searchBitableRecords } from './lib/actions/search-bitable-records';
import { sendDirectMessage } from './lib/actions/send-direct-message';
import { sendGroupMessage } from './lib/actions/send-group-message';
import { suspendUser } from './lib/actions/suspend-user';
import { updateUser } from './lib/actions/update-user';
import { eventReceived } from './lib/triggers/event-received';

export const feishu = createConnector({
  displayName: 'Feishu',
  description: 'Send Feishu messages, look up and onboard members, and read or write Bitable records',
  minimumSupportedRelease: '0.30.0',
  categories: [ConnectorCategory.COMMUNICATION, ConnectorCategory.PRODUCTIVITY],
  logoUrl: '/assets/connectors/feishu.svg',
  authors: ['lokiworks'],
  auth: feishuAuth,
  actions: [prepareApprovalLedger, ...approvalActions, ...ledgerActions,enumerateUsers, getDepartment, upsertDepartment, archiveDepartment, enumerateDepartments,
    sendGroupMessage,
    sendDirectMessage,
    findUser,
    getUser,
    listDepartmentUsers,
    listDepartments,
    provisionUser,
    updateUser,
    suspendUser,
    resumeUser,
    createBitableRecord,
    searchBitableRecords,
  ],
  triggers: [...approvalTriggers,eventReceived],
});
