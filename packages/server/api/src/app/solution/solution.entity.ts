import { Project, Solution, SolutionInstall, SolutionPackage, Tenant } from '@fema-ipaas/shared'
import { EntitySchema } from 'typeorm'
import { BaseColumnSchemaPart, EntityIdSchema } from '../database/database-common'

export type SolutionSchema = Solution & {
    tenant?: Tenant
}

export type SolutionVersionSchema = {
    id: string
    created: string
    updated: string
    solutionId: string
    version: string
    notes: string
    package: SolutionPackage
    publishedBy: string
    solution?: SolutionSchema
}

export type SolutionInstallSchema = Omit<SolutionInstall, 'latestVersion' | 'solutionName'> & {
    solutionName: string
    project?: Project
}

export const SolutionEntity = new EntitySchema<SolutionSchema>({
    name: 'solution',
    columns: {
        ...BaseColumnSchemaPart,
        tenantId: {
            ...EntityIdSchema,
            nullable: true,
        },
        provider: {
            type: String,
        },
        name: {
            type: String,
        },
        summary: {
            type: String,
        },
        category: {
            type: String,
        },
        visibility: {
            type: String,
        },
        sourceProjectId: {
            ...EntityIdSchema,
            nullable: true,
        },
        currentVersion: {
            type: String,
        },
        createdBy: {
            ...EntityIdSchema,
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_solution_tenant_id',
            columns: ['tenantId'],
        },
    ],
    relations: {
        tenant: {
            type: 'many-to-one',
            target: 'tenant',
            cascade: true,
            onDelete: 'CASCADE',
            nullable: true,
            joinColumn: {
                name: 'tenantId',
                referencedColumnName: 'id',
                foreignKeyConstraintName: 'fk_solution_tenant_id',
            },
        },
    },
})

export const SolutionVersionEntity = new EntitySchema<SolutionVersionSchema>({
    name: 'solution_version',
    columns: {
        ...BaseColumnSchemaPart,
        solutionId: EntityIdSchema,
        version: {
            type: String,
        },
        notes: {
            type: String,
        },
        package: {
            type: 'jsonb',
        },
        publishedBy: EntityIdSchema,
    },
    indices: [
        {
            name: 'idx_solution_version_solution_id_version',
            columns: ['solutionId', 'version'],
            unique: true,
        },
    ],
    relations: {
        solution: {
            type: 'many-to-one',
            target: 'solution',
            cascade: true,
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'solutionId',
                referencedColumnName: 'id',
                foreignKeyConstraintName: 'fk_solution_version_solution_id',
            },
        },
    },
})

export const SolutionInstallEntity = new EntitySchema<SolutionInstallSchema>({
    name: 'solution_install',
    columns: {
        ...BaseColumnSchemaPart,
        tenantId: EntityIdSchema,
        projectId: EntityIdSchema,
        solutionId: {
            type: String,
        },
        solutionName: {
            type: String,
        },
        version: {
            type: String,
        },
        config: {
            type: 'jsonb',
        },
        connections: {
            type: 'jsonb',
        },
        workflowIds: {
            type: String,
            array: true,
        },
        mappingTableIds: {
            type: String,
            array: true,
        },
        skippedChecks: {
            type: String,
            array: true,
        },
        installedBy: EntityIdSchema,
    },
    indices: [
        {
            name: 'idx_solution_install_project_id',
            columns: ['projectId'],
        },
        {
            name: 'idx_solution_install_tenant_id_solution_id',
            columns: ['tenantId', 'solutionId'],
        },
    ],
    relations: {
        project: {
            type: 'many-to-one',
            target: 'project',
            cascade: true,
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'projectId',
                referencedColumnName: 'id',
                foreignKeyConstraintName: 'fk_solution_install_project_id',
            },
        },
    },
})
