import { Review } from '../support/route-review'

export const workspaceReviews: Record<string, Review> = {
    'GET /v1/workflows/:workflowId/versions': { verdict: 'ok', note: '项目路由按流程所属项目校验成员关系，只读版本列表；查看者本就有 WORKFLOW:READ，跨项目 / 跨租户由矩阵 IDOR 验证' },
    'POST /v1/project-workspace/workflows/:id/copy': { verdict: 'ok', note: '源流程需 WORKFLOW:READ，目标项目在处理函数里再校验 WORKFLOW:UPDATE（assertPrincipalCanAccessProject）；矩阵 workspace-folders 验证' },
    'GET /v1/trigger-runs/status': { verdict: 'ok', note: '只返回令牌租户的触发器运行统计' },
    'GET /v1/solutions': { verdict: 'ok', note: 'visibleSolutions 只列租户可见、本人创建或有源项目读权限的方案' },
    'GET /v1/solutions/:id': { verdict: 'ok', note: 'findVisibleOrThrow 按同一可见性规则取，不可见 404' },
    'GET /v1/solutions/installs': { verdict: 'ok', note: '按令牌租户与可访问项目过滤' },
    'POST /v1/solutions/:id/versions': { verdict: 'fixed', note: 'AU-W-5：创建人被降为查看者或退出源项目后仍能重新打包。现在发布新版本还要求对源项目有 WORKFLOW:UPDATE，否则 403；非创建人得 403 而不是校验错误' },
    'POST /v1/solutions/installs/:installId/upgrade': { verdict: 'ok', note: '升级目标项目需 WORKFLOW:UPDATE（projectsWithPermission）；矩阵 workspace-solutions 验证' },
    'POST /v1/templates': { verdict: 'needs-decision', note: 'CUSTOM 类型要租户管理员；SHARED 类型任何成员都能建（旧分享链接），无创建人记录、不能删，按 id 全员可读，是否保留需产品确认' },
    'POST /v1/templates/:id': { verdict: 'ok', note: 'assertCanManageTemplate：官方 / 共享不可改，自定义要求同租户且是管理员或创建人；别的租户 403（deep/machine-public.test.ts）' },
    'DELETE /v1/templates/:id': { verdict: 'ok', note: '同更新' },
    'POST /v1/templates/:id/usage': { verdict: 'ok', note: '只对可见模板计数，增量按令牌租户记录' },
    'POST /v1/ai/copilot': { verdict: 'ok', note: '只读问答，不改数据；模型连接现在按调用人的连接权限校验（AU-I-02）' },
    'POST /v1/connectors/options': { verdict: 'fixed', note: 'AU-I-06：任何项目成员（含查看者）都能让 worker 用流程的连接去第三方取下拉选项。现在要 WORKFLOW:UPDATE（矩阵 integrations-connectors 的 operator / viewer 用例，修复前请求通过授权后等 worker 超时）' },
}
