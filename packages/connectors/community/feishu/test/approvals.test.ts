import { afterEach, describe, expect, it, vi } from 'vitest';
import { feishuApprovals } from '../src/lib/common/approvals';
import { feishuCommon } from '../src/lib/common';

afterEach(() => vi.restoreAllMocks());

describe('approval form and enumeration', () => {
  it('normalizes amounts, dates, contacts and expiring attachment URLs', () => {
    expect(feishuApprovals.parseForm(JSON.stringify([{ name: 'Amount', type: 'amount', value: '123.40' }, { name: 'Date', type: 'date', value: '2026-10-27T08:00:00+08:00' }, { name: 'People', type: 'contact', value: ['user-1'], open_ids: ['ou-1'] }, { name: 'Receipts', type: 'attachmentV2', value: 'https://example.com/a,https://example.com/b' }]))).toEqual({ Amount: 123.4, Date: '2026-10-27T00:00:00.000Z', People: ['ou-1'], Receipts: ['https://example.com/a', 'https://example.com/b'] });
  });
  it('rejects duplicate names and invalid numeric values instead of losing data', () => {
    expect(() => feishuApprovals.parseForm('[{"name":"Amount","type":"amount","value":"abc"}]')).toThrow('invalid number');
    expect(() => feishuApprovals.parseForm('[{"name":"Amount","value":1},{"name":"Amount","value":2}]')).toThrow('duplicate control names');
  });
  it('holds one scan snapshot and advances inclusive windows without overlap', async () => {
    const calls: Record<string, string>[] = [];
    vi.spyOn(feishuCommon, 'callApi').mockImplementation(async (params) => {
      calls.push(params.queryParams ?? {});
      return { instance_code_list: [], has_more: false };
    });
    const auth = { props: { domain: 'https://open.feishu.cn', appId: 'test', appSecret: 'test' } };
    let token: string | undefined;
    do {
      const page = await feishuApprovals.enumerate({ auth, approvalCode: 'approval', lookbackDays: 1, pageSize: 100, pageToken: token });
      token = page.nextPageToken ?? undefined;
    } while (token);
    expect(calls).toHaveLength(3);
    for (let index = 0; index < calls.length; index++) {
      expect(Number(calls[index]['end_time']) - Number(calls[index]['start_time'])).toBeLessThan(36000000);
      if (index > 0) expect(Number(calls[index]['start_time'])).toBe(Number(calls[index - 1]['end_time']) + 1);
    }
  });
});
