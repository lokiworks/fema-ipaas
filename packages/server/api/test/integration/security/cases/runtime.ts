import { DomainModule, Review } from '../support/route-review'
import { runtimeExecutionCases } from './runtime-executions'
import { runtimeAlertAuditCases } from './runtime-infra'
import { runtimeIssueCases } from './runtime-issues'
import { runtimePlatformCases } from './runtime-platform'
import { runtimeRunCases } from './runtime-runs'
import { runtimeTenantCases } from './runtime-tenant'

const memberScoped = (note: string): Review => ({ verdict: 'ok', note })

export const runtimeDomain: DomainModule = {
    cases: [
        ...runtimeExecutionCases,
        ...runtimeRunCases,
        ...runtimeIssueCases,
        ...runtimeTenantCases,
        ...runtimeAlertAuditCases,
        ...runtimePlatformCases,
    ],
    reviews: {
        'GET /v1/run-logs': memberScoped('服务层先用 memberProjectIds 解析用户可见项目（租户管理员为全部、其他人为所属或自己拥有的项目），再按这些项目和各自保留期过滤；请求里的 projectId 与可见项目取交集'),
        'GET /v1/run-logs/scope': memberScoped('只返回 memberProjectIds 解析出的项目、这些项目里的流程和连接器名，没有成员关系时返回空'),
        'POST /v1/run-logs/rerun': memberScoped('只在 memberProjectIds 内查找运行记录，找不到的 id 当作不存在；每条再按项目内角色是否含 WRITE_RUN 判定 canRerun，没有写权限的返回 VIEW_ONLY 而不执行重跑'),
        'GET /v1/run-monitor/summary': memberScoped('resolveScope 把请求的 projectIds 与 memberProjectIds 取交集，没有传时用全部可见项目，SQL 全部按这个范围过滤'),
        'GET /v1/run-monitor/ai-usage': memberScoped('与 summary 共用 resolveScope，AI 用量按可见项目过滤'),
        'GET /v1/run-monitor/options': memberScoped('项目和流程列表只来自 memberProjectIds'),
        'GET /v1/run-monitor/views': memberScoped('视图按 tenantId + userId 过滤，只有自己的'),
        'POST /v1/run-monitor/views': memberScoped('视图归属当前用户和租户，数量与重名在服务层限制；视图配置里的项目 id 只是筛选条件，读数据时仍会与可见项目取交集'),
        'POST /v1/run-monitor/views/:id': memberScoped('getOneOrThrow 按 id + tenantId + userId 取，别人的视图得到 404'),
        'DELETE /v1/run-monitor/views/:id': memberScoped('同更新，按 id + tenantId + userId 取，别人的视图得到 404'),
        'GET /v1/home/summary': memberScoped('accessibleProjectIds 按租户管理员/所有者/成员解析，所有统计、失败运行、待办都在这些项目里查；待办还要求当前用户在审批人里'),
        'GET /v1/global-search': memberScoped('项目类结果限定在 memberProjectIds，连接、MCP 服务、MCP server 走各自按成员/共享过滤的列表，模板按租户与可见性过滤'),
        'GET /v1/issues/overview': memberScoped('projectsWithPermission 按 ISSUE:READ 解析项目，问题只在这些项目里查，请求的 projectId 只是再收窄'),
        'GET /v1/notifications': memberScoped('按 recipientId + tenantId 过滤，只有自己的通知'),
        'GET /v1/notifications/unread-count': memberScoped('按 recipientId + tenantId 计数'),
        'POST /v1/notifications/:id/read': memberScoped('更新条件带 recipientId + tenantId，别人的通知不会被改动'),
        'POST /v1/notifications/read-all': memberScoped('更新条件带 recipientId + tenantId，只改自己的'),
        'POST /v1/agent-approvals/:id/decide': { verdict: 'fixed', note: 'AU-R1：原权限 EXECUTION:READ（Viewer 也有），审批人是工作流所有者与项目所有者，被降为查看者后仍能批准智能体动作；改为 EXECUTION:EXECUTE，服务层仍校验审批人名单' },
        'POST /v1/encryption/rotate': { verdict: 'fixed', note: 'AU-R2：轮换会重写所有租户的连接和变量并返回全实例的行数，原先任何租户的管理员都能触发；现在与 worker 的排空/恢复/移除一样，只允许主租户（最早创建的租户）的管理员' },
        'POST /v1/health/backup-confirmation': { verdict: 'fixed', note: 'AU-R2：备份确认是写全实例标志，原先任何租户的管理员都能写；现在只允许主租户的管理员' },
        'GET /v1/encryption/status': { verdict: 'needs-decision', note: '全实例的密钥来源和指纹，租户管理员即可读。自托管下租户管理员即运维者，是否限主租户需产品决定' },
        'GET /v1/worker-machines': { verdict: 'needs-decision', note: '全实例 worker 清单对任何租户管理员可读（修改类已限主租户），是否一并限主租户需产品决定' },
        'GET /v1/health/diagnostics': { verdict: 'needs-decision', note: '基础设施延迟、S3 端点等全实例信息对任何租户管理员可读，代码注释写明按自托管运维者假设，是否限主租户需产品决定' },
        'POST /v1/executions/:id/reveal': memberScoped('权限是 EXECUTION:READ，但服务层 assertCanReveal 再按租户隐私设置里的 rawViewRoles（默认只有所有者和管理员）与是否必须填写理由校验，查看者和普通成员得到 403'),
    },
    exemptions: {},
}
