/**
 * A minimal workflow summary used by the connectors framework context.
 * This avoids a dependency on the full PopulatedWorkflow type from @fema-ipaas/shared,
 * which carries a large transitive graph. Connectors only need these fields for listing workflows.
 */
export type PopulatedWorkflowSummary = {
    id: string
    externalId?: string
    displayName: string
    status?: string
    version: {
        id?: string
        displayName: string
        valid?: boolean
    }
}
