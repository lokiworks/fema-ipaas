export const feishuReadableError = {
  describe,
};

function describe({ code, hint, message }: { code: number; hint: string | undefined; message: string }): string {
  const readable = hint === undefined ? undefined : READABLE_HINTS[hint];
  return readable === undefined
    ? `飞书接口返回错误：${message}（飞书错误码 ${code}）`
    : `${readable}（飞书错误码 ${code}）`;
}

const READABLE_HINTS: Record<string, string> = {
  'the department is outside the contact scope of the app, add it to the app permission scope in the Open Platform and republish the app':
    '部门不在应用的通讯录权限范围内，请在开放平台把该部门加入应用权限范围并重新发布应用',
  'a department with this name already exists under the parent': '上级部门下已有同名部门',
  'Feishu is still processing another change to the contact directory, retry in a few seconds': '飞书正在处理通讯录的其他变更，请几秒后重试',
  'the department already exists': '部门已存在',
  'the custom department ID is already in use': '自定义部门 ID 已被占用',
  'the custom department ID must not start with od-, must not be 0 and must be at most 64 characters':
    '自定义部门 ID 不能以 od- 开头、不能为 0，且不超过 64 个字符',
  'the department tree exceeds 25 levels': '部门层级超过 25 级',
  'department names must not contain a slash': '部门名称不能包含斜杠',
  'the tenant access token expired, retry the step': '应用访问凭证已过期，请重试该步骤',
  'the app credentials are not valid, check the App ID and App Secret': '应用凭证无效，请检查 App ID 和 App Secret',
  'the App Secret is wrong, copy it again from Credentials & Basic Info in the Open Platform':
    'App Secret 不正确，请从开放平台「凭证与基础信息」重新复制',
  'the app is disabled or not installed in this organization, check the app status in the Open Platform':
    '应用已停用或未安装到该企业，请在开放平台检查应用状态',
  'the app has an IP allowlist and this server is not on it, add the server egress IP in the Open Platform security settings':
    '应用开启了 IP 白名单且本服务器不在其中，请在开放平台安全设置中加入服务器出口 IP',
  'the app is missing the permission this endpoint needs, grant it in the Open Platform and republish the app':
    '应用缺少该接口所需权限，请在开放平台开通权限并重新发布应用',
  "this month's API call quota of the Feishu free edition is used up, an administrator has to upgrade the edition, retrying will not help":
    '飞书免费版本月接口调用额度已用完，需管理员升级版本，重试无效',
  'the app is calling this endpoint too fast, slow down and retry': '调用过于频繁，请降低频率后重试',
  'Bitable is still processing another change to this table, retry in a few seconds': '多维表格正在处理该表的其他变更，请几秒后重试',
  'the member is outside the contact scope of the app, add the member or their department to the app permission scope in the Open Platform and republish the app':
    '成员不在应用的通讯录权限范围内，请在开放平台把成员或其部门加入应用权限范围并重新发布应用',
  'the department does not exist in Feishu, check the department ID or the department mapping table':
    '飞书中不存在该部门，请检查部门 ID 或部门映射表',
  'this mobile number already belongs to another Feishu account': '该手机号已属于另一个飞书账号',
  'this email already belongs to another Feishu account': '该邮箱已属于另一个飞书账号',
  'this member already exists in Feishu': '该成员在飞书中已存在',
  'the mobile number and the email belong to two different Feishu accounts, use another contact or have one account cancelled':
    '手机号和邮箱分别属于两个不同的飞书账号，请更换联系方式或注销其中一个账号',
  'the mobile number format is not valid, use 11 digits or a +country code number': '手机号格式不正确，请使用 11 位号码或带 + 国家码的号码',
  'the email format is not valid': '邮箱格式不正确',
  'a mobile number is required, and outside mainland China an email is required as well': '必须填写手机号，中国大陆以外还需要填写邮箱',
  'an unverified Feishu organization only accepts mainland China (+86) mobile numbers until it passes verification':
    '未认证的飞书企业只能使用中国大陆（+86）手机号，认证后才能使用其他号码',
  'Lark does not accept +86 mobile numbers': 'Lark 不接受 +86 手机号',
  'this employee number is already used by another Feishu member': '该工号已被另一位飞书成员使用',
  'the member or seat limit of this Feishu organization is reached, clean up members or upgrade the edition':
    '飞书企业成员数或席位已达上限，请清理成员或升级版本',
  'the member has already resigned in Feishu and can not be changed': '该成员在飞书中已离职，无法修改',
  'the member has not joined Feishu yet or has left it, so the account can not be changed': '该成员尚未加入飞书或已离开，无法修改账号',
  'the creator of the Feishu organization cannot be suspended': '飞书企业创建者不能被暂停',
  'the receiver ID or a request parameter is invalid, check the receiver and the message content': '接收者 ID 或请求参数无效，请检查接收者和消息内容',
  'the bot is not in that chat, add the app to the chat first': '机器人不在该群里，请先把应用加入群聊',
  'the bot ability is not switched on for the app, enable it in the Open Platform and republish the app':
    '应用未开启机器人能力，请在开放平台开启并重新发布应用',
  'the recipient is outside the availability scope of the app or has left, add them to the app availability scope and republish the app':
    '接收者不在应用可用范围内或已离开，请把接收者加入应用可用范围并重新发布应用',
  'the recipient has resigned, so no message can be sent': '接收者已离职，无法发送消息',
  'the group chat has been dissolved, pick another chat': '群聊已解散，请选择其他群',
  'that Bitable or data table does not exist, check the App Token and data table': '多维表格或数据表不存在，请检查 App Token 和数据表',
  'that Bitable record does not exist': '多维表格记录不存在',
  'a column name does not exist in the data table, copy it exactly from the table header': '数据表中不存在该列名，请从表头原样复制',
  'a value does not fit the type of its Bitable column': '字段值与多维表格列的类型不符',
};
