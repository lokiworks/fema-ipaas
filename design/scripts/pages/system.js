const SYS_WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const SYS_TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
const SYS_RETENTION = [7, 14, 30, 90, 180];
const SYS_RAW_RETENTION = [1, 3, 7];
const SYS_DISK_TOTAL = 200;
const SYS_DISK_BASE = 146.2;
const SYS_REGISTRY_URL = 'https://registry.fema.dev';
const SYS_KEY_PATH = '/data/keys/master.key';
const SYS_FILES_PATH = '/data/files';
const SYS_AUDIT_REVEAL = '查看日志原文';

const SYS_TIMEZONES = [
  { value: 'Asia/Shanghai', label: '(UTC+08:00) 北京、上海' },
  { value: 'Asia/Hong_Kong', label: '(UTC+08:00) 香港' },
  { value: 'Asia/Taipei', label: '(UTC+08:00) 台北' },
  { value: 'Asia/Singapore', label: '(UTC+08:00) 新加坡' },
  { value: 'Asia/Tokyo', label: '(UTC+09:00) 东京' },
  { value: 'Europe/London', label: '(UTC+00:00) 伦敦' },
  { value: 'Europe/Berlin', label: '(UTC+01:00) 柏林' },
  { value: 'America/New_York', label: '(UTC-05:00) 纽约' },
  { value: 'America/Los_Angeles', label: '(UTC-08:00) 洛杉矶' },
  { value: 'UTC', label: '(UTC+00:00) 协调世界时' },
];

const SYS_LANGS = [{ value: 'zh-CN', label: '简体中文' }, { value: 'en-US', label: 'English' }];

const SYS_SERVICE_META = {
  smtp: { name: '邮件（SMTP）', icon: 'Mail', desc: '发送邮件通知、成员邀请和找回密码邮件' },
  storage: { name: '对象存储', icon: 'Cloud', desc: 'S3 兼容的对象存储，保存运行中的文件和附件，多实例部署时需要' },
  registry: { name: '连接器仓库', icon: 'Store', desc: '在线安装和更新连接器，不配置时只能使用镜像内置的连接器' },
};

const SYS_SKIP_IMPACT = {
  smtp: '没有邮件服务：邮件通知和邀请邮件不可用，可以之后在管理后台配置。邀请成员时需要把登录地址手动发给对方，找回密码改由管理员重置。',
  storage: `没有对象存储：文件保存在本地目录 ${SYS_FILES_PATH}，只适合单实例部署，备份也只能写到本地目录。可以之后在管理后台配置。`,
  registry: '没有连接器仓库：只能使用镜像内置的连接器，不能在线安装和更新连接器。可以之后在管理后台配置。',
};

const SYS_ENV_CHECKS = [
  { key: 'db', icon: 'Database', name: 'PostgreSQL', detail: '16.4 · postgres:5432/fema', meaning: '保存工作流、运行记录、连接和配置，是需要定期备份的数据。' },
  { key: 'redis', icon: 'Layers', name: 'Redis', detail: '7.2 · redis:6379', meaning: '任务队列和缓存。重启会丢失排队中的任务，不影响已保存的数据。' },
  { key: 'files', icon: 'HardDrive', name: '文件存储', detail: `本地目录 ${SYS_FILES_PATH} · 可写`, meaning: '保存运行中产生的文件和附件。单实例部署用本地目录即可，多实例部署需要在「可选服务」里配置对象存储。' },
  { key: 'key', icon: 'KeyRound', name: '加密密钥', detail: `已自动生成 · ${SYS_KEY_PATH}`, meaning: '加密连接里的账号密码和密钥。密钥丢失后这些凭据都无法解密，需要和数据库备份分开保存。' },
  { key: 'worker', icon: 'Cpu', name: '内置工作节点', detail: '1 个 · 最大并发 10', meaning: '负责运行工作流。之后可以在管理后台把工作节点部署到内网，访问内网里的系统。' },
];

const SYS_SETUP_STEPS = [
  { title: '环境检查', heading: '检查运行环境', desc: '安装程序已经连接数据库和缓存，并生成了加密密钥。' },
  { title: '创建管理员', heading: '创建管理员账号', desc: '第一个账号是平台所有者，可以管理成员、登录方式和系统设置。' },
  { title: '组织信息', heading: '填写组织信息', desc: '用于登录页、邮件和各种链接，之后可以在管理后台修改。' },
  { title: '可选服务', heading: '配置可选服务', desc: '都可以跳过。跳过的服务，相关功能会显示为未启用，不会报错。' },
  { title: '完成', heading: '安装完成', desc: '平台已经可以使用，下面是建议接着做的几件事。' },
];

const SYS_PREVIEW_RELEASE = {
  version: '1.10.0-rc.1',
  highlights: ['工作流支持分支开发和合并', 'AI 智能体节点可以按步骤切换模型', '运行日志支持按字段值检索'],
  breaking: ['移除旧的环境变量 FEMA_WORKER_TOKEN，必须改用 FEMA_WORKER_SECRET', '代码节点的运行时升级到 Node.js 22，不再支持 Node.js 18 已废弃的接口'],
  migrations: 7,
  preview: true,
};

const SYS_PAYLOAD_LEVELS = [
  { value: 'full', label: '完整记录', icon: 'FileText', desc: '记录每个节点脱敏后的入参和出参，排查问题时能看到每一步的数据。' },
  { value: 'meta', label: '仅元数据', icon: 'ListTree', desc: '只记录状态、耗时、错误码和数据条数，不记录字段值。' },
  { value: 'none', label: '不记录输入输出', icon: 'EyeOff', desc: '只保留运行状态和耗时，错误信息里的数据也会去掉。' },
];

const SYS_PAYLOAD_EFFECTS = {
  full: ['每一步脱敏后的数据、错误信息', '可用，前面节点沿用原结果', '有权限的人可以查看，写入审计日志'],
  meta: ['失败在哪一步、错误码、数据条数，看不到字段值', '可用，中间结果加密保存到原文保存期结束', '在原文保存期内可以查看'],
  none: ['只有运行状态和耗时', '不可用，只能从触发器整体重跑', '不可用，平台不保存原文'],
};

const SYS_MASK_INFO = {
  phone: { field: 'mobile', example: '13812345678', desc: '字段名含 mobile、phone、手机，或值是 11 位手机号' },
  idcard: { field: 'id_card', example: '310101199203051234', desc: '字段名含 id_card、身份证，或值是 18 位身份证号' },
  bankcard: { field: 'bank_card_no', example: '6222021234567890123', desc: '字段名含 bank、card_no、卡号，或值是 16 到 19 位数字' },
  email: { field: 'email', example: 'tangkexin@xinghe.tech', desc: '字段名含 email、mail、邮箱，或值是邮箱地址' },
  secret: { field: 'api_token', example: 'sk_live_8f2aX91kLm', desc: '字段名含 secret、token、password、api_key、密码、密钥' },
};

const SYS_MASK_SAMPLES = [
  { value: 'onboard', label: '入职事件（北森）', data: { employee_id: 'XH20260918', name: '唐可欣', email: 'tangkexin@xinghe.tech', mobile: '13812345678', id_card: '310101199203051234', department: '研发中心', position: '前端工程师', salary: 28000, bank_card_no: '6222021234567890123', entry_date: '2026-09-22' } },
  { value: 'lead', label: '官网线索（Webhook）', data: { headers: { authorization: 'Bearer sk_live_8f2aX91kLm', 'content-type': 'application/json' }, body: { name: '王先生', company: '云帆物流', email: 'Wang.Lei@YunfanLogistics.com', phone: '13822912291', budget: 360000, source: '官网' } } },
  { value: 'custom', label: '自定义 JSON' },
];

const SYS_REVEAL_ROLES = [{ value: 'owner', label: '所有者' }, { value: 'admin', label: '管理员' }, { value: 'member', label: '成员' }];

const SYS_ERASURE_KINDS = [
  { value: 'employee', label: '工号', placeholder: 'XH20210311', error: '工号由字母前缀和数字组成，例如 XH20210311' },
  { value: 'email', label: '邮箱', placeholder: 'name@example.com', error: '邮箱格式不正确' },
  { value: 'phone', label: '手机号', placeholder: '13800000000', error: '请输入 11 位手机号' },
];

const SYS_LEVEL_ICON = { ok: 'CircleCheck', warning: 'TriangleAlert', error: 'CircleX', info: 'Info', running: 'LoaderCircle', pending: 'Circle' };

const sysJobs = { job: null, listeners: new Set(), timer: null };

function sysOf(state) {
  const s = state.system || {};
  const skipped = (s.setup && s.setup.skipped) || [];
  const svc = s.services || {};
  return {
    ...s,
    version: s.version || '1.0.0',
    build: s.build || '',
    installedAt: s.installedAt || Date.now(),
    update: { checkedAt: null, channel: 'stable', offline: false, available: null, ack: null, lastError: null, previewCheckedAt: null, previewAvailable: null, ...(s.update || {}) },
    backupPolicy: sysPolicyOf(s.backupPolicy),
    backups: s.backups || [],
    setup: { completed: true, completedAt: null, skipped: [], ...(s.setup || {}) },
    services: {
      smtp: { configured: false, host: '', port: '465', security: 'ssl', user: '', from: '', fromName: '', hasPassword: false, testedAt: null, ...(svc.smtp || {}) },
      storage: { configured: false, endpoint: '', region: '', bucket: '', accessKey: '', pathStyle: true, hasSecret: false, testedAt: null, ...(svc.storage || {}) },
      registry: { mode: skipped.includes('registry') ? 'off' : 'official', url: '', testedAt: null, ...(svc.registry || {}) },
    },
  };
}

function sysSet(fn) {
  Store.set((s) => ({ ...s, system: fn(sysOf(s)) }));
}

function sysWithService(s, kind, value) {
  const sys = sysOf(s);
  return { ...sys, services: { ...sys.services, [kind]: value } };
}

function sysPolicyOf(p) {
  const raw = p || {};
  const m = /^每(天|周([一二三四五六日]))\s*(\d{2}:\d{2})$/.exec(raw.schedule || '');
  const parsed = m ? { frequency: m[1] === '天' ? 'daily' : 'weekly', weekday: m[2] ? '一二三四五六日'.indexOf(m[2]) : 0, time: m[3] } : {};
  return { enabled: true, frequency: 'daily', weekday: 0, time: '02:00', keep: 7, target: 'local', path: '/data/fema/backups', ...parsed, ...raw, s3: { configured: false, ...(raw.s3 || {}) } };
}

function sysScheduleText(p) {
  return `${p.frequency === 'weekly' ? `每${SYS_WEEKDAYS[p.weekday] || SYS_WEEKDAYS[0]}` : '每天'} ${p.time}`;
}

function sysCmp(a, b) {
  const parse = (v) => {
    const [core, pre] = String(v || '0').split('-');
    return { nums: core.split('.').map((x) => Number(x) || 0), pre: pre || null };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < Math.max(x.nums.length, y.nums.length); i++) {
    const d = (x.nums[i] || 0) - (y.nums[i] || 0);
    if (d) return d;
  }
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  return x.pre < y.pre ? -1 : 1;
}

function sysPrevVersion(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v || '');
  if (!m || m[3] === '0') return null;
  return `${m[1]}.${m[2]}.${Number(m[3]) - 1}`;
}

function sysBackupVersion(b, sys) {
  if (b.version) return b.version;
  const mark = sys.backups.find((x) => x.note && x.note.includes(`升级到 ${sys.version}`));
  return mark && b.at <= mark.at ? sysPrevVersion(sys.version) || sys.version : sys.version;
}

function sysGb(n) {
  return n >= 10 ? n.toFixed(0) : n.toFixed(1);
}

function sysDisk(state) {
  const sys = sysOf(state);
  const backupsGb = sys.backups.filter((b) => b.status === 'success' && b.target !== 's3').reduce((a, b) => a + (b.size || 0), 0) / 1024;
  const used = SYS_DISK_BASE + backupsGb;
  return { total: SYS_DISK_TOTAL, used, free: SYS_DISK_TOTAL - used, backupsGb };
}

function sysHash(text, salt) {
  return [...`${salt}:${text}`].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261).toString(16).padStart(8, '0');
}

function sysInstanceId(state) {
  const h = [0, 1, 2, 3].map((i) => sysHash(state.tenant.domain, i)).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function sysNextRun(p, now) {
  if (!p.enabled) return null;
  const [h, m] = p.time.split(':').map(Number);
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  if (p.frequency === 'weekly') {
    const target = (p.weekday + 1) % 7;
    let diff = (target - d.getDay() + 7) % 7;
    if (diff === 0 && d.getTime() <= now) diff = 7;
    d.setDate(d.getDate() + diff);
  } else if (d.getTime() <= now) {
    d.setDate(d.getDate() + 1);
  }
  return d.getTime();
}

function sysWhen(ts) {
  const d = new Date(ts);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(ts);
  day.setHours(0, 0, 0, 0);
  const days = Math.round((day.getTime() - today.getTime()) / DAY);
  const hm = `${fmt.pad(d.getHours())}:${fmt.pad(d.getMinutes())}`;
  if (days === 0) return `今天 ${hm}`;
  if (days === 1) return `明天 ${hm}`;
  return `${fmt.date(ts).slice(5)} ${SYS_WEEKDAYS[(d.getDay() + 6) % 7]} ${hm}`;
}

function sysStamp(ts) {
  return fmt.dateTime(ts).slice(0, 16);
}

function sysDownload(filename, data) {
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

function sysNotify(title, desc, to) {
  Store.set((s) => ({ ...s, notifications: [{ id: uid('nt'), type: 'system', title, desc, time: Date.now(), read: false, to }, ...s.notifications] }));
}

function sysLatestBackup(sys) {
  return sys.backups.filter((b) => b.status === 'success').sort((a, b) => b.at - a.at)[0] || null;
}

function sysSmtpReady(state) {
  return sysOf(state).services.smtp.configured;
}

function sysBackupFile(b) {
  const d = new Date(b.at);
  return `backup-${d.getFullYear()}${fmt.pad(d.getMonth() + 1)}${fmt.pad(d.getDate())}-${fmt.pad(d.getHours())}${fmt.pad(d.getMinutes())}.tar.gz`;
}

function sysStable(v) {
  return JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x));
}

function sysHostError(v) {
  const t = String(v || '').trim();
  if (!t) return '请输入服务器地址';
  if (/^[a-z]+:\/\//i.test(t)) return '只填写主机名，不要带协议前缀';
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i.test(t)) return '主机名格式不正确';
  return null;
}

function sysUrlError(v, { label = '地址', httpsOnly = false, allowPath = false } = {}) {
  const t = String(v || '').trim();
  if (!t) return adminCjk('请输入', label);
  let u = null;
  try { u = new URL(t); } catch (e) { u = null; }
  if (!u || !/^https?:\/\//i.test(t)) return adminCjk(label, '需要以 http:// 或 https:// 开头，例如 https://example.com');
  if (httpsOnly && u.protocol !== 'https:') return adminCjk(label, '必须使用 https://');
  if (!u.hostname.includes('.') && u.hostname !== 'localhost') return adminCjk(label, '的主机名不完整');
  if ((!allowPath && u.pathname !== '/') || u.search || u.hash) return adminCjk(label, '不能包含路径或参数');
  return null;
}

function sysServiceDraft(kind, saved) {
  if (kind === 'smtp') return { host: saved.host || '', port: String(saved.port || '465'), security: saved.security || 'ssl', user: saved.user || '', password: '', from: saved.from || '', fromName: saved.fromName || '' };
  if (kind === 'storage') return { endpoint: saved.endpoint || '', region: saved.region || '', bucket: saved.bucket || '', accessKey: saved.accessKey || '', secret: '', pathStyle: saved.pathStyle !== false };
  return { mode: saved.mode === 'mirror' ? 'mirror' : 'official', url: saved.url || '' };
}

function sysServiceErrors(kind, d, saved) {
  if (kind === 'smtp') {
    const port = String(d.port || '').trim();
    return {
      host: sysHostError(d.host),
      port: !/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535 ? '请输入 1 到 65535 之间的端口' : null,
      password: d.user.trim() && !d.password && !saved.hasPassword ? '填写了用户名时需要密码' : null,
      from: !d.from.trim() ? '请输入发件人地址' : !ADMIN_EMAIL_RE.test(d.from.trim()) ? '发件人地址格式不正确' : null,
    };
  }
  if (kind === 'storage') {
    const bucket = d.bucket.trim();
    return {
      endpoint: sysUrlError(d.endpoint, { label: 'Endpoint' }),
      region: d.region.trim() && !/^[a-z0-9-]+$/i.test(d.region.trim()) ? 'Region 只能包含字母、数字和中划线' : null,
      bucket: !bucket ? '请输入 Bucket 名称' : !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) || bucket.includes('..') ? 'Bucket 名称是 3 到 63 位小写字母、数字、点或中划线' : null,
      accessKey: !d.accessKey.trim() ? '请输入 Access Key ID' : null,
      secret: !d.secret && !saved.hasSecret && !d.reuse ? '请输入 Secret Access Key' : null,
      prefix: d.prefix && !/^[A-Za-z0-9._/-]*$/.test(d.prefix) ? '路径前缀只能包含字母、数字、点、中划线和斜杠' : d.prefix && d.prefix.startsWith('/') ? '路径前缀不要以 / 开头' : null,
    };
  }
  return { url: d.mode === 'mirror' ? sysUrlError(d.url, { label: '镜像地址', httpsOnly: true, allowPath: true }) : null };
}

function sysServiceTest(kind, d, state, to) {
  const sys = sysOf(state);
  const offline = sys.update.offline;
  if (kind === 'smtp') {
    const host = d.host.trim().toLowerCase();
    const port = Number(d.port);
    if (['localhost', '127.0.0.1'].includes(host)) return { ok: false, message: `连接被拒绝：容器里的 ${host} 指向应用容器自己，请填写邮件服务器的地址` };
    if (port === 465 && d.security !== 'ssl') return { ok: false, message: 'TLS 握手失败：465 端口需要选择 SSL/TLS' };
    if (port === 587 && d.security === 'ssl') return { ok: false, message: 'TLS 握手失败：587 端口通常使用 STARTTLS' };
    if (offline && /(^|\.)(qq|163|126|aliyun|exmail|feishu|gmail|outlook|office365)\.com$/.test(host)) return { ok: false, message: `无法连接 ${host}:${port}：服务器不能访问外网，请改用内网的邮件服务器` };
    const me = state.users.find((u) => u.id === state.me);
    return { ok: true, message: `连接和登录成功，测试邮件已发送到 ${to || (me ? me.email : '当前管理员的邮箱')}` };
  }
  if (kind === 'storage') {
    let host = '';
    try { host = new URL(d.endpoint.trim()).hostname; } catch (e) { host = ''; }
    if (offline && /(aliyuncs|myqcloud|amazonaws|huaweicloud|volces)\.com$/.test(host)) return { ok: false, message: `无法连接 ${host}：服务器不能访问外网，请改用内网的对象存储（例如 MinIO）` };
    if (d.secret && d.secret.length < 16) return { ok: false, message: 'SignatureDoesNotMatch：签名不匹配，请检查 Secret Access Key' };
    return { ok: true, message: `已在 ${d.bucket.trim()} 中写入并删除测试对象 ${d.prefix || ''}.healthcheck` };
  }
  if (d.mode === 'official' && offline) return { ok: false, message: `无法连接 ${SYS_REGISTRY_URL}：服务器不能访问外网。内网部署可以改用自建镜像，或者先跳过` };
  return { ok: true, message: `已连接，仓库里有 ${CONNECTORS.filter((c) => !c.builtin).length} 个连接器可以安装和更新` };
}

function sysServiceStatus(kind, state) {
  const sys = sysOf(state);
  const s = sys.services[kind];
  if (kind === 'registry') {
    if (s.mode === 'off') return 'off';
    return s.mode === 'official' && sys.update.offline ? 'error' : 'ok';
  }
  return s.configured ? 'ok' : 'off';
}

function sysServiceSummary(kind, state) {
  const sys = sysOf(state);
  const s = sys.services[kind];
  if (kind === 'smtp') return s.configured ? `${s.host}:${s.port} · ${{ ssl: 'SSL/TLS', starttls: 'STARTTLS', none: '不加密' }[s.security]} · 发件人 ${s.from}` : '未配置，邮件通知和邀请邮件不可用';
  if (kind === 'storage') {
    if (!s.configured) return `未配置，文件保存在本地目录 ${SYS_FILES_PATH}`;
    let host = s.endpoint;
    try { host = new URL(s.endpoint).host; } catch (e) { host = s.endpoint; }
    return `${s.bucket} · ${host}${s.region ? ` · ${s.region}` : ''}`;
  }
  if (s.mode === 'off') return '未配置，只能使用镜像内置的连接器';
  if (s.mode === 'mirror') return `自建镜像 ${s.url}`;
  return sys.update.offline ? `官方仓库 ${SYS_REGISTRY_URL} · 无法连接，服务器不能访问外网` : `官方仓库 ${SYS_REGISTRY_URL}`;
}

function sysPasswordError(pw, email, min) {
  if (!pw) return '请输入密码';
  if (pw.length < min) return `密码至少 ${min} 位`;
  if (!/[a-z]/i.test(pw) || !/\d/.test(pw)) return '密码需要同时包含字母和数字';
  const local = String(email || '').split('@')[0].toLowerCase();
  if (local.length >= 3 && pw.toLowerCase().includes(local)) return '密码不能包含邮箱用户名';
  return null;
}

function sysPasswordScore(pw) {
  if (!pw) return 0;
  const score = [pw.length >= 10, pw.length >= 14, /[a-z]/.test(pw) && /[A-Z]/.test(pw), /\d/.test(pw), /[^A-Za-z0-9]/.test(pw)].filter(Boolean).length;
  return /(.)\1{2,}|1234|abcd|password|qwer|admin/i.test(pw) ? Math.max(0, score - 2) : score;
}

function sysPreviewRelease() {
  return { ...SYS_PREVIEW_RELEASE, releasedAt: Date.now() - 2 * DAY };
}

function sysUpdateView(sys) {
  const u = sys.update;
  const preview = u.channel === 'preview';
  const checkedAt = preview ? u.previewCheckedAt : u.checkedAt;
  const found = preview ? u.previewAvailable : u.available;
  const release = found && sysCmp(found.version, sys.version) > 0 ? found : null;
  const failed = Boolean(u.lastError && u.lastError.channel === u.channel && (!checkedAt || u.lastError.at > checkedAt));
  return { checkedAt, release, failed, found };
}

function sysJobEmit(job) {
  sysJobs.job = job;
  sysJobs.listeners.forEach((l) => l());
}

function useSysJob() {
  return useSyncExternalStore((l) => { sysJobs.listeners.add(l); return () => sysJobs.listeners.delete(l); }, () => sysJobs.job);
}

function sysRunJob({ kind, phases, meta, onDone }) {
  if (sysJobs.job && !sysJobs.job.done) return false;
  clearInterval(sysJobs.timer);
  const total = phases.reduce((a, p) => a + p.ms, 0);
  const startedAt = Date.now();
  sysJobEmit({ id: uid('job'), kind, phases, meta, progress: 0, phase: 0, startedAt, done: false, result: null });
  sysJobs.timer = setInterval(() => {
    const elapsed = Date.now() - startedAt;
    if (elapsed >= total) {
      clearInterval(sysJobs.timer);
      const result = onDone();
      sysJobEmit({ ...sysJobs.job, progress: 100, phase: phases.length, done: true, result });
      return;
    }
    const ends = phases.reduce((acc, p) => [...acc, (acc[acc.length - 1] || 0) + p.ms], []);
    const phase = ends.findIndex((end) => elapsed < end);
    sysJobEmit({ ...sysJobs.job, progress: Math.min(99, Math.round((elapsed / total) * 100)), phase });
  }, 150);
  return true;
}

function sysClearJob() {
  if (sysJobs.job && sysJobs.job.done) sysJobEmit(null);
}

function sysStartBackup(note) {
  const sys = sysOf(Store.get());
  const target = sys.backupPolicy.target === 's3' && sys.backupPolicy.s3.configured ? 's3' : 'local';
  const last = sysLatestBackup(sys);
  return sysRunJob({
    kind: 'backup',
    meta: { note, target },
    phases: [{ label: '导出数据库', ms: 1400 }, { label: '打包上传的文件', ms: 900 }, { label: target === 's3' ? '上传到 S3 兼容存储' : '写入本地目录', ms: 800 }, { label: '校验备份文件', ms: 500 }],
    onDone: () => {
      const cur = sysOf(Store.get());
      const entry = { id: uid('bk'), at: Date.now(), size: (last ? last.size : 400) + 3, type: 'manual', status: 'success', target, by: Store.get().me, version: cur.version, ...(note ? { note } : {}) };
      sysSet((x) => ({ ...x, backups: [entry, ...x.backups] }));
      addAudit('手动备份', `${sysStamp(entry.at)}${note ? ` · ${note}` : ''}`);
      toast.success(`备份完成：${entry.size} MB`);
      return { backupId: entry.id };
    },
  });
}

function sysStartRestore(backup, snapshot) {
  const sys = sysOf(Store.get());
  const from = sysBackupVersion(backup, sys);
  const stamp = sysStamp(backup.at);
  const phases = [
    ...(snapshot ? [{ label: '备份当前数据', ms: 1300 }] : []),
    { label: '恢复数据库', ms: 1500 },
    { label: '恢复上传的文件', ms: 800 },
    ...(sysCmp(from, sys.version) < 0 ? [{ label: `执行数据库迁移（${from} → ${sys.version}）`, ms: 900 }] : []),
    { label: '校验数据完整性', ms: 600 },
  ];
  const snapAt = Date.now();
  return sysRunJob({
    kind: 'restore',
    meta: { backupId: backup.id, stamp, snapshot },
    phases,
    onDone: () => {
      const cur = sysOf(Store.get());
      const last = sysLatestBackup(cur);
      const snap = snapshot ? { id: uid('bk'), at: snapAt, size: (last ? last.size : 400) + 1, type: 'manual', status: 'success', target: cur.backupPolicy.target === 's3' && cur.backupPolicy.s3.configured ? 's3' : 'local', by: Store.get().me, version: cur.version, note: `恢复到 ${stamp} 前自动创建` } : null;
      if (snap) sysSet((x) => ({ ...x, backups: [snap, ...x.backups] }));
      addAudit('恢复备份', `${stamp}（${from}）${snap ? '，恢复前已备份当前数据' : ''}`);
      sysNotify(`数据已恢复到 ${stamp} 的备份`, '工作节点仍处于停止状态，确认数据无误后在「备份与恢复」中启动。', '/admin/backup');
      return { snapshotId: snap ? snap.id : null };
    },
  });
}

function sysStartWorkers() {
  const stopped = Store.get().workers.filter((w) => w.stoppedFor === 'restore');
  if (!stopped.length) return;
  const ids = new Set(stopped.map((w) => w.id));
  Store.set((s) => ({ ...s, workers: s.workers.map((w) => (ids.has(w.id) ? { ...w, status: 'online', stoppedFor: undefined, heartbeatAt: Date.now(), startedAt: Date.now(), jobs: 0 } : w)) }));
  addAudit('启动工作节点', `${stopped.length} 个，恢复备份后`);
  toast.success(`已启动 ${stopped.length} 个工作节点`);
}

function SysLevelIcon({ level, size = 16 }) {
  return html`<span className=${cx('sys-level', `is-${level}`)}><${Icon} name=${SYS_LEVEL_ICON[level] || 'Circle'} size=${size} className=${level === 'running' ? 'spin' : ''} /></span>`;
}

function SysCmd({ code }) {
  return html`<div className="sys-cmd"><${CodeBlock} code=${code} /><div className="sys-cmd-copy"><${CopyButton} text=${code} label="复制" /></div></div>`;
}

function SysServiceFields({ kind, draft, onChange, show, saved = {}, withPrefix }) {
  const state = useStore();
  const set = (k, v) => onChange({ ...draft, [k]: v }, k);
  if (kind === 'smtp') {
    const setPort = (v) => {
      const port = v.replace(/\D/g, '').slice(0, 5);
      const security = port === '465' ? 'ssl' : port === '587' ? 'starttls' : draft.security;
      onChange({ ...draft, port, security }, 'port');
    };
    return html`<div className="form-grid sys-form-grid">
      <${Field} label="SMTP 服务器" required error=${show('host')}><${Input} value=${draft.host} onChange=${(v) => set('host', v.trim())} placeholder="smtp.example.com" invalid=${Boolean(show('host'))} /><//>
      <${Field} label="端口" required error=${show('port')} hint="465 使用 SSL/TLS，587 使用 STARTTLS"><${Input} value=${draft.port} onChange=${setPort} placeholder="465" invalid=${Boolean(show('port'))} /><//>
      <${Field} label="加密方式" hint=${draft.security === 'none' ? '不加密时密码以明文传输，只适合内网中继' : null}><${Segmented} value=${draft.security} onChange=${(v) => set('security', v)} options=${[{ value: 'ssl', label: 'SSL/TLS' }, { value: 'starttls', label: 'STARTTLS' }, { value: 'none', label: '不加密' }]} /><//>
      <${Field} label="发件人名称" hint="留空时使用产品名称"><${Input} value=${draft.fromName} onChange=${(v) => set('fromName', v.slice(0, 30))} placeholder=${state.tenant.appearance.productName} /><//>
      <${Field} label="用户名" hint="不需要认证的内网中继可以留空"><${Input} value=${draft.user} onChange=${(v) => set('user', v.trim())} placeholder="notify@example.com" /><//>
      <${Field} label="密码" required=${Boolean(draft.user) && !saved.hasPassword} hint=${saved.hasPassword ? '已保存，留空表示不修改' : '邮箱服务商提供的授权码或密码'} error=${show('password')}><${SecretInput} value=${draft.password} onChange=${(v) => set('password', v)} placeholder=${saved.hasPassword ? '已保存' : ''} invalid=${Boolean(show('password'))} /><//>
      <${Field} label="发件人地址" required error=${show('from')}><${Input} value=${draft.from} onChange=${(v) => set('from', v.trim())} placeholder="noreply@example.com" invalid=${Boolean(show('from'))} /><//>
    </div>`;
  }
  if (kind === 'storage') {
    const httpWarn = !show('endpoint') && /^http:\/\//i.test(draft.endpoint.trim()) ? '使用 http 时数据以明文传输，只建议在内网使用' : null;
    return html`<div className="form-grid sys-form-grid">
      <${Field} label="Endpoint" required error=${show('endpoint')} hint=${httpWarn || '例如 https://oss-cn-hangzhou.aliyuncs.com 或 http://minio.internal:9000'}><${Input} value=${draft.endpoint} onChange=${(v) => set('endpoint', v.trim())} placeholder="https://s3.example.com" invalid=${Boolean(show('endpoint'))} /><//>
      <${Field} label="Region" error=${show('region')} hint="MinIO 可以留空"><${Input} value=${draft.region} onChange=${(v) => set('region', v.trim())} placeholder="cn-hangzhou" invalid=${Boolean(show('region'))} /><//>
      <${Field} label="Bucket" required error=${show('bucket')}><${Input} mono value=${draft.bucket} onChange=${(v) => set('bucket', v.trim())} placeholder="fema-files" invalid=${Boolean(show('bucket'))} /><//>
      ${withPrefix
        ? html`<${Field} label="路径前缀" error=${show('prefix')} hint="备份文件写到这个前缀下"><${Input} mono value=${draft.prefix} onChange=${(v) => set('prefix', v.trim())} placeholder="backups/" invalid=${Boolean(show('prefix'))} /><//>`
        : html`<${Field} label="路径风格访问" hint="MinIO 和大多数自建存储需要打开"><${Switch} checked=${draft.pathStyle} onChange=${(v) => set('pathStyle', v)} /><//>`}
      <${Field} label="Access Key ID" required error=${show('accessKey')}><${Input} mono value=${draft.accessKey} onChange=${(v) => set('accessKey', v.trim())} invalid=${Boolean(show('accessKey'))} /><//>
      <${Field} label="Secret Access Key" required=${!saved.hasSecret && !draft.reuse} hint=${draft.reuse ? '沿用「对象存储」里保存的密钥' : saved.hasSecret ? '已保存，留空表示不修改' : null} error=${show('secret')}><${SecretInput} value=${draft.secret} onChange=${(v) => onChange({ ...draft, secret: v, reuse: false }, 'secret')} placeholder=${saved.hasSecret || draft.reuse ? '已保存' : ''} invalid=${Boolean(show('secret'))} /><//>
    </div>`;
  }
  return html`<${Field} label="镜像地址" required error=${show('url')} hint="内网里同步了官方仓库的镜像，必须使用 https"><${Input} value=${draft.url} onChange=${(v) => set('url', v.trim())} placeholder="https://connectors.example.com" invalid=${Boolean(show('url'))} /><//>`;
}

function SysServiceTest({ kind, draft, valid, test, onTest, auto, to }) {
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const sig = JSON.stringify(draft);
  const current = test && test.sig === sig ? test : null;
  const run = () => {
    setBusy(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setBusy(false);
      onTest({ sig, at: Date.now(), ...sysServiceTest(kind, draft, Store.get(), to) });
    }, 900);
  };
  useEffect(() => { if (auto && valid && !current) run(); }, [auto, sig]);
  const hint = !valid ? '先填好必填项再测试' : !current && !busy ? '测试通过后才能保存' : null;
  return html`<div className="sys-test">
    <div className="row">
      <${Button} icon=${kind === 'smtp' ? 'Send' : 'PlugZap'} loading=${busy} disabled=${!valid} onClick=${run}>${kind === 'smtp' ? '发送测试邮件' : '测试连接'}<//>
      ${hint && html`<span className="text-xs muted">${hint}</span>`}
    </div>
    ${current && !busy && html`<div className="sys-test-result"><${Alert} tone=${current.ok ? 'success' : 'danger'} title=${current.ok ? '测试通过' : '测试没有通过'}>${current.message}<//></div>`}
  </div>`;
}

function SysSetupService({ kind, value, onPatch, tried, to }) {
  const meta = SYS_SERVICE_META[kind];
  const modes = kind === 'registry'
    ? [{ value: 'official', label: '官方仓库' }, { value: 'mirror', label: '自建镜像' }, { value: 'skip', label: '跳过' }]
    : [{ value: 'config', label: '现在配置' }, { value: 'skip', label: '跳过' }];
  const draft = kind === 'registry' ? { mode: value.mode, url: value.draft.url } : value.draft;
  const errors = value.mode === 'skip' ? {} : sysServiceErrors(kind, draft, {});
  const valid = !Object.values(errors).some(Boolean);
  const tested = Boolean(value.test && value.test.ok && value.test.sig === JSON.stringify(draft));
  const show = (k) => (value.touched[k] || tried ? errors[k] : null);
  const change = (next, key) => onPatch((cur) => ({ draft: kind === 'registry' ? { ...cur.draft, url: next.url } : next, touched: { ...cur.touched, [key]: true } }));
  return html`<div className=${cx('sys-svc', value.mode !== 'skip' && 'is-open')}>
    <div className="sys-svc-head">
      <${KindTile} icon=${meta.icon} size=${36} />
      <div className="grow">
        <div className="row"><b>${meta.name}</b>${value.mode === 'skip' ? html`<${Tag} size="sm" tone="outline">跳过<//>` : tested ? html`<${Tag} size="sm" tone="success" icon="CircleCheck">测试通过<//>` : html`<${Tag} size="sm" tone="warning">待测试<//>`}</div>
        <div className="text-xs muted">${meta.desc}</div>
      </div>
      <${Segmented} value=${value.mode} onChange=${(mode) => onPatch({ mode })} options=${modes} />
    </div>
    <div className="sys-svc-body">
      ${value.mode === 'skip'
        ? html`<${Alert} tone="warning" title="跳过后的影响">${SYS_SKIP_IMPACT[kind]}<//>`
        : html`<${Fragment}>
          ${kind === 'registry' && value.mode === 'official'
            ? html`<div className="text-xs muted sys-svc-note">从官方仓库 <span className="mono">${SYS_REGISTRY_URL}</span> 安装和更新连接器，需要服务器能访问外网。</div>`
            : html`<${SysServiceFields} kind=${kind} draft=${kind === 'registry' ? draft : value.draft} onChange=${change} show=${show} />`}
          <${SysServiceTest} kind=${kind} draft=${draft} valid=${valid} test=${value.test} auto=${kind === 'registry' && value.mode === 'official'} to=${to} onTest=${(test) => onPatch({ test })} />
          ${tried && !tested && html`<div className="field-error">${valid ? '测试通过后才能继续，或者选择跳过' : '先修正上面的错误，或者选择跳过'}</div>`}
        <//>`}
    </div>
  </div>`;
}

function SetupWizard() {
  const state = useStore();
  const sys = sysOf(state);
  const appearance = state.tenant.appearance;
  const minLength = (state.sso.password && state.sso.password.minLength) || 10;
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [tried, setTried] = useState({});
  const [checks, setChecks] = useState(() => SYS_ENV_CHECKS.map((_, i) => (i === 0 ? 'running' : 'pending')));
  const [admin, setAdmin] = useState({ name: '', email: '', password: '', confirm: '' });
  const [adminTouched, setAdminTouched] = useState({});
  const [org, setOrg] = useState({ name: '', url: `https://${state.tenant.domain}`, tz: 'Asia/Shanghai', lang: 'zh-CN' });
  const [orgTouched, setOrgTouched] = useState({});
  const [svc, setSvc] = useState(() => ({
    smtp: { mode: 'skip', draft: sysServiceDraft('smtp', {}), test: null, touched: {} },
    storage: { mode: 'skip', draft: sysServiceDraft('storage', {}), test: null, touched: {} },
    registry: { mode: 'official', draft: { url: '' }, test: null, touched: {} },
  }));
  const timer = useRef(null);
  const scroller = useRef(null);
  const patchSvc = (k, patch) => setSvc((cur) => ({ ...cur, [k]: { ...cur[k], ...(typeof patch === 'function' ? patch(cur[k]) : patch) } }));
  const runChecks = () => {
    clearInterval(timer.current);
    let i = 0;
    setChecks(SYS_ENV_CHECKS.map((_, k) => (k === 0 ? 'running' : 'pending')));
    timer.current = setInterval(() => {
      i += 1;
      setChecks(SYS_ENV_CHECKS.map((_, k) => (k < i ? 'ok' : k === i ? 'running' : 'pending')));
      if (i >= SYS_ENV_CHECKS.length) clearInterval(timer.current);
    }, 320);
  };
  useEffect(() => { runChecks(); return () => clearInterval(timer.current); }, []);
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = 0; }, [step]);
  const disk = sysDisk(state);
  const envOk = checks.every((c) => c === 'ok');
  const adminErrors = {
    name: !admin.name.trim() ? '请输入姓名' : admin.name.trim().length > 20 ? '姓名不能超过 20 个字' : null,
    email: !admin.email.trim() ? '请输入邮箱' : !ADMIN_EMAIL_RE.test(admin.email.trim()) ? '邮箱格式不正确' : null,
    password: sysPasswordError(admin.password, admin.email, minLength),
    confirm: !admin.confirm ? '请再输入一次密码' : admin.confirm !== admin.password ? '两次输入的密码不一致' : null,
  };
  const orgErrors = {
    name: !org.name.trim() ? '请输入组织名称' : org.name.trim().length > 30 ? '组织名称不能超过 30 个字' : null,
    url: sysUrlError(org.url, { label: '访问地址' }),
  };
  const svcState = (kind) => {
    const x = svc[kind];
    if (x.mode === 'skip') return 'skip';
    const draft = kind === 'registry' ? { mode: x.mode, url: x.draft.url } : x.draft;
    if (Object.values(sysServiceErrors(kind, draft, {})).some(Boolean)) return 'invalid';
    return x.test && x.test.ok && x.test.sig === JSON.stringify(draft) ? 'ok' : 'untested';
  };
  const valid = [
    envOk,
    !Object.values(adminErrors).some(Boolean),
    !Object.values(orgErrors).some(Boolean),
    ['smtp', 'storage', 'registry'].every((k) => ['ok', 'skip'].includes(svcState(k))),
    true,
  ];
  const next = () => {
    if (!valid[step]) { setTried({ ...tried, [step]: true }); return; }
    setStep(step + 1);
    setReached(Math.max(reached, step + 1));
  };
  const jump = (i) => {
    if (i > reached) return;
    const bad = valid.slice(0, i).findIndex((v) => !v);
    if (bad >= 0) { setStep(bad); setTried({ ...tried, [bad]: true }); return; }
    setStep(i);
  };
  const finish = () => {
    navigate('/');
    toast.info('安装向导回放结束，没有修改任何数据');
  };
  const showAdmin = (k) => (adminTouched[k] || tried[1] ? adminErrors[k] : null);
  const showOrg = (k) => (orgTouched[k] || tried[2] ? orgErrors[k] : null);
  const setA = (k, v) => { setAdmin({ ...admin, [k]: v }); setAdminTouched({ ...adminTouched, [k]: true }); };
  const setO = (k, v) => { setOrg({ ...org, [k]: v }); setOrgTouched({ ...orgTouched, [k]: true }); };
  const meta = SYS_SETUP_STEPS[step];
  const skipped = ['smtp', 'storage', 'registry'].filter((k) => svc[k].mode === 'skip');
  const blockHint = tried[step] && !valid[step] ? ['环境检查还没有完成', '先修正标红的字段', '先修正标红的字段', '每个服务需要测试通过，或者选择跳过', ''][step] : null;
  return html`<div className="sys-setup" ref=${scroller}>
    <header className="sys-setup-top">
      <span className="sys-setup-logo"><img src=${appearance.logo || 'assets/logo.svg'} alt="" /></span>
      <b>${appearance.productName}</b>
      <span className="sys-setup-sep" />
      <span className="muted">安装向导</span>
      <span className="spacer" />
      <${Button} size="sm" variant="ghost" icon="LogOut" onClick=${() => navigate('/')}>退出回放<//>
    </header>
    <main className="sys-setup-main">
      <div className="sys-setup-banner"><${Alert} tone="info" icon="History" title="这是安装流程的回放">平台已在 ${fmt.date(sys.setup.completedAt || sys.installedAt)} 完成安装。这里填写的内容不会保存：完成向导不会创建账号，也不会覆盖现有的数据和配置。<//></div>
      <div className="sys-setup-steps"><${Steps} current=${step} items=${SYS_SETUP_STEPS.map((s) => ({ title: s.title }))} onChange=${jump} /></div>
      <section className="sys-setup-card">
        <div className="sys-setup-head"><h1 className="sys-setup-title">${meta.heading}</h1><p className="muted">${meta.desc}</p></div>
        <div className="sys-setup-body">
          ${step === 0 && html`<${SysSetupEnv} checks=${checks} onRecheck=${runChecks} free=${disk.free} />`}
          ${step === 1 && html`<${SysSetupAdmin} admin=${admin} set=${setA} show=${showAdmin} minLength=${minLength} onBlur=${(k) => setAdminTouched({ ...adminTouched, [k]: true })} />`}
          ${step === 2 && html`<div className="sys-setup-form">
            <${Field} label="组织名称" required error=${showOrg('name')} hint="显示在登录页和邮件里"><${CharInput} value=${org.name} onChange=${(v) => setO('name', v)} max=${30} placeholder="例如：星河科技" invalid=${Boolean(showOrg('name'))} autoFocus /><//>
            <${Field} label="访问地址" required error=${showOrg('url')} hint=${!orgErrors.url && org.url.trim().startsWith('http://') ? '使用 http 时，浏览器会拦截部分登录回调，建议配置 HTTPS' : '成员访问平台、OAuth 回调和邮件里的链接都用这个地址。已按你现在访问的地址填好'}><${Input} value=${org.url} onChange=${(v) => setO('url', v.trim())} placeholder="https://ipaas.example.com" invalid=${Boolean(showOrg('url'))} /><//>
            <div className="form-grid">
              <${Field} label="时区" hint="定时触发器和日志时间按这个时区计算"><${Select} value=${org.tz} onChange=${(v) => setO('tz', v)} options=${SYS_TIMEZONES} /><//>
              <${Field} label="默认语言" hint="新成员的界面语言，成员可以在个人设置里修改"><${Select} value=${org.lang} onChange=${(v) => setO('lang', v)} options=${SYS_LANGS} /><//>
            </div>
          </div>`}
          ${step === 3 && html`<div className="col sys-svc-list">${['smtp', 'storage', 'registry'].map((k) => html`<${SysSetupService} key=${k} kind=${k} value=${svc[k]} tried=${Boolean(tried[3])} to=${admin.email.trim()} onPatch=${(patch) => patchSvc(k, patch)} />`)}</div>`}
          ${step === 4 && html`<${SysSetupDone} admin=${admin} org=${org} svc=${svc} skipped=${skipped} />`}
        </div>
        <footer className="sys-setup-foot">
          ${step > 0 && html`<${Button} icon="ArrowLeft" onClick=${() => setStep(step - 1)}>上一步<//>`}
          <span className="spacer" />
          ${blockHint && html`<span className="text-xs sys-setup-block">${blockHint}</span>`}
          ${step < 4
            ? html`<${Button} variant="primary" iconRight="ArrowRight" onClick=${next}>${step === 3 && skipped.length === 3 ? '全部跳过，下一步' : '下一步'}<//>`
            : html`<${Button} variant="primary" iconRight="ArrowRight" onClick=${finish}>进入控制台<//>`}
        </footer>
      </section>
    </main>
  </div>`;
}

function SysSetupEnv({ checks, onRecheck, free }) {
  const done = checks.every((c) => c === 'ok');
  const cmd = `docker compose cp app:${SYS_KEY_PATH} ./master.key`;
  return html`<div>
    <div className="col sys-env-list">
      ${SYS_ENV_CHECKS.map((c, i) => html`<div key=${c.key} className="sys-env-row">
        <${KindTile} icon=${c.icon} size=${36} />
        <div className="grow">
          <div className="row"><b>${c.name}</b><span className="text-xs muted">${c.key === 'files' ? `${c.detail} · 剩余 ${sysGb(free)} GB` : c.detail}</span></div>
          <div className="text-xs muted sys-env-meaning">${c.meaning}</div>
        </div>
        ${checks[i] === 'ok' ? html`<${Tag} tone="success" icon="CircleCheck">正常<//>` : checks[i] === 'running' ? html`<span className="sys-env-status"><${Icon} name="LoaderCircle" size=${14} className="spin" />检查中</span>` : html`<span className="sys-env-status">等待</span>`}
      </div>`)}
    </div>
    ${done && html`<div className="sys-key-box">
      <div className="row"><${Icon} name="KeyRound" size=${16} /><b>现在就备份加密密钥</b></div>
      <div className="text-xs muted sys-key-text">密钥文件在应用容器的 <span className="mono">${SYS_KEY_PATH}</span>，数据库备份里不包含它。在服务器上执行下面的命令把它复制出来，保存到密码管理器或离线介质，不要和数据库备份放在一起。也可以设置环境变量 <span className="mono">FEMA_ENCRYPTION_KEY</span> 改用你自己管理的密钥。</div>
      <${SysCmd} code=${cmd} />
    </div>`}
    <div className="row sys-env-foot">
      <span className="text-xs muted">${done ? '全部检查通过' : '正在检查…'}</span>
      <span className="spacer" />
      <${Button} size="sm" icon="RefreshCw" disabled=${!done} onClick=${onRecheck}>重新检查<//>
    </div>
  </div>`;
}

function SysSetupAdmin({ admin, set, show, minLength, onBlur }) {
  const score = sysPasswordScore(admin.password);
  const level = !admin.password ? null : score <= 2 ? ['弱', 'danger', 1] : score === 3 ? ['一般', 'warning', 2] : ['强', 'success', 3];
  const local = admin.email.split('@')[0].toLowerCase();
  const rules = [
    [`至少 ${minLength} 位`, admin.password.length >= minLength],
    ['同时包含字母和数字', /[a-z]/i.test(admin.password) && /\d/.test(admin.password)],
    ['不包含邮箱用户名', Boolean(admin.password) && !(local.length >= 3 && admin.password.toLowerCase().includes(local))],
  ];
  return html`<div className="sys-setup-form">
    <div className="form-grid">
      <${Field} label="姓名" required error=${show('name')}><${Input} value=${admin.name} onChange=${(v) => set('name', v)} onBlur=${() => onBlur('name')} placeholder="例如：林晓" invalid=${Boolean(show('name'))} autoFocus /><//>
      <${Field} label="邮箱" required error=${show('email')} hint="用来登录和接收系统通知"><${Input} value=${admin.email} onChange=${(v) => set('email', v.trim())} onBlur=${() => onBlur('email')} placeholder="admin@example.com" invalid=${Boolean(show('email'))} /><//>
      <${Field} label="密码" required error=${show('password')}>
        <${Input} type="password" value=${admin.password} onChange=${(v) => set('password', v)} onBlur=${() => onBlur('password')} invalid=${Boolean(show('password'))} />
        <div className="sys-pw">
          <div className="sys-pw-bars">${[1, 2, 3].map((n) => html`<span key=${n} className=${cx('sys-pw-bar', level && n <= level[2] && `is-${level[1]}`)} />`)}</div>
          <span className="text-xs muted">${level ? `强度：${level[0]}` : '强度'}</span>
        </div>
        <div className="sys-pw-rules">${rules.map(([label, ok]) => html`<span key=${label} className=${cx('sys-pw-rule', ok && 'is-ok')}><${Icon} name=${ok ? 'CircleCheck' : 'Circle'} size=${13} />${label}</span>`)}</div>
      <//>
      <${Field} label="确认密码" required error=${show('confirm')}><${Input} type="password" value=${admin.confirm} onChange=${(v) => set('confirm', v)} onBlur=${() => onBlur('confirm')} invalid=${Boolean(show('confirm'))} /><//>
    </div>
  </div>`;
}

function SysSetupDone({ admin, org, svc, skipped }) {
  const tz = SYS_TIMEZONES.find((t) => t.value === org.tz);
  const lang = SYS_LANGS.find((l) => l.value === org.lang);
  const svcText = (k) => {
    if (svc[k].mode === 'skip') return html`<span className="muted">已跳过</span>`;
    if (k === 'smtp') return `${svc.smtp.draft.host}:${svc.smtp.draft.port}`;
    if (k === 'storage') return `${svc.storage.draft.bucket} · ${svc.storage.draft.endpoint}`;
    return svc.registry.mode === 'mirror' ? `自建镜像 ${svc.registry.draft.url}` : '官方仓库';
  };
  const nextSteps = [
    { key: 'invite', icon: 'UserPlus', title: '邀请成员', desc: '添加成员并分配功能模块权限', to: '/admin/users' },
    { key: 'sso', icon: 'LogIn', title: '配置登录方式', desc: '接入 OIDC、SAML、飞书、企业微信或钉钉', to: '/admin/sso' },
    { key: 'backup', icon: 'DatabaseBackup', title: '设置备份计划', desc: '默认每天 02:00 备份到本地目录', to: '/admin/backup' },
    { key: 'workflow', icon: 'Workflow', title: '创建第一个工作流', desc: '在项目里从模板开始，或者用一句话让 AI 生成', to: '/integration' },
  ];
  return html`<div>
    <div className="sys-done-grid">
      <div className="kv">
        <div><span>管理员</span><span>${admin.name.trim()}（${admin.email.trim()}）</span></div>
        <div><span>组织</span><span>${org.name.trim()}</span></div>
        <div><span>访问地址</span><span className="mono">${org.url.trim()}</span></div>
        <div><span>时区和语言</span><span>${tz ? tz.label : org.tz} · ${lang ? lang.label : org.lang}</span></div>
      </div>
      <div className="kv">
        ${['smtp', 'storage', 'registry'].map((k) => html`<div key=${k}><span>${SYS_SERVICE_META[k].name}</span><span>${svcText(k)}</span></div>`)}
        <div><span>加密密钥</span><span className="mono">${SYS_KEY_PATH}</span></div>
      </div>
    </div>
    ${skipped.length > 0 && html`<div className="sys-done-skip"><${Alert} tone="warning" title=${`跳过了 ${skipped.length} 个可选服务`} action=${html`<${Button} size="sm" onClick=${() => navigate('/admin/system?tab=services')}>去管理后台配置<//>`}>${skipped.map((k) => SYS_SERVICE_META[k].name).join('、')}相关的功能会显示为未启用，不会报错。<//></div>`}
    <div className="sys-subhead">接下来</div>
    <div className="sys-next-grid">
      ${nextSteps.map((n) => html`<button key=${n.key} type="button" className="sys-next-card" onClick=${() => navigate(n.to)}>
        <span className="sys-next-icon"><${Icon} name=${n.icon} size=${18} /></span>
        <span className="grow"><span className="sys-next-title">${n.title}</span><span className="sys-next-desc">${n.desc}</span></span>
        <${Icon} name="ChevronRight" size=${16} className="muted" />
      </button>`)}
    </div>
  </div>`;
}

function SysBackupNowModal({ onClose, presetNote = '' }) {
  const state = useStore();
  const sys = sysOf(state);
  const [note, setNote] = useState(presetNote);
  const disk = sysDisk(state);
  const last = sysLatestBackup(sys);
  const estimate = ((last ? last.size : 400) + 3) / 1024;
  const target = sys.backupPolicy.target === 's3' && sys.backupPolicy.s3.configured ? 's3' : 'local';
  const blocked = target === 'local' && disk.free < estimate + 1 ? `数据目录只剩 ${sysGb(disk.free)} GB，空间不足` : null;
  const start = () => {
    if (!sysStartBackup(note.trim())) { toast.error('已经有任务在进行，稍后再试'); return; }
    onClose();
    toast.info('开始备份，可以离开这个页面');
  };
  return html`<${Modal} open=${true} onClose=${onClose} title="立即备份" width=${480} footer=${html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" icon="DatabaseBackup" disabled=${Boolean(blocked)} onClick=${start}>开始备份<//><//>`}>
    <div className="kv sys-modal-kv">
      <div><span>备份内容</span><span>数据库和上传的文件，不包含加密密钥</span></div>
      <div><span>写入位置</span><span>${target === 's3' ? `S3 兼容存储 · ${sys.backupPolicy.s3.bucket}` : html`<${Fragment}>本地目录 <span className="mono">${sys.backupPolicy.path}</span><//>`}</span></div>
      <div><span>预计大小</span><span>约 ${Math.round(estimate * 1024)} MB，1 到 2 分钟完成</span></div>
    </div>
    <${Field} label="备注" hint="写明为什么备份，方便以后恢复时辨认" error=${blocked}><${CharInput} value=${note} onChange=${setNote} max=${40} placeholder="例如：升级到 1.9.0 前" /><//>
  <//>`;
}

function AdminSystem() {
  const route = useRoute();
  const [diag, setDiag] = useState(false);
  const tab = route.query.tab === 'services' ? 'services' : 'upgrade';
  return html`<div className="page"><div className="page-inner">
    <${PageHeader}
      title="系统与升级"
      description="查看版本、检查更新，按步骤完成升级。升级由运维在服务器上执行，界面不会自动重启服务。"
      actions=${html`<${Button} icon="FileDown" onClick=${() => setDiag(true)}>下载诊断包<//>`}
      tabs=${html`<${Tabs} value=${tab} onChange=${(v) => navigate(v === 'services' ? '/admin/system?tab=services' : '/admin/system', { replace: true })} items=${[{ value: 'upgrade', label: '版本与升级' }, { value: 'services', label: '可选服务' }]} />`}
    />
    <div className="sys-tab-body">${tab === 'upgrade' ? html`<${SysUpgradeTab} />` : html`<${SysServicesTab} />`}</div>
    ${diag && html`<${SysDiagnosticsModal} onClose=${() => setDiag(false)} />`}
  </div></div>`;
}

function SysUpgradeTab() {
  const state = useStore();
  const job = useSysJob();
  const sys = sysOf(state);
  const [checking, setChecking] = useState(false);
  const [backupModal, setBackupModal] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const u = sys.update;
  const view = sysUpdateView(sys);
  const release = view.release;
  const check = (channel) => {
    setChecking(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setChecking(false);
      const cur = sysOf(Store.get());
      const ch = channel || cur.update.channel;
      if (cur.update.offline) {
        sysSet((x) => ({ ...x, update: { ...x.update, lastError: { at: Date.now(), channel: ch } } }));
        toast.error('无法连接更新服务器');
        return;
      }
      const now = Date.now();
      const found = ch === 'preview' ? (cur.update.previewAvailable || sysPreviewRelease()) : cur.update.available;
      sysSet((x) => ({ ...x, update: { ...x.update, lastError: null, ...(ch === 'preview' ? { previewCheckedAt: now, previewAvailable: found } : { checkedAt: now }) } }));
      if (found && sysCmp(found.version, cur.version) > 0) toast.info(`发现新版本 ${found.version}`);
      else toast.success('已是最新版本');
    }, 1100);
  };
  const setChannel = (ch) => {
    if (ch === u.channel) return;
    sysSet((x) => ({ ...x, update: { ...x.update, channel: ch } }));
    addAudit('切换更新通道', ch === 'preview' ? '预览版' : '稳定版');
    check(ch);
  };
  const setOffline = (v) => sysSet((x) => ({ ...x, update: { ...x.update, offline: v } }));
  const acked = Boolean(release && u.ack && u.ack.version === release.version);
  const ack = (v) => {
    sysSet((x) => ({ ...x, update: { ...x.update, ack: v ? { version: release.version, by: Store.get().me, at: Date.now() } : null } }));
    addAudit(v ? '确认破坏性变更' : '撤销破坏性变更确认', `${release.version}：${release.breaking.length} 项`);
  };
  const offlineVersion = release ? release.version : '<版本号>';
  return html`<div className="col sys-stack">
    <${Card} title="当前版本" icon="Server">
      <div className="sys-facts">
        <div><span>版本</span><b className="row-4">${sys.version}<${Tag} size="sm">${u.channel === 'preview' ? '预览版通道' : '稳定版通道'}<//></b></div>
        <div><span>构建日期</span><b>${sys.build || '-'}</b></div>
        <div><span>安装时间</span><b>${fmt.date(sys.installedAt)}（已运行 ${Math.max(0, Math.floor((Date.now() - sys.installedAt) / DAY))} 天）</b></div>
        <div><span>实例 ID</span><b className="row-4"><span className="mono sys-ellipsis">${sysInstanceId(state)}</span><${CopyButton} text=${sysInstanceId(state)} /></b></div>
        <div><span>数据库</span><b>PostgreSQL 16.4 · Redis 7.2</b></div>
        <div><span>工作节点</span><b>${state.workers.filter((w) => w.status === 'online').length} 个在线 / 共 ${state.workers.length} 个 · <${Link} to="/admin/workers" className="link">查看<//></b></div>
      </div>
    <//>
    <${Card} title="检查更新" icon="RefreshCw" extra=${html`<${Segmented} size="sm" value=${u.channel} onChange=${setChannel} options=${[{ value: 'stable', label: '稳定版' }, { value: 'preview', label: '预览版' }]} />`}>
      <div className="row sys-check-line">
        <${SysLevelIcon} level=${checking ? 'running' : view.failed ? 'error' : release ? 'info' : view.checkedAt ? 'ok' : 'pending'} />
        <div className="grow">
          <b>${checking ? '正在检查…' : view.failed ? '无法连接更新服务器' : release ? `有新版本 ${release.version}` : view.checkedAt ? '已是最新版本' : '还没有检查过这个通道'}</b>
          <div className="text-xs muted">${view.checkedAt ? `上次成功检查：${fmt.relative(view.checkedAt)}（${sysStamp(view.checkedAt)}）` : '还没有成功检查过'}${u.lastError && view.failed ? ` · 最近一次失败：${sysStamp(u.lastError.at)}` : ''}</div>
        </div>
        <${Button} icon="RefreshCw" loading=${checking} onClick=${() => check()}>检查更新<//>
      </div>
      ${view.failed && html`<div className="sys-offline"><${Alert} tone="danger" title="无法连接更新服务器">
        服务器访问不了外网，或者需要通过代理访问。可以在部署目录的 <span className="mono">.env</span> 中设置 <span className="mono">HTTPS_PROXY</span> 后重启服务；隔离网络里用离线升级包升级：
        <ol className="sys-offline-steps">
          <li>在能访问外网的电脑上，从发布页面下载 <span className="mono">fema-${offlineVersion}-offline.tar.gz</span> 和同名的 <span className="mono">.sha256</span> 校验文件。离线包包含应用、工作节点和数据库迁移需要的全部镜像。</li>
          <li>把两个文件拷贝到服务器的部署目录，校验后导入镜像，然后按下面的升级步骤继续，跳过「拉取新镜像」。</li>
        </ol>
        <${SysCmd} code=${`sha256sum -c fema-${offlineVersion}-offline.tar.gz.sha256\ndocker load -i fema-${offlineVersion}-offline.tar.gz`} />
      <//></div>`}
      ${u.channel === 'preview' && html`<div className="sys-note"><${Alert} tone="warning">预览版用于提前验证新功能，可能包含未完成的改动，不建议在生产环境使用。<//></div>`}
      ${release && html`<${SysRelease} release=${release} acked=${acked} ack=${u.ack} onAck=${ack} />`}
      <div className="sys-demo">
        <${Switch} size="sm" checked=${u.offline} onChange=${setOffline} />
        <span className="grow"><b>演示：模拟服务器无法访问外网</b><span className="text-xs muted">打开后，检查更新、连接官方连接器仓库和公网邮件服务都会失败，用来查看隔离网络下的提示。</span></span>
      </div>
    <//>
    ${release && html`<${SysPrecheck} release=${release} acked=${acked} job=${job} onBackup=${() => setBackupModal(true)} />`}
    ${release && html`<${SysGuide} release=${release} />`}
    ${release && html`<${SysVerify} release=${release} />`}
    ${release && html`<${SysRollback} release=${release} />`}
    ${!release && !view.failed && view.checkedAt && html`<${Empty} size="sm" icon="PackageCheck" title="不需要升级" description="当前通道没有更新的版本。每天会自动检查一次，有新版本时这里会给出升级步骤。" />`}
    ${backupModal && html`<${SysBackupNowModal} presetNote=${release ? `升级到 ${release.version} 前` : ''} onClose=${() => setBackupModal(false)} />`}
  </div>`;
}

function SysRelease({ release, acked, ack, onAck }) {
  return html`<div className="sys-release">
    <div className="row sys-release-head">
      <span className="sys-release-ver">${release.version}</span>
      <${Tag} size="sm" tone=${release.preview ? 'warning' : 'primary'}>${release.preview ? '预览版' : '稳定版'}<//>
      <span className="text-xs muted">发布于 ${fmt.date(release.releasedAt)}（${fmt.relative(release.releasedAt)}）</span>
    </div>
    <div className="sys-release-sec">
      <div className="sys-release-label">主要更新</div>
      <ul className="sys-list">${release.highlights.map((h) => html`<li key=${h}>${h}</li>`)}</ul>
    </div>
    ${release.breaking.length > 0 && html`<div className=${cx('sys-breaking', acked && 'is-acked')}>
      <div className="row"><${Icon} name="TriangleAlert" size=${16} className="sys-breaking-icon" /><b>破坏性变更（${release.breaking.length}）</b><span className="text-xs muted">升级前需要确认并完成调整</span></div>
      <ul className="sys-list">${release.breaking.map((h) => html`<li key=${h}>${h}</li>`)}</ul>
      <div className="row sys-breaking-ack">
        <${Checkbox} checked=${acked} onChange=${onAck} label="我已阅读以上变更，并完成了需要的调整" />
        ${acked && ack && html`<span className="text-xs muted">${personName(ack.by)} · ${fmt.short(ack.at)} 确认</span>`}
      </div>
    </div>`}
    <div className="row text-xs muted sys-release-mig"><${Icon} name="Database" size=${14} />包含 ${release.migrations} 个数据库迁移，新版本启动时自动执行，执行期间服务不可用，通常 1 到 3 分钟。迁移不可逆。</div>
  </div>`;
}

function SysPrecheck({ release, acked, job, onBackup }) {
  const state = useStore();
  const sys = sysOf(state);
  const latest = sysLatestBackup(sys);
  const age = latest ? Date.now() - latest.at : Infinity;
  const disk = sysDisk(state);
  const need = 1.1 + ((latest ? latest.size : 400) / 1024) + 0.5;
  const lagging = state.workers.filter((w) => sysCmp(w.version, sys.version) < 0);
  const backingUp = job && job.kind === 'backup' && !job.done;
  const rows = [
    {
      key: 'backup',
      level: backingUp ? 'running' : !latest ? 'error' : age > 2 * HOUR ? 'warning' : 'ok',
      title: '升级前备份',
      text: backingUp ? `正在备份：${(job.phases[job.phase] || {}).label || '收尾'} ${job.progress}%` : latest ? `最近一次成功备份在 ${fmt.relative(latest.at)}（${sysStamp(latest.at)}）${age > 2 * HOUR ? '。数据库迁移不可逆，建议升级前再备份一次' : '，可以作为回滚点'}` : '还没有成功的备份，升级前必须先备份',
      actions: html`<${Fragment}><${Button} size="sm" icon="DatabaseBackup" disabled=${Boolean(backingUp)} onClick=${onBackup}>立即备份<//><${Button} size="sm" variant="ghost" onClick=${() => navigate('/admin/backup')}>备份与恢复<//><//>`,
    },
    { key: 'disk', level: disk.free >= need ? 'ok' : 'error', title: '磁盘空间', text: `数据目录剩余 ${sysGb(disk.free)} GB，升级需要约 ${sysGb(need)} GB（新镜像、升级前备份和迁移临时文件）` },
    {
      key: 'workers',
      level: lagging.length ? 'warning' : 'info',
      title: '工作节点版本',
      text: lagging.length ? `${lagging.map((w) => `${w.host} 是 ${w.version}${w.status === 'offline' ? '（离线）' : ''}`).join('、')}，落后于当前版本。升级时需要把全部 ${state.workers.length} 个工作节点一起升级到 ${release.version}，版本不一致的节点不会领取任务` : `升级时需要把全部 ${state.workers.length} 个工作节点一起升级到 ${release.version}，版本不一致的节点不会领取任务`,
      actions: html`<${Button} size="sm" variant="ghost" onClick=${() => navigate('/admin/workers')}>工作节点<//>`,
    },
    { key: 'breaking', level: !release.breaking.length || acked ? 'ok' : 'error', title: '破坏性变更', text: !release.breaking.length ? '这个版本没有破坏性变更' : acked ? `已确认 ${release.breaking.length} 项破坏性变更` : `有 ${release.breaking.length} 项破坏性变更还没有确认，见上方版本说明` },
  ];
  const todo = rows.filter((r) => ['error', 'warning'].includes(r.level)).length;
  return html`<${Card} title=${html`<span className="row"><span className="sys-stepno">1</span>升级前检查</span>`} extra=${todo ? html`<${Tag} tone="warning">${todo} 项需要处理<//>` : html`<${Tag} tone="success" icon="CircleCheck">可以升级<//>`}>
    <div className="col sys-rows">
      ${rows.map((r) => html`<div key=${r.key} className="sys-row">
        <${SysLevelIcon} level=${r.level} />
        <div className="grow"><b>${r.title}</b><div className="text-xs muted">${r.text}</div></div>
        ${r.actions && html`<div className="row sys-row-actions">${r.actions}</div>`}
      </div>`)}
    </div>
  <//>`;
}

function sysGuideSteps(kind, release, state) {
  const sys = sysOf(state);
  const v = release.version;
  const offline = sys.update.offline;
  const api = `https://${state.tenant.domain}`;
  const renames = release.breaking.map((t) => /(FEMA_[A-Z0-9_]+)\s*(?:更名为|改用)\s*(FEMA_[A-Z0-9_]+)/.exec(t) || /(FEMA_[A-Z0-9_]+).*改用\s*(FEMA_[A-Z0-9_]+)/.exec(t)).filter(Boolean);
  const other = release.breaking.filter((t) => !/FEMA_[A-Z0-9_]+.*(?:更名为|改用)\s*FEMA_/.test(t));
  const workerEnv = renames.length ? renames[renames.length - 1][2] : 'FEMA_WORKER_TOKEN';
  const n = state.workers.length;
  if (kind === 'compose') {
    return [
      { title: '进入部署目录，修改版本号', cmd: `cd /opt/fema\nsed -i 's/^FEMA_VERSION=.*/FEMA_VERSION=${v}/' .env` },
      ...renames.map(([, from, to]) => ({ title: `按破坏性变更修改环境变量：${from} 改为 ${to}`, cmd: `sed -i 's/^${from}=/${to}=/' .env` })),
      ...other.map((t) => ({ title: '处理破坏性变更', desc: t })),
      offline
        ? { title: '导入离线镜像', desc: '服务器不能访问外网，用离线升级包代替拉取镜像', cmd: `docker load -i fema-${v}-offline.tar.gz` }
        : { title: '拉取新镜像', cmd: 'docker compose pull' },
      { title: '重启服务', desc: `启动时自动执行 ${release.migrations} 个数据库迁移，期间服务不可用`, cmd: 'docker compose up -d' },
      { title: '确认迁移完成', desc: '看到全部迁移完成的日志后再继续', cmd: 'docker compose logs app | grep -i migration' },
      { title: `升级工作节点（${n} 个）`, desc: '在每台工作节点服务器上用新镜像重新创建容器，其他参数保持不变', cmd: `docker pull fema/worker:${v}\ndocker rm -f <节点名称>\ndocker run -d --name <节点名称> \\\n  -e FEMA_API_URL=${api} \\\n  -e ${workerEnv}=<原来的令牌> \\\n  fema/worker:${v}` },
    ];
  }
  return [
    { title: '更新 Chart 仓库', cmd: offline ? `helm pull fema/fema --version ${v}` : 'helm repo update', desc: offline ? '在能访问外网的电脑上下载 Chart，连同离线镜像一起拷贝进内网，镜像推送到内网镜像仓库' : null },
    ...renames.map(([, from, to]) => ({ title: `按破坏性变更修改 values.yaml：${from} 改为 ${to}`, desc: `在 values.yaml 的 env 和 worker.env 里把 ${from} 改名为 ${to}` })),
    ...other.map((t) => ({ title: '处理破坏性变更', desc: t })),
    { title: '升级 Release', desc: `Chart 会先执行 ${release.migrations} 个数据库迁移，再滚动更新应用和工作节点`, cmd: offline ? `helm upgrade fema ./fema-${v}.tgz -n fema \\\n  --reuse-values --set image.registry=<内网镜像仓库> \\\n  --wait --timeout 10m` : `helm upgrade fema fema/fema -n fema --version ${v} \\\n  --reuse-values --wait --timeout 10m` },
    { title: '确认滚动更新完成', cmd: 'kubectl -n fema rollout status deploy/fema-app\nkubectl -n fema rollout status deploy/fema-worker' },
    { title: '确认迁移完成', cmd: 'kubectl -n fema logs job/fema-migrate' },
    { title: '升级集群外的工作节点', desc: `部署在 Kubernetes 之外的工作节点（例如内网节点）需要手动升级到 fema/worker:${v}` },
  ];
}

function SysGuide({ release }) {
  const state = useStore();
  const [kind, setKind] = useState('compose');
  const steps = sysGuideSteps(kind, release, state);
  return html`<${Card} title=${html`<span className="row"><span className="sys-stepno">2</span>执行升级</span>`} subtitle="在服务器上按顺序执行，每一步都可以复制">
    <${Tabs} value=${kind} onChange=${setKind} items=${[{ value: 'compose', label: 'Docker Compose', icon: 'Container' }, { value: 'helm', label: 'Kubernetes（Helm）', icon: 'Boxes' }]} />
    <ol className="sys-guide">
      ${steps.map((s, i) => html`<li key=${`${kind}-${i}`} className="sys-guide-step">
        <span className="sys-guide-no">${i + 1}</span>
        <div className="grow">
          <b>${s.title}</b>
          ${s.desc && html`<div className="text-xs muted sys-guide-desc">${s.desc}</div>`}
          ${s.cmd && html`<${SysCmd} code=${s.cmd} />`}
        </div>
      </li>`)}
    </ol>
  <//>`;
}

function SysVerify({ release }) {
  const state = useStore();
  const sys = sysOf(state);
  const [done, setDone] = useState([]);
  const items = [
    { key: 'version', text: `本页「当前版本」显示 ${release.version}`, auto: sys.version === release.version },
    { key: 'migrations', text: `服务日志里 ${release.migrations} 个数据库迁移都显示完成` },
    { key: 'health', text: '健康状态没有异常项', to: '/admin/health' },
    { key: 'workers', text: `全部工作节点在线，版本是 ${release.version}`, to: '/admin/workers' },
    { key: 'runs', text: '手动运行一个核心工作流，在运行日志里确认结果正常', to: '/logs' },
    { key: 'login', text: '用其他账号在无痕窗口登录一次，确认登录方式正常' },
  ];
  const checked = (it) => it.auto || done.includes(it.key);
  const count = items.filter(checked).length;
  return html`<${Card} title=${html`<span className="row"><span className="sys-stepno">3</span>升级后验证</span>`} extra=${html`<span className="text-xs muted">已完成 ${count}/${items.length}</span>`}>
    <div className="col sys-verify">
      ${items.map((it) => html`<div key=${it.key} className="row sys-verify-row">
        <${Checkbox} checked=${checked(it)} disabled=${it.auto} onChange=${(v) => setDone(v ? [...done, it.key] : done.filter((k) => k !== it.key))} label=${it.text} />
        ${it.to && html`<${Link} to=${it.to} className="link text-xs">打开<//>`}
      </div>`)}
    </div>
  <//>`;
}

function SysRollback({ release }) {
  const state = useStore();
  const sys = sysOf(state);
  const marked = sys.backups.filter((b) => b.status === 'success' && b.note && b.note.includes(`升级到 ${release.version}`)).sort((a, b) => b.at - a.at)[0];
  const point = marked || sysLatestBackup(sys);
  return html`<${Card} title=${html`<span className="row"><${Icon} name="Undo2" size=${16} />回滚预案</span>`} subtitle="升级后出现问题时怎么退回">
    <div className="text-xs muted sys-rollback-text">数据库迁移不可逆，回滚不能只换回旧镜像，需要恢复升级前的备份：</div>
    <ol className="sys-rollback">
      <li>停止服务：<span className="mono">docker compose down</span></li>
      <li>把 <span className="mono">.env</span> 里的 <span className="mono">FEMA_VERSION</span> 改回 ${sys.version}${release.breaking.length ? '，并撤销为破坏性变更做的配置修改' : ''}</li>
      <li>在「备份与恢复」中恢复升级前的备份${marked ? `（${sysStamp(marked.at)} · ${marked.note}）` : point ? `。目前最近的一次在 ${sysStamp(point.at)}，升级前建议再备份一次` : ''}</li>
      <li>启动服务：<span className="mono">docker compose up -d</span>，工作节点也换回 ${sys.version} 的镜像</li>
    </ol>
    <div className="row sys-rollback-actions">
      <${Button} size="sm" icon="History" onClick=${() => navigate('/admin/backup')}>查看备份<//>
      ${!point && html`<span className="text-xs sys-warn-text">还没有可以用来回滚的备份</span>`}
    </div>
  <//>`;
}

function SysServicesTab() {
  const state = useStore();
  const [drawer, setDrawer] = useState(null);
  const sys = sysOf(state);
  const emailChannels = (state.channels || []).filter((c) => c.type === 'email');
  const tones = { ok: ['success', '已启用'], off: ['outline', '未配置'], error: ['danger', '无法连接'] };
  const disable = async (kind) => {
    const meta = SYS_SERVICE_META[kind];
    const content = kind === 'smtp'
      ? `停用后，${emailChannels.length ? `${emailChannels.length} 个邮件通知渠道会变为不可用，` : ''}成员邀请和找回密码邮件不会再发送。`
      : '停用后，只能使用镜像内置的连接器，不能在线安装和更新连接器。已安装的连接器不受影响。';
    if (!(await confirmDialog({ title: `停用${meta.name}？`, content, okText: '停用', danger: true }))) return;
    if (kind === 'smtp') {
      Store.set((s) => ({ ...s, system: sysWithService(s, 'smtp', { ...sysOf(s).services.smtp, configured: false }), channels: (s.channels || []).map((c) => (c.type === 'email' ? { ...c, status: 'unavailable' } : c)) }));
    } else {
      sysSet((x) => ({ ...x, services: { ...x.services, registry: { ...x.services.registry, mode: 'off' } } }));
    }
    addAudit('停用服务', meta.name);
    toast.success(`已停用${meta.name}`);
  };
  const usage = {
    smtp: `${sys.services.smtp.configured ? '用于' : '配置后可用于'}：${emailChannels.length ? `邮件通知渠道${emailChannels.map((c) => `「${c.name}」`).join('')}、` : ''}成员邀请邮件、找回密码邮件`,
    storage: sys.services.storage.configured ? '新上传的文件写入对象存储，已有的本地文件不会自动迁移' : '单实例部署可以不配置；部署多个应用实例时需要共享的对象存储',
    registry: sys.services.registry.mode === 'off' ? `可以使用镜像内置的 ${CONNECTORS.filter((c) => !c.builtin).length} 个连接器` : '每天检查一次连接器更新，有新版本时在连接器市场提示',
  };
  return html`<div className="col sys-stack">
    ${['smtp', 'storage', 'registry'].map((k) => {
      const st = sysServiceStatus(k, state);
      const meta = SYS_SERVICE_META[k];
      const configured = k === 'registry' ? sys.services.registry.mode !== 'off' : sys.services[k].configured;
      return html`<div key=${k} className="card sys-svc-row">
        <${KindTile} icon=${meta.icon} size=${36} />
        <div className="grow">
          <div className="row"><b>${meta.name}</b><${Tag} size="sm" tone=${tones[st][0]}>${tones[st][1]}<//></div>
          <div className="text-xs sys-svc-summary">${sysServiceSummary(k, state)}</div>
          <div className="text-xs muted">${usage[k]}</div>
        </div>
        ${configured && k !== 'storage' && html`<${Button} size="sm" variant="ghost" onClick=${() => disable(k)}>停用<//>`}
        <${Button} size="sm" variant=${configured ? 'outline' : 'primary'} onClick=${() => setDrawer(k)}>${configured ? '修改配置' : '去配置'}<//>
      </div>`;
    })}
    <div className="text-xs muted">也可以用环境变量配置这些服务（例如 <span className="mono">FEMA_SMTP_HOST</span>），环境变量优先于这里的配置。</div>
    ${drawer && html`<${SysServiceDrawer} key=${drawer} kind=${drawer} onClose=${() => setDrawer(null)} />`}
  </div>`;
}

function SysServiceDrawer({ kind, onClose }) {
  const state = useStore();
  const sys = sysOf(state);
  const saved = sys.services[kind];
  const meta = SYS_SERVICE_META[kind];
  const initial = sysServiceDraft(kind, saved);
  const [draft, setDraft] = useState(initial);
  const [touched, setTouched] = useState({});
  const [test, setTest] = useState(null);
  const savedForErrors = kind === 'registry' ? {} : saved;
  const errors = sysServiceErrors(kind, draft, savedForErrors);
  const valid = !Object.values(errors).some(Boolean);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial) || (kind === 'registry' && saved.mode === 'off');
  const tested = Boolean(test && test.ok && test.sig === JSON.stringify(draft));
  const show = (k) => (touched[k] || (kind !== 'registry' && saved.configured) ? errors[k] : null);
  const change = (next, key) => { setDraft(next); setTouched({ ...touched, [key]: true }); };
  const save = () => {
    const now = Date.now();
    const me = Store.get().me;
    if (kind === 'smtp') {
      const next = { configured: true, host: draft.host.trim(), port: draft.port, security: draft.security, user: draft.user.trim(), from: draft.from.trim(), fromName: draft.fromName.trim(), hasPassword: Boolean(saved.hasPassword || draft.password), testedAt: test.at, updatedAt: now, updatedBy: me };
      Store.set((s) => ({ ...s, system: sysWithService(s, 'smtp', next), channels: (s.channels || []).map((c) => (c.type === 'email' ? { ...c, status: 'active' } : c)) }));
      addAudit(saved.configured ? '修改邮件服务' : '配置邮件服务', `${next.host}:${next.port}`);
      toast.success(saved.configured ? '已保存邮件服务配置' : '邮件服务已启用，邮件通知和邀请邮件现在可以使用');
    } else if (kind === 'storage') {
      const next = { configured: true, endpoint: draft.endpoint.trim(), region: draft.region.trim(), bucket: draft.bucket.trim(), accessKey: draft.accessKey.trim(), pathStyle: draft.pathStyle, hasSecret: Boolean(saved.hasSecret || draft.secret), testedAt: test.at, updatedAt: now, updatedBy: me };
      sysSet((x) => ({ ...x, services: { ...x.services, storage: next } }));
      addAudit(saved.configured ? '修改对象存储' : '配置对象存储', `${next.bucket} · ${next.endpoint}`);
      toast.success(saved.configured ? '已保存对象存储配置' : `对象存储已启用，新上传的文件会写入 ${next.bucket}`);
    } else {
      const next = { mode: draft.mode, url: draft.mode === 'mirror' ? draft.url.trim() : '', testedAt: test.at, updatedAt: now, updatedBy: me };
      sysSet((x) => ({ ...x, services: { ...x.services, registry: next } }));
      addAudit('配置连接器仓库', next.mode === 'mirror' ? `自建镜像 ${next.url}` : '官方仓库');
      toast.success('已保存连接器仓库配置');
    }
    onClose();
  };
  return html`<${Drawer} open=${true} onClose=${onClose} title=${`配置${meta.name}`} subtitle=${meta.desc} width=${600} footer=${html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" disabled=${!valid || !tested || !dirty} onClick=${save}>${(kind === 'registry' ? saved.mode !== 'off' : saved.configured) ? '保存' : '保存并启用'}<//><//>`}>
    ${kind === 'registry' && html`<div className="sys-drawer-sec"><${RadioCards} columns=${2} value=${draft.mode} onChange=${(v) => change({ ...draft, mode: v }, 'mode')} options=${[{ value: 'official', label: '官方仓库', icon: 'Globe', desc: '需要服务器能访问外网' }, { value: 'mirror', label: '自建镜像', icon: 'Server', desc: '隔离网络里同步官方仓库的镜像' }]} /></div>`}
    ${kind === 'registry' && draft.mode === 'official'
      ? html`<div className="text-xs muted sys-drawer-sec">仓库地址 <span className="mono">${SYS_REGISTRY_URL}</span></div>`
      : html`<${SysServiceFields} kind=${kind} draft=${draft} onChange=${change} show=${show} saved=${savedForErrors} />`}
    <${SysServiceTest} kind=${kind} draft=${draft} valid=${valid} test=${test} onTest=${setTest} />
    ${kind === 'smtp' && html`<div className="text-xs muted sys-drawer-foot">保存后，类型为邮件的通知渠道会变为可用，邀请成员和找回密码也会发送邮件。</div>`}
    ${kind === 'storage' && html`<div className="text-xs muted sys-drawer-foot">启用后新上传的文件写入对象存储。本地目录 ${SYS_FILES_PATH} 里已有的文件不会自动迁移。</div>`}
  <//>`;
}

function sysDiagnostics(state) {
  const sys = sysOf(state);
  const now = Date.now();
  const recent = state.runs.filter((r) => r.startedAt > now - DAY && r.kind !== 'debug');
  const svc = sys.services;
  const latest = sysLatestBackup(sys);
  const iso = (ts) => (ts ? new Date(ts).toISOString() : null);
  return {
    generatedAt: iso(now),
    instance: { id: sysInstanceId(state), version: sys.version, build: sys.build, installedAt: iso(sys.installedAt), updateChannel: sys.update.channel, updateServerReachable: !sys.update.offline, lastUpdateCheck: iso(sys.update.checkedAt) },
    components: {
      database: { type: 'PostgreSQL', version: '16.4', status: 'ok' },
      queue: { type: 'Redis', version: '7.2', status: 'ok' },
      fileStorage: svc.storage.configured ? { type: 's3', endpoint: svc.storage.endpoint, bucket: svc.storage.bucket, region: svc.storage.region || null } : { type: 'local', path: SYS_FILES_PATH },
      smtp: svc.smtp.configured ? { configured: true, host: svc.smtp.host, port: Number(svc.smtp.port), security: svc.smtp.security } : { configured: false },
      connectorRegistry: { mode: svc.registry.mode, url: svc.registry.mode === 'mirror' ? svc.registry.url : svc.registry.mode === 'official' ? SYS_REGISTRY_URL : null },
    },
    workers: state.workers.map((w) => ({ host: w.host, version: w.version, status: w.status, concurrency: w.concurrency, labels: w.labels, lastHeartbeat: iso(w.heartbeatAt) })),
    backups: {
      policy: { enabled: sys.backupPolicy.enabled, schedule: sysScheduleText(sys.backupPolicy), keep: sys.backupPolicy.keep, target: sys.backupPolicy.target },
      latestSuccess: latest ? iso(latest.at) : null,
      recentFailures: sys.backups.filter((b) => b.status === 'failed' && b.at > now - 7 * DAY).map((b) => ({ at: iso(b.at), error: b.error })),
    },
    usage: {
      projects: state.projects.length,
      workflows: state.workflows.length,
      enabledWorkflows: state.workflows.filter((w) => w.status === 'enabled' && w.published).length,
      activeUsers: state.users.filter((u) => u.status === 'active').length,
      runsLast24h: recent.length,
      failedLast24h: recent.filter((r) => ['failed', 'timeout'].includes(r.status)).length,
    },
    login: { enabledMethods: ['password', 'oidc', 'saml', 'feishu', 'wecom', 'dingtalk'].filter((k) => state.sso[k] && state.sso[k].enabled) },
    client: { userAgent: navigator.userAgent, language: navigator.language, viewport: `${window.innerWidth}x${window.innerHeight}` },
    excluded: ['密码、密钥和访问令牌', '连接里的凭据', '运行数据和日志内容', '成员姓名和邮箱'],
  };
}

function SysDiagnosticsModal({ onClose }) {
  const state = useStore();
  const [data] = useState(() => sysDiagnostics(state));
  const download = () => {
    sysDownload(`diagnostics-${state.tenant.domain}-${fmt.date(Date.now())}.json`, data);
    addAudit('下载诊断包', `${sysOf(state).version} · ${state.workers.length} 个工作节点`);
    toast.success('已下载诊断包，不包含密码、密钥和业务数据');
    onClose();
  };
  return html`<${Modal} open=${true} onClose=${onClose} title="下载诊断包" description="排查部署问题时发给运维或社区" width=${640} footer=${html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" icon="Download" onClick=${download}>下载 JSON<//><//>`}>
    <div className="sys-diag-grid">
      <div><div className="sys-diag-label"><${Icon} name="CircleCheck" size=${14} className="sys-ok-text" />包含</div><ul className="sys-list">
        <li>版本、构建和实例 ID</li><li>数据库、队列、存储、邮件和连接器仓库的状态</li><li>工作节点的版本和心跳</li><li>备份策略和最近的失败</li><li>项目、工作流、成员和运行的数量</li>
      </ul></div>
      <div><div className="sys-diag-label"><${Icon} name="CircleMinus" size=${14} className="muted" />不包含</div><ul className="sys-list">${data.excluded.map((x) => html`<li key=${x}>${x}</li>`)}</ul></div>
    </div>
    <div className="sys-diag-preview"><${JsonView} value=${data} defaultExpandDepth=${1} /></div>
  <//>`;
}

function AdminBackup() {
  const state = useStore();
  const job = useSysJob();
  const sys = sysOf(state);
  const [nowOpen, setNowOpen] = useState(false);
  const [restoreId, setRestoreId] = useState(null);
  const policyRef = useRef(null);
  const latest = sysLatestBackup(sys);
  const disk = sysDisk(state);
  const next = sysNextRun(sys.backupPolicy, Date.now());
  const running = Boolean(job && !job.done);
  const successCount = sys.backups.filter((b) => b.status === 'success').length;
  const stopped = state.workers.filter((w) => w.stoppedFor === 'restore');
  const focusPolicy = () => {
    const el = policyRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const input = el.querySelector('.sys-keep input');
    if (input) setTimeout(() => input.focus({ preventScroll: true }), 300);
  };
  const restoreJob = job && job.kind === 'restore' ? job : null;
  return html`<div className="page"><div className="page-inner">
    <${PageHeader}
      title="备份与恢复"
      description="备份包含数据库和上传的文件。加密密钥不在备份里，需要单独保存。"
      actions=${html`<${Button} variant="primary" icon="DatabaseBackup" disabled=${running} onClick=${() => setNowOpen(true)}>立即备份<//>`}
    />
    ${job && job.kind === 'backup' && !job.done && html`<div className="card sys-job">
      <div className="row"><${Icon} name="LoaderCircle" size=${16} className="spin sys-running-text" /><b>正在备份</b><span className="text-xs muted">${(job.phases[job.phase] || {}).label}</span><span className="spacer" /><span className="sys-job-pct">${job.progress}%</span></div>
      <${Progress} value=${job.progress} height=${6} />
      <div className="text-xs muted">可以离开这个页面，备份在服务器上继续进行。</div>
    </div>`}
    ${restoreJob && !restoreId && html`<div className="card sys-job">
      <div className="row">
        ${restoreJob.done ? html`<${Icon} name="CircleCheck" size=${16} className="sys-ok-text" />` : html`<${Icon} name="LoaderCircle" size=${16} className="spin sys-running-text" />`}
        <b>${restoreJob.done ? `已恢复到 ${restoreJob.meta.stamp} 的备份` : `正在恢复到 ${restoreJob.meta.stamp} 的备份`}</b>
        <span className="text-xs muted">${restoreJob.done ? '演示环境：原型不会真的回滚数据' : (restoreJob.phases[restoreJob.phase] || {}).label}</span>
        <span className="spacer" />
        ${restoreJob.done ? html`<${Button} size="sm" variant="ghost" onClick=${sysClearJob}>知道了<//>` : html`<span className="sys-job-pct">${restoreJob.progress}%</span>`}
      </div>
      ${!restoreJob.done && html`<${Progress} value=${restoreJob.progress} height=${6} />`}
    </div>`}
    ${stopped.length > 0 && !running && html`<div className="sys-note"><${Alert} tone="warning" title=${`${stopped.length} 个工作节点为了恢复备份已停止`} action=${html`<${Button} size="sm" icon="CirclePlay" onClick=${sysStartWorkers}>启动工作节点<//>`}>确认数据无误后启动，工作流才会继续运行。<//></div>`}
    <div className="stat-grid">
      <${Stat} label="最近成功备份" value=${latest ? fmt.relative(latest.at) : '还没有'} delta=${latest ? sysStamp(latest.at) : '现在备份一次'} tone=${!latest || Date.now() - latest.at > 26 * HOUR ? 'danger' : undefined} />
      <${Stat} label="下次自动备份" value=${next ? sysWhen(next) : '已关闭'} delta=${sys.backupPolicy.enabled ? `${sysScheduleText(sys.backupPolicy)} · 保留 ${sys.backupPolicy.keep} 份` : '自动备份已关闭'} tone=${sys.backupPolicy.enabled ? undefined : 'danger'} />
      <${Stat} label="本地备份占用" value=${sysGb(disk.backupsGb)} suffix="GB" delta=${`${successCount} 份成功的备份`} />
      <${Stat} label="数据目录剩余" value=${sysGb(disk.free)} suffix=${`GB / ${disk.total} GB`} delta=${disk.free < 10 ? '空间不足，备份可能失败' : '空间充足'} tone=${disk.free < 10 ? 'danger' : 'success'} />
    </div>
    <div ref=${policyRef}><${SysBackupPolicy} /></div>
    <div className="section-head section"><span className="section-title">备份记录</span><span className="text-xs muted">保留份数只对自动备份生效，手动备份需要手动删除</span></div>
    <${SysBackupTable} job=${job} onRestore=${setRestoreId} onFix=${focusPolicy} />
    <div className="sys-note sys-key-note"><${Alert} tone="info" title="加密密钥需要单独备份" action=${html`<${Button} size="sm" onClick=${() => navigate('/admin/encryption')}>数据加密<//>`}>恢复到新服务器时，需要创建备份时使用的加密密钥（<span className="mono">${SYS_KEY_PATH}</span> 或 <span className="mono">FEMA_ENCRYPTION_KEY</span>），否则连接里的凭据无法解密。<//></div>
    ${nowOpen && html`<${SysBackupNowModal} onClose=${() => setNowOpen(false)} />`}
    ${restoreId && html`<${SysRestoreModal} key=${restoreId} backupId=${restoreId} onClose=${() => setRestoreId(null)} />`}
  </div></div>`;
}

function sysPolicyDraft(p) {
  return {
    enabled: p.enabled, frequency: p.frequency, weekday: p.weekday, time: p.time, keep: String(p.keep), target: p.target, path: p.path,
    s3: { endpoint: p.s3.endpoint || '', region: p.s3.region || '', bucket: p.s3.bucket || '', prefix: p.s3.prefix || 'backups/', accessKey: p.s3.accessKey || '', secret: '', reuse: false },
  };
}

function SysBackupPolicy() {
  const state = useStore();
  const sys = sysOf(state);
  const saved = sys.backupPolicy;
  const storage = sys.services.storage;
  const initial = sysPolicyDraft(saved);
  const [d, setD] = useState(initial);
  const [touched, setTouched] = useState({});
  const [test, setTest] = useState(null);
  const set = (patch) => setD({ ...d, ...patch });
  const keepNum = /^\d+$/.test(d.keep) ? Number(d.keep) : NaN;
  const s3Errors = d.target === 's3' ? sysServiceErrors('storage', d.s3, saved.s3) : {};
  const errors = {
    keep: !Number.isInteger(keepNum) || keepNum < 1 || keepNum > 90 ? '请输入 1 到 90 之间的整数' : null,
    path: d.target !== 'local' ? null : !d.path.trim() ? '请输入备份目录' : !/^\/[\w./-]+$/.test(d.path.trim()) || d.path.trim() === '/' ? '请输入以 / 开头的绝对路径，例如 /data/fema/backups' : null,
  };
  const s3Same = JSON.stringify({ ...d.s3, secret: '' }) === JSON.stringify({ ...initial.s3, secret: '' }) && !d.s3.secret && saved.s3.configured;
  const s3Tested = Boolean(test && test.ok && test.sig === JSON.stringify(d.s3));
  const s3Valid = !Object.values(s3Errors).some(Boolean);
  const s3Ready = d.target !== 's3' || s3Same || (s3Valid && s3Tested);
  const valid = !Object.values(errors).some(Boolean) && s3Valid && s3Ready;
  const compare = (x) => JSON.stringify({ ...x, s3: x.target === 's3' ? x.s3 : null });
  const dirty = compare(d) !== compare(initial);
  const show = (k) => (touched[k] ? errors[k] : null);
  const showS3 = (k) => (touched[`s3.${k}`] || saved.s3.configured ? s3Errors[k] : null);
  const keepSize = Number.isInteger(keepNum) ? (keepNum * ((sysLatestBackup(sys) || { size: 400 }).size)) / 1024 : 0;
  const save = () => {
    const now = Date.now();
    const s3 = d.target === 's3' && !s3Same
      ? { configured: true, endpoint: d.s3.endpoint.trim(), region: d.s3.region.trim(), bucket: d.s3.bucket.trim(), prefix: d.s3.prefix.trim(), accessKey: d.s3.accessKey.trim(), hasSecret: Boolean(saved.s3.hasSecret || d.s3.secret || d.s3.reuse), testedAt: test ? test.at : now }
      : saved.s3;
    const next = { ...saved, enabled: d.enabled, frequency: d.frequency, weekday: d.weekday, time: d.time, keep: keepNum, target: d.target, path: d.path.trim(), s3 };
    const policy = { ...next, schedule: sysScheduleText(next) };
    sysSet((x) => ({ ...x, backupPolicy: policy }));
    setD(sysPolicyDraft(policy));
    setTouched({});
    addAudit('修改备份策略', `${policy.enabled ? policy.schedule : '已关闭自动备份'} · 保留 ${policy.keep} 份 · ${policy.target === 's3' ? `S3 兼容存储 ${policy.s3.bucket}` : `本地目录 ${policy.path}`}`);
    toast.success('已保存备份策略');
  };
  const reuse = () => {
    setD({ ...d, s3: { ...d.s3, endpoint: storage.endpoint, region: storage.region || '', bucket: storage.bucket, accessKey: storage.accessKey, secret: '', reuse: true } });
    setTouched({ ...touched, 's3.endpoint': true, 's3.bucket': true });
  };
  return html`<${Card} title="备份策略" icon="CalendarClock" extra=${html`<${Switch} checked=${d.enabled} onChange=${(v) => set({ enabled: v })} />`}>
    ${!d.enabled && html`<div className="sys-note"><${Alert} tone="warning">关闭后不会再自动备份，只能手动备份。出问题时可能没有可以恢复的数据。<//></div>`}
    <div className=${cx('sys-policy', !d.enabled && 'is-off')}>
      <${Field} label="频率" layout="horizontal">
        <div className="row sys-policy-row">
          <${Segmented} value=${d.frequency} onChange=${(v) => set({ frequency: v })} options=${[{ value: 'daily', label: '每天' }, { value: 'weekly', label: '每周' }]} disabled=${!d.enabled} />
          ${d.frequency === 'weekly' && html`<${Select} width=${96} value=${d.weekday} onChange=${(v) => set({ weekday: v })} disabled=${!d.enabled} options=${SYS_WEEKDAYS.map((w, i) => ({ value: i, label: w }))} />`}
          <${Select} width=${104} value=${d.time} onChange=${(v) => set({ time: v })} disabled=${!d.enabled} options=${SYS_TIMES.map((t) => ({ value: t, label: t }))} />
          <span className="text-xs muted">按服务器时区，建议安排在业务低峰</span>
        </div>
      <//>
      <${Field} label="保留份数" layout="horizontal" error=${show('keep')} hint=${`超过后自动删除最早的自动备份${keepSize ? `，预计占用 ${sysGb(keepSize)} GB` : ''}`}>
        <div className="sys-keep"><${Input} value=${d.keep} onChange=${(v) => { set({ keep: v.replace(/\D/g, '').slice(0, 3) }); setTouched({ ...touched, keep: true }); }} suffix="份" invalid=${Boolean(show('keep'))} style=${{ width: 140 }} /></div>
      <//>
    </div>
    <${Field} label="备份位置" layout="horizontal">
      <${RadioCards} columns=${2} value=${d.target} onChange=${(v) => set({ target: v })} options=${[
        { value: 'local', label: '本地目录', icon: 'HardDrive', desc: '写入服务器的数据目录，需要挂载持久化卷' },
        { value: 's3', label: 'S3 兼容存储', icon: 'Cloud', desc: saved.s3.configured ? `已配置 · ${saved.s3.bucket}` : '异地保存更安全，需要先填写并测试连接' },
      ]} />
    <//>
    ${d.target === 'local' && html`<${Field} label="备份目录" layout="horizontal" required error=${show('path')} hint="容器内的路径，需要挂载到宿主机的持久化卷，否则重建容器后备份会丢失"><${Input} mono value=${d.path} onChange=${(v) => { set({ path: v }); setTouched({ ...touched, path: true }); }} invalid=${Boolean(show('path'))} /><//>`}
    ${d.target === 's3' && html`<div className="sys-s3">
      <div className="row sys-s3-head">
        <b>S3 兼容存储</b>
        ${saved.s3.configured && s3Same ? html`<${Tag} size="sm" tone="success" icon="CircleCheck">已配置<//>` : html`<${Tag} size="sm" tone="warning">需要测试连接<//>`}
        <span className="spacer" />
        ${storage.configured && html`<${Button} size="sm" variant="ghost" icon="Copy" onClick=${reuse}>使用「对象存储」的连接信息<//>`}
      </div>
      <${SysServiceFields} kind="storage" withPrefix draft=${d.s3} onChange=${(next, key) => { set({ s3: next }); setTouched({ ...touched, [`s3.${key}`]: true }); }} show=${showS3} saved=${saved.s3} />
      ${!s3Same && html`<${SysServiceTest} kind="storage" draft=${d.s3} valid=${s3Valid} test=${test} onTest=${setTest} />`}
    </div>`}
    <${AdminSaveBar} dirty=${dirty} valid=${valid} onCancel=${() => { setD(initial); setTouched({}); setTest(null); }} onSave=${save} />
  <//>`;
}

function sysBackupFix(b) {
  const e = b.error || '';
  if (/磁盘|空间/.test(e)) return { label: '调小保留份数，或者改存到 S3 兼容存储', policy: true };
  if (/S3|签名|Bucket|bucket|对象存储/.test(e)) return { label: '检查 S3 兼容存储的配置', policy: true };
  return { label: '查看健康状态', to: '/admin/health' };
}

function SysBackupTable({ job, onRestore, onFix }) {
  const state = useStore();
  const sys = sysOf(state);
  const running = job && job.kind === 'backup' && !job.done ? [{ id: job.id, at: job.startedAt, type: 'manual', status: 'running', target: job.meta.target, by: state.me, note: job.meta.note, progress: job.progress }] : [];
  const rows = [...running, ...[...sys.backups].sort((a, b) => b.at - a.at)];
  const busy = Boolean(job && !job.done);
  const where = (b) => (b.target === 's3' ? 'S3 兼容存储' : '本地目录');
  const remove = async (b) => {
    const last = b.status === 'success' && sys.backups.filter((x) => x.status === 'success').length === 1;
    if (!(await confirmDialog({ title: `删除 ${sysStamp(b.at)} 的备份？`, content: last ? '这是唯一一份成功的备份，删除后将没有可以恢复的数据。' : '删除后不能再恢复到这个时间点，备份文件会从存储中移除。', okText: '删除', danger: true }))) return;
    sysSet((x) => ({ ...x, backups: x.backups.filter((y) => y.id !== b.id) }));
    addAudit('删除备份', `${sysStamp(b.at)}${b.note ? ` · ${b.note}` : ''}`);
    toast.success('已删除备份');
  };
  const download = (b) => {
    const file = sysBackupFile(b);
    const p = sys.backupPolicy;
    const digest = Array.from({ length: 8 }, (_, i) => sysHash(`${b.id}|${b.at}`, i)).join('');
    sysDownload(`${file.replace('.tar.gz', '')}.manifest.json`, {
      kind: 'backup-manifest',
      id: b.id,
      file,
      location: b.target === 's3' ? `s3://${p.s3.bucket || 'bucket'}/${p.s3.prefix || ''}${file}` : `${p.path}/${file}`,
      createdAt: new Date(b.at).toISOString(),
      version: sysBackupVersion(b, sys),
      type: b.type === 'manual' ? 'manual' : 'scheduled',
      createdBy: b.by ? personName(b.by) : 'scheduler',
      note: b.note || null,
      sizeMb: b.size,
      sha256: digest,
      contents: { database: 'PostgreSQL（pg_dump 自定义格式）', files: SYS_FILES_PATH, encryptionKey: '不包含，需要单独保存' },
      restore: { requires: [`版本 ${sysBackupVersion(b, sys)} 或更新的版本`, '创建备份时使用的加密密钥', '恢复期间停止全部工作节点'] },
    });
    addAudit('下载备份清单', sysStamp(b.at));
    toast.success(adminCjk('已下载备份清单，备份文件本身在', where(b), '里'));
  };
  return html`<${Table}
    columns=${[
      { key: 'at', title: '备份时间', width: 150, render: (b) => html`<div><div className="cell-title">${sysStamp(b.at)}</div><div className="cell-sub">${fmt.relative(b.at)}</div></div>` },
      { key: 'type', title: '类型', width: 70, render: (b) => html`<${Tag} size="sm" tone=${b.type === 'manual' ? 'primary' : 'default'}>${b.type === 'manual' ? '手动' : '自动'}<//>` },
      { key: 'size', title: '大小', width: 84, align: 'right', render: (b) => (b.status === 'success' ? `${b.size} MB` : html`<span className="muted">-</span>`) },
      { key: 'ver', title: '版本', width: 64, render: (b) => (b.status === 'running' ? sys.version : sysBackupVersion(b, sys)) },
      { key: 'st', title: '状态', width: 96, render: (b) => (b.status === 'running'
        ? html`<span className="row-4"><${Icon} name="LoaderCircle" size=${12} className="spin sys-running-text" />${b.progress}%</span>`
        : html`<span className="row-4"><${Dot} tone=${b.status === 'success' ? 'success' : 'danger'} />${b.status === 'success' ? '成功' : '失败'}</span>`) },
      { key: 'note', title: '说明', wrap: true, render: (b) => {
        if (b.status === 'failed') {
          const fix = sysBackupFix(b);
          return html`<div><div className="sys-err-text">${b.error || '备份失败'}</div><a className="link text-xs" onClick=${() => (fix.policy ? onFix() : navigate(fix.to))}>${fix.label}</a></div>`;
        }
        const who = b.by ? personName(b.by) : '自动备份';
        return html`<span className="text-xs sys-note-text">${[where(b), who, b.note].filter(Boolean).join(' · ')}</span>`;
      } },
      { key: 'op', title: '操作', width: 150, render: (b) => (b.status === 'running'
        ? html`<span className="muted text-xs">备份中</span>`
        : html`<span className="row sys-actions">
          ${b.status === 'success' ? html`<a className="link" onClick=${() => download(b)}>下载清单</a>` : html`<span className="muted">下载清单</span>`}
          ${b.status === 'success' && !busy ? html`<a className="link" onClick=${() => onRestore(b.id)}>恢复</a>` : html`<${Tooltip} content=${b.status !== 'success' ? '失败的备份不能恢复' : '有任务正在进行'}><span className="muted">恢复</span><//>`}
          <a className="link is-danger" onClick=${() => remove(b)}>删除</a>
        </span>`) },
    ]}
    data=${rows}
    empty=${html`<${Empty} size="sm" icon="DatabaseBackup" title="还没有备份" description="点击「立即备份」创建第一份备份。" />`}
  />`;
}

function SysRestoreModal({ backupId, onClose }) {
  const state = useStore();
  const job = useSysJob();
  const sys = sysOf(state);
  const b = sys.backups.find((x) => x.id === backupId);
  const mine = Boolean(job && job.kind === 'restore' && job.meta.backupId === backupId);
  const [step, setStep] = useState(mine ? 2 : 0);
  const [typed, setTyped] = useState('');
  const [snapshot, setSnapshot] = useState(true);
  if (!b && !mine) return null;
  const stamp = b ? sysStamp(b.at) : job.meta.stamp;
  const from = b ? sysBackupVersion(b, sys) : sys.version;
  const cmp = sysCmp(from, sys.version);
  const disk = sysDisk(state);
  const need = ((b ? b.size : 400) * 2.5) / 1024;
  const active = state.workers.filter((w) => w.status !== 'offline');
  const stoppedForRestore = state.workers.filter((w) => w.stoppedFor === 'restore');
  const rotatedAfter = Boolean(b && state.encryption && state.encryption.rotatedAt && state.encryption.rotatedAt > b.at);
  const stopWorkers = async () => {
    if (!(await confirmDialog({ title: `停止 ${active.length} 个工作节点？`, content: '停止后不再领取新任务，正在运行的任务会被中断，恢复后显示为失败。恢复完成后可以一键启动。', okText: '停止', danger: true }))) return;
    const ids = new Set(active.map((w) => w.id));
    Store.set((s) => ({ ...s, workers: s.workers.map((w) => (ids.has(w.id) ? { ...w, status: 'offline', jobs: 0, stoppedFor: 'restore' } : w)) }));
    addAudit('停止工作节点', `${active.length} 个，准备恢复备份`);
    toast.success(`已停止 ${active.length} 个工作节点`);
  };
  const checks = [
    { key: 'version', level: cmp > 0 ? 'error' : 'ok', title: '版本兼容', text: cmp === 0 ? `备份来自 ${from}，和当前版本一致` : cmp < 0 ? `备份来自 ${from}，恢复后会自动执行到 ${sys.version} 的数据库迁移` : `备份来自更新的版本 ${from}，不能恢复到 ${sys.version}，需要先升级` },
    { key: 'disk', level: disk.free >= need ? 'ok' : 'error', title: '磁盘空间', text: `需要约 ${sysGb(need)} GB 临时空间，数据目录剩余 ${sysGb(disk.free)} GB` },
    { key: 'workers', level: active.length ? 'error' : 'ok', title: '停止工作节点', text: active.length ? `${active.length} 个工作节点还在运行。恢复期间不能有任务写入数据库，需要先停止全部工作节点` : '全部工作节点已停止，恢复期间不会有新任务', action: active.length ? html`<${Button} size="sm" icon="CirclePause" onClick=${stopWorkers}>停止全部工作节点<//>` : null },
    { key: 'key', level: rotatedAfter ? 'warning' : 'ok', title: '加密密钥', text: rotatedAfter ? '备份之后轮换过加密密钥，恢复时会用轮换前保留的旧密钥解密连接凭据，旧密钥只保留 7 天' : '备份和当前使用同一个加密密钥，连接凭据可以正常解密' },
  ];
  const blocked = checks.some((c) => c.level === 'error');
  const start = () => {
    if (!sysStartRestore(b, snapshot)) { toast.error('已经有任务在进行，稍后再试'); return; }
    setStep(2);
  };
  const finish = () => { sysClearJob(); onClose(); };
  const done = mine && job.done;
  const footer = step === 0
    ? html`<${Fragment}><${Button} onClick=${onClose}>取消<//><${Button} variant="primary" disabled=${blocked} onClick=${() => setStep(1)}>下一步<//><//>`
    : step === 1
      ? html`<${Fragment}><${Button} onClick=${() => setStep(0)}>上一步<//><${Button} variant="danger" icon="ArchiveRestore" disabled=${typed.trim() !== stamp} onClick=${start}>开始恢复<//><//>`
      : done
        ? html`<${Fragment}>${stoppedForRestore.length > 0 && html`<${Button} icon="CirclePlay" onClick=${sysStartWorkers}>启动工作节点<//>`}<${Button} variant="primary" onClick=${finish}>完成<//><//>`
        : html`<${Button} onClick=${onClose}>在后台继续<//>`;
  return html`<${Modal} open=${true} onClose=${onClose} title=${`恢复到 ${stamp} 的备份`} description=${b ? `${b.size} MB · ${b.type === 'manual' ? '手动备份' : '自动备份'}${b.note ? ` · ${b.note}` : ''}` : null} width=${640} maskClosable=${step !== 1} footer=${footer}>
    <${Steps} current=${step === 2 && done ? 3 : step} items=${[{ title: '预检' }, { title: '确认' }, { title: '恢复' }]} />
    <div className="sys-restore-body">
      ${step === 0 && html`<div className="col sys-rows">
        ${checks.map((c) => html`<div key=${c.key} className="sys-row">
          <${SysLevelIcon} level=${c.level} />
          <div className="grow"><b>${c.title}</b><div className="text-xs muted">${c.text}</div></div>
          ${c.action && html`<div className="row sys-row-actions">${c.action}</div>`}
        </div>`)}
        ${blocked && html`<div className="text-xs sys-err-text">处理完标红的项目才能继续</div>`}
      </div>`}
      ${step === 1 && html`<div>
        <div className="sys-note"><${Alert} tone="danger" title="恢复会覆盖现在的数据">平台会回到 ${stamp} 的状态。之后创建或修改的工作流、连接、成员和运行记录都会丢失。<//></div>
        <div className="sys-note"><${Checkbox} checked=${snapshot} onChange=${setSnapshot} label="恢复前先备份当前数据（推荐，出错时还能回来）" /></div>
        <${Field} label=${html`<span>输入备份时间 <span className="mono">${stamp}</span> 以确认</span>`}><${Input} value=${typed} onChange=${setTyped} placeholder=${stamp} autoFocus /><//>
      </div>`}
      ${step === 2 && mine && html`<div>
        <${Progress} value=${job.progress} height=${8} tone=${done ? 'success' : 'primary'} />
        <ol className="sys-phases">
          ${job.phases.map((p, i) => html`<li key=${p.label} className="row"><${SysLevelIcon} level=${i < job.phase || done ? 'ok' : i === job.phase ? 'running' : 'pending'} size=${14} /><span className=${i > job.phase && !done ? 'muted' : ''}>${p.label}</span></li>`)}
        </ol>
        ${done
          ? html`<${Alert} tone="success" title="恢复完成">演示环境：原型不会真的回滚数据，你看到的工作流和运行记录保持不变。真实环境中，平台会回到 ${job.meta.stamp} 的状态${job.meta.snapshot ? '，恢复前的数据已经备份，可以在备份记录里找到' : ''}。${stoppedForRestore.length ? `${stoppedForRestore.length} 个工作节点仍处于停止状态，确认数据无误后启动。` : ''}<//>`
          : html`<div className="text-xs muted">恢复期间平台不可用。可以关闭这个窗口，恢复会在服务器上继续。</div>`}
      </div>`}
    </div>
  <//>`;
}

function sysPrivacyOf(state) {
  const p = state.privacy || {};
  return {
    retentionDays: p.retentionDays || 30,
    projectRetention: p.projectRetention || {},
    payloadLevel: p.payloadLevel || 'full',
    maskRules: p.maskRules || [],
    revealRoles: p.revealRoles || ['owner', 'admin'],
    requireReason: p.requireReason !== false,
    rawRetentionDays: p.rawRetentionDays || 3,
    erasureRequests: p.erasureRequests || [],
  };
}

function sysPrivacySettings(p) {
  return {
    retentionDays: p.retentionDays,
    projectRetention: p.projectRetention,
    payloadLevel: p.payloadLevel,
    maskRules: p.maskRules,
    revealRoles: p.revealRoles,
    requireReason: p.requireReason,
    rawRetentionDays: p.rawRetentionDays,
  };
}

function sysRegexReason(e) {
  const m = String(e && e.message);
  if (/Unterminated group/.test(m)) return '括号没有闭合';
  if (/Unmatched '\)'/.test(m)) return '多了一个右括号';
  if (/Nothing to repeat/.test(m)) return '量词前面缺少内容';
  if (/Unterminated character class/.test(m)) return '方括号没有闭合';
  if (/\\ at end of pattern/.test(m)) return '结尾多了一个反斜杠';
  if (/Invalid escape|Invalid regular expression/.test(m)) return '语法错误';
  return '语法错误';
}

function sysRuleErrors(rule, rules) {
  const name = rule.name.trim();
  const pattern = rule.pattern || '';
  let regex = null;
  if (!pattern.trim()) {
    regex = '请输入正则表达式';
  } else {
    try {
      if (new RegExp(pattern, 'i').test('')) regex = '这个表达式会匹配所有字段，请写得更具体';
    } catch (e) {
      regex = `正则表达式无效：${sysRegexReason(e)}`;
    }
  }
  return {
    name: !name ? '请输入规则名称' : name.length > 20 ? '规则名称不能超过 20 个字' : rules.some((x) => x.id !== rule.id && x.name.trim() === name) ? '规则名称重复' : null,
    pattern: regex,
  };
}

function sysPrivacyErrors(d) {
  const project = Object.fromEntries(Object.entries(d.projectRetention).filter(([, days]) => days >= d.retentionDays).map(([pid]) => [pid, `只能比平台默认的 ${d.retentionDays} 天更短`]));
  const rules = Object.fromEntries(d.maskRules.filter((r) => r.type === 'field').map((r) => [r.id, sysRuleErrors(r, d.maskRules)]));
  return {
    project,
    rules,
    raw: d.payloadLevel !== 'none' && d.rawRetentionDays > d.retentionDays ? `不能长于运行日志的保留期（${d.retentionDays} 天）` : null,
  };
}

function sysPrivacyInvalid(errors) {
  return Object.keys(errors.project).length + Object.values(errors.rules).filter((e) => e.name || e.pattern).length + (errors.raw ? 1 : 0);
}

function sysCleanupCount(state, d) {
  const now = Date.now();
  return state.runs.filter((r) => r.startedAt < now - (d.projectRetention[r.projectId] || d.retentionDays) * DAY).length;
}

function sysPrivacyChanges(state, a, b) {
  const out = [];
  if (a.retentionDays !== b.retentionDays) out.push(`日志保留 ${a.retentionDays} → ${b.retentionDays} 天`);
  state.projects.forEach((p) => {
    const x = a.projectRetention[p.id];
    const y = b.projectRetention[p.id];
    if (x !== y) out.push(`${p.name} ${x ? `${x} 天` : '跟随默认'} → ${y ? `${y} 天` : '跟随默认'}`);
  });
  if (a.payloadLevel !== b.payloadLevel) out.push(`记录内容改为「${SYS_PAYLOAD_LEVELS.find((l) => l.value === b.payloadLevel).label}」`);
  if (a.rawRetentionDays !== b.rawRetentionDays) out.push(`原文保存 ${a.rawRetentionDays} → ${b.rawRetentionDays} 天`);
  b.maskRules.forEach((r) => {
    const old = a.maskRules.find((x) => x.id === r.id);
    if (!old) out.push(`新增脱敏规则「${r.name}」`);
    else if (old.enabled !== r.enabled) out.push(`${r.enabled ? '启用' : '停用'}脱敏规则「${r.name}」`);
    else if (old.name !== r.name || old.pattern !== r.pattern) out.push(`修改脱敏规则「${r.name}」`);
  });
  a.maskRules.filter((r) => !b.maskRules.some((x) => x.id === r.id)).forEach((r) => out.push(`删除脱敏规则「${r.name}」`));
  if (sysStable(a.revealRoles.slice().sort()) !== sysStable(b.revealRoles.slice().sort())) out.push(`查看原文的角色：${b.revealRoles.map((r) => SYS_REVEAL_ROLES.find((x) => x.value === r).label).join('、') || '无'}`);
  if (a.requireReason !== b.requireReason) out.push(b.requireReason ? '查看原文需要填写原因' : '查看原文不再需要原因');
  return out;
}

function sysChangedPaths(a, b, path) {
  if (a && typeof a === 'object') return Object.keys(a).flatMap((k) => sysChangedPaths(a[k], b && typeof b === 'object' ? b[k] : undefined, path ? `${path}.${k}` : k));
  return JSON.stringify(a) === JSON.stringify(b) ? [] : [path];
}

function sysMaskHits(value, privacy) {
  const rules = privacy.maskRules.filter((r) => r.enabled);
  return [...rules.filter((r) => r.type === 'field'), ...rules.filter((r) => r.type !== 'field')].reduce((acc, rule) => {
    const out = maskDeep(value, { maskRules: [rule] }).value;
    return sysChangedPaths(value, out, '').reduce((m, p) => (m[p] ? m : { ...m, [p]: rule.name }), acc);
  }, {});
}

function sysJsonRows(value, other, path, depth, name, last) {
  const comma = last ? '' : ',';
  if (value && typeof value === 'object') {
    const isArr = Array.isArray(value);
    const keys = Object.keys(value);
    const inner = keys.flatMap((k, i) => sysJsonRows(value[k], other && typeof other === 'object' ? other[k] : undefined, path ? `${path}.${k}` : k, depth + 1, isArr ? null : k, i === keys.length - 1));
    return [{ id: `${path}<`, depth, name, text: isArr ? '[' : '{' }, ...inner, { id: `${path}>`, depth, name: null, text: `${isArr ? ']' : '}'}${comma}` }];
  }
  return [{ id: path || '$', depth, name, path, text: `${JSON.stringify(value)}${comma}`, changed: JSON.stringify(value) !== JSON.stringify(other) }];
}

function SysJson({ value, other, tone, hits }) {
  const rows = sysJsonRows(value, other, '', 0, null, true);
  return html`<div className="sys-json">${rows.map((r) => html`<div key=${r.id} className=${cx('sys-json-row', r.changed && `is-${tone}`)} style=${{ paddingLeft: 10 + r.depth * 16 }}>
    ${r.name != null && html`<${Fragment}><span className="json-key">"${r.name}"</span><span className="json-colon">: </span><//>`}<span className="sys-json-val">${r.text}</span>${r.changed && hits && hits[r.path] && html`<span className="sys-json-hit">${hits[r.path]}</span>`}
  </div>`)}</div>`;
}

function sysParseJson(text) {
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object') return { error: '需要是一个 JSON 对象或数组' };
    return { value, error: null };
  } catch (e) {
    return { error: '不是有效的 JSON，检查一下引号、逗号和括号' };
  }
}

function SysMaskPreview({ privacy }) {
  const [sample, setSample] = useState('onboard');
  const [text, setText] = useState(() => JSON.stringify(SYS_MASK_SAMPLES[0].data, null, 2));
  const pick = (v) => {
    if (v === 'custom' && sample !== 'custom') setText(JSON.stringify(SYS_MASK_SAMPLES.find((x) => x.value === sample).data, null, 2));
    setSample(v);
  };
  const parsed = sample === 'custom' ? sysParseJson(text) : { value: SYS_MASK_SAMPLES.find((x) => x.value === sample).data, error: null };
  const result = parsed.error ? null : maskDeep(parsed.value, privacy);
  const hits = parsed.error ? {} : sysMaskHits(parsed.value, privacy);
  return html`<div className="sys-preview">
    <div className="row sys-preview-head">
      <b>效果预览</b>
      <span className="text-xs muted">用页面上（包括未保存）的规则处理示例数据，和写入运行日志时的处理一致</span>
      <span className="spacer" />
      <${Select} size="sm" width=${170} value=${sample} onChange=${pick} options=${SYS_MASK_SAMPLES.map((x) => ({ value: x.value, label: x.label }))} />
    </div>
    <div className="sys-preview-grid">
      <div>
        <div className="sys-preview-label">原始数据</div>
        ${sample === 'custom'
          ? html`<${Fragment}><${Textarea} mono rows=${14} value=${text} onChange=${setText} invalid=${Boolean(parsed.error)} />${parsed.error && html`<div className="field-error">${parsed.error}</div>`}<//>`
          : html`<${SysJson} value=${parsed.value} other=${result.value} tone="before" />`}
      </div>
      <div>
        <div className="sys-preview-label row">写入日志的数据${result && html`<${Tag} size="sm" tone=${result.count ? 'primary' : 'default'}>脱敏 ${result.count} 个字段<//>`}</div>
        ${result ? html`<${SysJson} value=${result.value} other=${parsed.value} tone="after" hits=${hits} />` : html`<div className="sys-json is-empty">修正 JSON 后显示结果</div>`}
      </div>
    </div>
  </div>`;
}

function sysErasureValue(r) {
  if (r.value) return r.value;
  const m = /（([^）]+)）/.exec(r.subject || '');
  return m ? m[1] : r.subject || '';
}

function sysErasureKindOf(r) {
  if (r.kind) return r.kind;
  const v = sysErasureValue(r);
  return /@/.test(v) ? 'email' : /^1\d{10}$/.test(v) ? 'phone' : 'employee';
}

function sysErasureValid(kind, v) {
  if (kind === 'employee') return /^[A-Za-z]{1,4}\d{4,12}$/.test(v);
  if (kind === 'email') return ADMIN_EMAIL_RE.test(v);
  return /^1\d{10}$/.test(v);
}

function sysScanRuns(state, value) {
  const needle = value.trim().toLowerCase();
  const wfs = new Map(state.workflows.map((w) => [w.id, w]));
  const done = sysPrivacyOf(state).erasureRequests.filter((r) => r.status === 'done' && sysErasureValue(r).toLowerCase() === needle);
  const erasedIds = new Set(done.flatMap((r) => r.runIds || []));
  const cutoff = done.filter((r) => !r.runIds).reduce((a, r) => Math.max(a, r.doneAt || 0), 0);
  const hits = [];
  let skipped = 0;
  state.runs.forEach((run) => {
    const wf = wfs.get(run.workflowId);
    if (!wf) return;
    const text = JSON.stringify(buildRunTrace(run, wf).map((x) => [x.input, x.output, x.error])).toLowerCase();
    if (!text.includes(needle)) return;
    if (erasedIds.has(run.id) || run.startedAt <= cutoff) { skipped += 1; return; }
    hits.push(run);
  });
  const byWf = hits.reduce((acc, r) => ({ ...acc, [r.workflowId]: (acc[r.workflowId] || 0) + 1 }), {});
  return {
    runIds: hits.map((r) => r.id),
    skipped,
    workflows: Object.entries(byWf).map(([id, count]) => ({ id, count, name: (wfs.get(id) || {}).name || '已删除的工作流' })).sort((a, b) => b.count - a.count),
    first: hits.length ? Math.min(...hits.map((r) => r.startedAt)) : null,
    last: hits.length ? Math.max(...hits.map((r) => r.startedAt)) : null,
  };
}

function sysPatchErasure(id, patch) {
  Store.set((s) => ({ ...s, privacy: { ...s.privacy, erasureRequests: (s.privacy.erasureRequests || []).map((r) => (r.id === id ? { ...r, ...patch } : r)) } }));
}

function AdminPrivacy() {
  const state = useStore();
  const saved = sysPrivacyOf(state);
  const initial = sysPrivacySettings(saved);
  const [d, setD] = useState(initial);
  const [touched, setTouched] = useState({});
  const [erasure, setErasure] = useState(false);
  const errors = sysPrivacyErrors(d);
  const invalid = sysPrivacyInvalid(errors);
  const dirty = sysStable(d) !== sysStable(initial);
  const set = (patch) => setD({ ...d, ...patch });
  const effective = { ...d, maskRules: d.maskRules.filter((r) => r.type !== 'field' || !errors.rules[r.id].pattern) };
  const cleanup = sysCleanupCount(state, d);
  const cleanupSaved = sysCleanupCount(state, initial);
  const nextCleanup = sysNextRun({ enabled: true, frequency: 'daily', time: '03:00' }, Date.now());
  const sensitive = state.workflows.flatMap((w) => allNodes(w).filter((n) => n.sensitive).map((n) => ({ key: `${w.id}:${n.id}`, wf: w, node: n })));
  const revealers = state.users.filter((u) => u.status === 'active' && d.revealRoles.includes(u.role));
  const setProject = (pid, days) => {
    const next = { ...d.projectRetention };
    if (days) next[pid] = days;
    else delete next[pid];
    set({ projectRetention: next });
  };
  const setRule = (id, patch, key) => {
    set({ maskRules: d.maskRules.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
    if (key) setTouched({ ...touched, [`${id}.${key}`]: true });
  };
  const addRule = () => set({ maskRules: [...d.maskRules, { id: uid('mr'), name: '', type: 'field', pattern: '', enabled: true }] });
  const removeRule = (id) => set({ maskRules: d.maskRules.filter((r) => r.id !== id) });
  const cancel = () => { setD(initial); setTouched({}); };
  const save = () => {
    const changes = sysPrivacyChanges(state, initial, d);
    const next = { ...d, maskRules: d.maskRules.map((r) => (r.type === 'field' ? { ...r, name: r.name.trim() } : r)) };
    Store.set((s) => ({ ...s, privacy: { ...(s.privacy || {}), ...next } }));
    setD(next);
    setTouched({});
    addAudit('修改数据与隐私设置', changes.join('；') || '数据与隐私');
    toast.success('已保存，新的设置对之后写入的运行日志生效');
  };
  const ruleShow = (r, k) => (touched[`${r.id}.${k}`] || r.name.trim() || r.pattern.trim() ? errors.rules[r.id][k] : null);
  const builtin = d.maskRules.filter((r) => r.type === 'builtin');
  const custom = d.maskRules.filter((r) => r.type === 'field');
  const requests = [...saved.erasureRequests].sort((a, b) => b.requestedAt - a.requestedAt);
  const kindLabel = (k) => (SYS_ERASURE_KINDS.find((x) => x.value === k) || SYS_ERASURE_KINDS[0]).label;
  const receipt = (r) => {
    sysDownload(`erasure-${r.id}.json`, { kind: 'erasure-receipt', id: r.id, subject: r.subject, lookup: kindLabel(sysErasureKindOf(r)), reason: r.reason || null, requestedBy: personName(r.requestedBy), requestedAt: new Date(r.requestedAt).toISOString(), completedAt: r.doneAt ? new Date(r.doneAt).toISOString() : null, affectedRuns: r.affected, runIds: r.runIds || [], action: '清除运行记录中的入参和出参，保留状态、耗时和错误码' });
    addAudit('下载删除处理记录', r.subject);
  };
  return html`<div className="page"><div className="page-inner">
    <${PageHeader} title="数据与隐私" description="运行日志里的数据怎么脱敏、保存多久、谁能看原文，以及按人员删除数据。脱敏发生在写入日志之前。" actions=${html`<${Button} icon="FileClock" onClick=${() => navigate(`/admin/audit?action=${encodeURIComponent(SYS_AUDIT_REVEAL)}`)}>查看原文访问记录<//>`} />
    <div className="col sys-stack">
      <${Card} title="运行日志保留" icon="Timer" subtitle=${`到期的运行日志每天 03:00 自动清理，下次在${sysWhen(nextCleanup)}`}>
        <${Field} label="平台默认" layout="horizontal" hint="所有项目默认使用这个保留期">
          <${Select} width=${160} value=${d.retentionDays} onChange=${(v) => set({ retentionDays: v })} options=${SYS_RETENTION.map((n) => ({ value: n, label: `${n} 天` }))} />
        <//>
        <${Field} label="按项目设置" layout="horizontal" hint="项目只能设置比平台默认更短的保留期，不能更长">
          <div className="sys-proj-list">
            ${state.projects.map((p) => html`<div key=${p.id} className="sys-proj-row">
              <div className="row grow"><${ProjectAvatar} project=${p} size=${22} /><span className="ellipsis">${p.name}</span></div>
              <div>
                <${Select} width=${210} value=${d.projectRetention[p.id] || 0} onChange=${(v) => setProject(p.id, v)} invalid=${Boolean(errors.project[p.id])} options=${[{ value: 0, label: `跟随平台默认（${d.retentionDays} 天）` }, ...SYS_RETENTION.map((n) => ({ value: n, label: `${n} 天`, disabled: n >= d.retentionDays, desc: n >= d.retentionDays ? '不能长于平台默认' : null }))]} />
                ${errors.project[p.id] && html`<div className="field-error">${errors.project[p.id]}</div>`}
              </div>
            </div>`)}
          </div>
        <//>
        <div className="sys-cleanup"><${Icon} name="Trash2" size=${14} /><span>按${dirty ? '修改后的' : '当前'}设置，下次清理会删除 <b>${fmt.number(cleanup)}</b> 条运行记录${dirty && cleanup !== cleanupSaved ? `（保存前是 ${fmt.number(cleanupSaved)} 条）` : ''}。删除后不能恢复，需要长期保存的数据请用工作流同步到自己的系统。</span></div>
      <//>
      <${Card} title="记录内容" icon="ScrollText" subtitle="运行日志里保存多少节点数据，影响排查问题的方式">
        <${RadioCards} columns=${3} value=${d.payloadLevel} onChange=${(v) => set({ payloadLevel: v })} options=${SYS_PAYLOAD_LEVELS} />
        <div className="sys-effects">
          ${['运行日志里能看到', '从失败节点重跑', '查看原文'].map((label, i) => html`<div key=${label} className="sys-effect-row"><span className="muted">${label}</span><span>${SYS_PAYLOAD_EFFECTS[d.payloadLevel][i]}</span></div>`)}
        </div>
        <${Field} label="原文加密保存" layout="horizontal" error=${errors.raw} hint=${d.payloadLevel === 'none' ? '不记录输入输出时，平台不保存原文' : '原文只保存在加密存储里，用于从失败节点重跑和授权人员查看原文，到期自动删除'}>
          <${Select} width=${160} value=${d.rawRetentionDays} onChange=${(v) => set({ rawRetentionDays: v })} disabled=${d.payloadLevel === 'none'} invalid=${Boolean(errors.raw)} options=${SYS_RAW_RETENTION.map((n) => ({ value: n, label: `${n} 天` }))} />
        <//>
      <//>
      <${Card} title="脱敏规则" icon="EyeOff" subtitle="写入运行日志之前处理，对所有项目生效">
        <div className="sys-subhead">内置规则</div>
        <div className="sys-mask-list">
          ${builtin.map((r) => {
            const info = SYS_MASK_INFO[r.key] || { example: '', desc: '' };
            const after = MASK_DETECTORS[r.key] ? MASK_DETECTORS[r.key].mask(info.example) : info.example;
            return html`<div key=${r.id} className="sys-mask-row">
              <${Switch} checked=${r.enabled} onChange=${(v) => setRule(r.id, { enabled: v })} />
              <div className="grow"><b>${r.name}</b><div className="text-xs muted">${info.desc}</div></div>
              <span className=${cx('sys-mask-example', !r.enabled && 'is-off')}><span className="mono">${info.example}</span><${Icon} name="ArrowRight" size=${12} /><span className="mono">${after}</span></span>
            </div>`;
          })}
        </div>
        <div className="sys-subhead row">按字段名脱敏<span className="text-xs muted">字段名匹配正则表达式时，整个值替换为 ******，不区分大小写</span></div>
        <div className="sys-rule-list">
          ${custom.map((r) => html`<div key=${r.id} className="sys-rule-row">
            <${Switch} checked=${r.enabled} onChange=${(v) => setRule(r.id, { enabled: v })} />
            <div className="sys-rule-name">
              <${Input} value=${r.name} onChange=${(v) => setRule(r.id, { name: v.slice(0, 20) }, 'name')} placeholder="规则名称" invalid=${Boolean(ruleShow(r, 'name'))} />
              ${ruleShow(r, 'name') && html`<div className="field-error">${ruleShow(r, 'name')}</div>`}
            </div>
            <div className="grow">
              <${Input} mono value=${r.pattern} onChange=${(v) => setRule(r.id, { pattern: v }, 'pattern')} placeholder="例如 salary|薪资|工资" invalid=${Boolean(ruleShow(r, 'pattern'))} />
              ${ruleShow(r, 'pattern') && html`<div className="field-error">${ruleShow(r, 'pattern')}</div>`}
            </div>
            <${IconButton} icon="Trash2" size="sm" title="删除规则" onClick=${() => removeRule(r.id)} />
            ${!r.name.trim() && !r.pattern.trim() && !touched[`${r.id}.name`] && !touched[`${r.id}.pattern`] && html`<div className="text-xs muted sys-rule-hint">填写规则名称和正则表达式，或者删除这一行</div>`}
          </div>`)}
          ${!custom.length && html`<div className="text-xs muted">还没有按字段名的规则。</div>`}
          <div><${Button} size="sm" variant="dashed" icon="Plus" onClick=${addRule}>添加规则<//></div>
        </div>
        ${sensitive.length > 0 && html`<div className="sys-sensitive"><${Icon} name="ShieldCheck" size=${14} /><span>另外有 ${sensitive.length} 个节点把出参标为敏感，这些节点的全部出参都会脱敏：${sensitive.map((x, i) => html`<${Fragment} key=${x.key}>${i > 0 && '、'}<${Link} to=${`/integration/${x.wf.projectId}/wf/${x.wf.id}`} className="link">${x.wf.name} · ${x.node.name}<//><//>`)}</span></div>`}
        <${SysMaskPreview} privacy=${effective} />
      <//>
      <${Card} title="查看原文" icon="ScanEye" subtitle="在运行日志里查看脱敏前的数据，每次查看都写入审计日志" extra=${html`<${Link} to=${`/admin/audit?action=${encodeURIComponent(SYS_AUDIT_REVEAL)}`} className="link text-xs">查看原文访问记录<//>`}>
        ${d.payloadLevel === 'none' && html`<div className="sys-note"><${Alert} tone="info">当前不记录输入输出，平台不保存原文，下面的设置暂时不起作用。<//></div>`}
        <${Field} label="可以查看的角色" layout="horizontal" hint=${revealers.length ? `现在有 ${revealers.length} 人可以查看：${revealers.slice(0, 6).map((u) => u.name).join('、')}${revealers.length > 6 ? ' 等' : ''}` : '没有人可以查看原文，排查问题只能看脱敏后的数据'}>
          <div className="row sys-roles">${SYS_REVEAL_ROLES.map((r) => html`<${Checkbox} key=${r.value} label=${r.label} checked=${d.revealRoles.includes(r.value)} onChange=${(v) => set({ revealRoles: v ? [...d.revealRoles, r.value] : d.revealRoles.filter((x) => x !== r.value) })} />`)}</div>
        <//>
        <${Field} label="需要填写原因" layout="horizontal" hint="查看前必须写明原因，原因和查看记录一起写入审计日志">
          <${Switch} checked=${d.requireReason} onChange=${(v) => set({ requireReason: v })} />
        <//>
      <//>
      <${Card} title="个人数据删除" icon="UserX" subtitle="按工号、邮箱或手机号，删除运行日志里某个人的数据" extra=${html`<${Button} size="sm" icon="Plus" onClick=${() => setErasure(true)}>新建删除请求<//>`}>
        <${Table}
          dense
          columns=${[
            { key: 's', title: '对象', render: (r) => html`<div><div className="cell-title">${r.subject}</div><div className="cell-sub">按${kindLabel(sysErasureKindOf(r))}查找</div></div>` },
            { key: 'why', title: '依据', wrap: true, render: (r) => html`<span className="text-xs">${r.reason || html`<span className="muted">未填写</span>`}</span>` },
            { key: 'by', title: '发起人', width: 80, render: (r) => personName(r.requestedBy) },
            { key: 't', title: '发起时间', width: 100, render: (r) => fmt.short(r.requestedAt) },
            { key: 'n', title: '影响', width: 104, render: (r) => (r.status === 'done' ? `${fmt.number(r.affected)} 条运行记录` : html`<span className="muted">处理中</span>`) },
            { key: 'st', title: '状态', width: 96, render: (r) => (r.status === 'done' ? html`<div><${Tag} size="sm" tone="success">已完成<//><div className="cell-sub">${r.doneAt ? fmt.short(r.doneAt) : ''}</div></div>` : html`<${Tag} size="sm" tone="info" icon="Hourglass">处理中<//>`) },
            { key: 'op', title: '', width: 104, render: (r) => (r.status === 'done' ? html`<a className="link text-xs" onClick=${() => receipt(r)}>下载处理记录</a>` : html`<span className="muted text-xs">-</span>`) },
          ]}
          data=${requests}
          empty=${html`<${Empty} size="sm" icon="UserX" title="还没有删除请求" description="员工离职或本人要求删除个人信息时，在这里发起。" />`}
        />
      <//>
    </div>
    ${dirty && html`<div className="sys-savebar">
      <${Icon} name=${invalid ? 'CircleAlert' : 'Info'} size=${16} className=${invalid ? 'sys-err-text' : 'muted'} />
      <span className="text-xs">${invalid ? `有 ${invalid} 处需要修正` : '有未保存的修改'}</span>
      <span className="spacer" />
      <${Button} onClick=${cancel}>取消<//>
      <${Button} variant="primary" disabled=${invalid > 0} onClick=${save}>保存<//>
    </div>`}
    ${erasure && html`<${SysErasureModal} onClose=${() => setErasure(false)} />`}
  </div></div>`;
}

function SysErasureModal({ onClose }) {
  const [kind, setKind] = useState('employee');
  const [value, setValue] = useState('');
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState({});
  const [scan, setScan] = useState(null);
  const [scanning, setScanning] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const meta = SYS_ERASURE_KINDS.find((k) => k.value === kind);
  const v = value.trim();
  const errors = {
    value: !v ? `请输入${meta.label}` : !sysErasureValid(kind, v) ? meta.error : null,
    reason: !reason.trim() ? '请填写删除依据，会写入审计日志' : null,
  };
  const current = scan && scan.kind === kind && scan.value === v.toLowerCase() ? scan : null;
  const find = () => {
    setTouched({ ...touched, value: true });
    if (errors.value) return;
    setScanning(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setScanning(false);
      setScan({ kind, value: v.toLowerCase(), ...sysScanRuns(Store.get(), v) });
    }, 700);
  };
  const submit = async () => {
    setTouched({ value: true, reason: true });
    if (errors.value || errors.reason || !current) return;
    const n = current.runIds.length;
    if (n && !(await confirmDialog({ title: `删除 ${fmt.number(n)} 条运行记录里的个人数据？`, content: '删除后不能恢复。运行记录会保留状态、耗时和错误码，入参和出参里的数据会被清除。', okText: '删除', danger: true }))) return;
    const subject = name.trim() ? `${name.trim()}（${v}）` : v;
    const req = { id: uid('er'), subject, kind, value: v, reason: reason.trim(), requestedBy: Store.get().me, requestedAt: Date.now(), status: n ? 'processing' : 'done', affected: n, runIds: current.runIds, doneAt: n ? null : Date.now() };
    Store.set((s) => ({ ...s, privacy: { ...s.privacy, erasureRequests: [req, ...((s.privacy && s.privacy.erasureRequests) || [])] } }));
    addAudit('发起个人数据删除', `${subject} · ${n} 条运行记录`);
    if (n) {
      setTimeout(() => {
        sysPatchErasure(req.id, { status: 'done', doneAt: Date.now() });
        addAudit('完成个人数据删除', `${subject} · 已清除 ${n} 条运行记录`);
        sysNotify('个人数据删除已完成', `${subject}：已清除 ${n} 条运行记录中的数据`, '/admin/privacy');
      }, 1800);
      toast.info('已提交，正在清除数据');
    } else {
      toast.success('已记录请求，没有需要删除的数据');
    }
    onClose();
  };
  const show = (k) => (touched[k] ? errors[k] : null);
  const n = current ? current.runIds.length : 0;
  return html`<${Modal} open=${true} onClose=${onClose} title="新建个人数据删除请求" description="在运行日志的入参和出参里查找这个人，删除找到的数据" width=${600} footer=${html`<${Fragment}>
    <${Button} onClick=${onClose}>取消<//>
    <${Button} variant=${n ? 'danger' : 'primary'} disabled=${!current} onClick=${submit}>${!current ? '先查找运行记录' : n ? `删除 ${fmt.number(n)} 条记录中的数据` : '只记录这次请求'}<//>
  <//>`}>
    <${Field} label="查找方式"><${Segmented} value=${kind} onChange=${(k) => { setKind(k); setScan(null); }} options=${SYS_ERASURE_KINDS.map((k) => ({ value: k.value, label: k.label }))} /><//>
    <div className="form-grid">
      <${Field} label=${meta.label} required error=${show('value')}><${Input} mono value=${value} onChange=${(x) => { setValue(x); setTouched({ ...touched, value: true }); }} placeholder=${meta.placeholder} invalid=${Boolean(show('value'))} autoFocus onKeyDown=${(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) find(); }} /><//>
      <${Field} label="姓名" hint="可选，方便在列表里辨认"><${Input} value=${name} onChange=${(x) => setName(x.slice(0, 20))} placeholder="例如：许诺" /><//>
    </div>
    <${Field} label="删除依据" required error=${show('reason')}><${CharTextarea} rows=${2} max=${100} value=${reason} onChange=${(x) => { setReason(x); setTouched({ ...touched, reason: true }); }} placeholder="例如：员工离职后申请删除个人信息，工单 HR-2031" invalid=${Boolean(show('reason'))} /><//>
    <div className="row sys-erasure-find">
      <${Button} icon="ScanSearch" loading=${scanning} onClick=${find}>查找运行记录<//>
      <span className="text-xs muted">在全部项目的运行日志里查找，包括调试运行</span>
    </div>
    ${current && html`<div className="sys-erasure-result">
      ${n
        ? html`<${Alert} tone="warning" title=${`在 ${fmt.number(n)} 条运行记录里找到「${v}」`}>
          <div>涉及 ${current.workflows.length} 个工作流：${current.workflows.map((w) => `${w.name}（${w.count}）`).join('、')}</div>
          <div>时间范围：${fmt.short(current.first)} 到 ${fmt.short(current.last)}</div>
          <div>删除后运行记录保留状态、耗时和错误码，入参和出参里的数据会被清除。</div>
        <//>`
        : html`<${Alert} tone="info" title="没有找到包含这个值的运行记录">可以只记录这次请求，作为已处理的凭据。<//>`}
      ${current.skipped > 0 && html`<div className="text-xs muted sys-erasure-skip">另有 ${current.skipped} 条记录已经在之前的删除请求里处理过。</div>`}
    </div>`}
  <//>`;
}
