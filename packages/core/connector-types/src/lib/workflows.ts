/**
 * A minimal workflow summary used by the connectors framework context.
 * This avoids a dependency on the full PopulatedWorkflow type from @fema-ipaas/shared,
 * which carries a large transitive graph. Every field here must exist on the payload the
 * engine actually returns — a workflow carries no top-level display name, only its version does.
 */
export type PopulatedWorkflowSummary = {
    id: string
    externalId?: string
    projectId?: string
    status?: string
    version: {
        id: string
        displayName: string
        valid: boolean
    }
}
