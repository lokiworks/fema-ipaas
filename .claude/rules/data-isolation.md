ALL database queries MUST filter by `projectId` or `tenantId` — the hierarchy is Tenant → Project (design doc section 19).
Never trust a `projectId` sent by the client as the security boundary; derive it from the authenticated principal.
For connections with multi-project access, use `ArrayContains([projectId])` on the `projectIds` array column.
