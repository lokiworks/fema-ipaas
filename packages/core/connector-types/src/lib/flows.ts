/**
 * A minimal flow summary used by the connectors framework context.
 * This avoids a dependency on the full PopulatedFlow type from @fema/shared,
 * which carries a large transitive graph. Connectors only need these fields for listing flows.
 */
export type PopulatedFlowSummary = {
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
