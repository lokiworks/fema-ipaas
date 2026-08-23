ALL database queries MUST filter by `workspaceId` or `tenantId` — the hierarchy is Tenant → Workspace (design doc section 19).
Never trust a `workspaceId` sent by the client as the security boundary; derive it from the authenticated principal.
For connections with multi-workspace access, use `ArrayContains([workspaceId])` on the `workspaceIds` array column.
