import { createAction, fixOwnerMarker, isObject, Property } from '@fema-ipaas/connector-sdk';

export const prepareApprovalLedger = createAction({ name: 'prepare_approval_ledger', displayName: 'Prepare approval ledger change', description: 'Validate one approval and its lookup result before applying a ledger change', classification: 'READ', requireAuth: false, props: { approval: Property.Json({ displayName: 'Current approval', required: true }), records: Property.Json({ displayName: 'Matching ledger records', required: true }), account: Property.ShortText({ displayName: 'Mapped accounting code', required: true }), amountField: Property.ShortText({ displayName: 'Amount form control', required: true, defaultValue: '金额' }), categoryField: Property.ShortText({ displayName: 'Expense category form control', required: true, defaultValue: '费用类型' }), financeUrl: Property.ShortText({ displayName: 'Finance endpoint (optional)', required: false }) }, outputSchema: { fields: ['fields', 'recordId', 'shouldCreate', 'shouldVoid', 'shouldNotify', 'shouldPostFinance', 'financeUrl', 'notification', 'notificationKey'].map((key) => ({ key })) }, async run(context) {
  const { approval, records, account, amountField, categoryField, financeUrl } = context.propsValue;
  if (!isObject(approval) || !Array.isArray(records) || !records.every(isObject) || typeof approval['instance_code'] !== 'string' || !isObject(approval['form'])) throw new Error('Invalid approval or ledger lookup result');
  if (records.length > 1) throw new Error(fixOwnerMarker.attach({ message: 'More than one ledger row has this approval instance ID. Resolve duplicates before continuing.', owner: 'MAPPING_OWNER' }));
  if (typeof account !== 'string' || !account.trim()) throw new Error(fixOwnerMarker.attach({ message: 'The expense category has no accounting code. Complete the mapping table before writing.', owner: 'MAPPING_OWNER' }));
  const amount = approval['form'][amountField];
  if (typeof amount !== 'number' || !Number.isFinite(amount)) throw new Error(fixOwnerMarker.attach({ message: 'The configured approval amount control is missing or is not numeric.', owner: 'SOURCE_DATA_OWNER' }));
  const status = String(approval['status']);
  const approved = status === 'APPROVED';
  const revoked = ['REVERTED', 'CANCELED', 'DELETED'].includes(status);
  const recordId = records[0]?.['record_id'];
  const fields = { '审批实例ID': approval['instance_code'], '审批编号': approval['serial_number'], '申请人': approval['open_id'], '部门': approval['department_id'], '金额': amount, '费用类型': approval['form'][categoryField], '会计科目': account, '状态': approved ? '有效' : '作废', '通过时间': Number(approval['end_time']) || null };
  return { fields, recordId: typeof recordId === 'string' ? recordId : '', shouldCreate: approved && records.length === 0, shouldVoid: revoked && typeof recordId === 'string', shouldNotify: approved || revoked, shouldPostFinance: approved && Boolean(financeUrl), financeUrl: financeUrl ?? '', notification: `审批 ${String(approval['serial_number'] ?? approval['instance_code'])}：${approved ? '已通过并登记台账' : '已撤销，台账已标记作废'}`, notificationKey: `${approval['instance_code']}:${status}` };
} });
