import { apId } from '@fema/core-utils'
import { FileCompression, FileType, PrincipalType } from '@fema/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { vi } from 'vitest'
import { fileService } from '../../../../src/app/file/file.service'
import { filesService } from '../../../../src/app/file/files-service'
import { generateMockToken } from '../../../helpers/auth'
import { mockAndSaveBasicSetup } from '../../../helpers/mocks'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

describe('Files Controller', () => {
    describe('PUT /v1/files/:fileId', () => {
        it('proxies the body, saves the file, and returns a readUrl + X-AP-File-Read-Url header', async () => {
            vi.useFakeTimers({ shouldAdvanceTime: true })
            vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
            try {
                const { mockWorkspace, mockTenant } = await mockAndSaveBasicSetup()
                const engineToken = await generateMockToken({
                    type: PrincipalType.ENGINE,
                    id: apId(),
                    workspaceId: mockWorkspace.id,
                    tenant: { id: mockTenant.id },
                })
                const fileId = apId()
                const body = Buffer.from('hello world from a step file')

                const response = await app!.inject({
                    method: 'PUT',
                    url: `/api/v1/files/${fileId}`,
                    query: { token: engineToken },
                    headers: {
                        'content-type': 'application/octet-stream',
                        'x-ap-file-type': FileType.WORKFLOW_STEP_FILE,
                        'x-ap-file-name': 'hello.txt',
                    },
                    payload: body,
                })

                expect(response?.statusCode).toBe(StatusCodes.OK)
                const json = response?.json()
                expect(json.fileId).toBe(fileId)
                expect(json.readUrl).toContain(`/v1/files/${fileId}?token=`)
                expect(response?.headers['x-ap-file-read-url']).toBe(json.readUrl)
            }
            finally {
                vi.useRealTimers()
            }
        })

        it('streams the body to storage and returns identical bytes on download', async () => {
            const { mockWorkspace, mockTenant } = await mockAndSaveBasicSetup()
            const engineToken = await generateMockToken({
                type: PrincipalType.ENGINE,
                id: apId(),
                workspaceId: mockWorkspace.id,
                tenant: { id: mockTenant.id },
            })
            const fileId = apId()
            const body = Buffer.from('streamed-content-'.repeat(5000))

            const putResponse = await app!.inject({
                method: 'PUT',
                url: `/api/v1/files/${fileId}`,
                query: { token: engineToken },
                headers: {
                    'content-type': 'application/octet-stream',
                    'x-ap-file-type': FileType.WORKFLOW_STEP_FILE,
                    'x-ap-file-name': 'big.txt',
                },
                payload: body,
            })
            expect(putResponse?.statusCode).toBe(StatusCodes.OK)

            const readUrl = new URL(putResponse!.json().readUrl)
            const getResponse = await app!.inject({
                method: 'GET',
                url: readUrl.pathname + readUrl.search,
            })
            expect(getResponse?.statusCode).toBe(StatusCodes.OK)
            expect(getResponse!.rawPayload.equals(body)).toBe(true)
        })

        it('rejects a body that exceeds the maximum file size while streaming', async () => {
            const originalMaxFileSize = process.env.FEMA_MAX_FILE_SIZE_MB
            process.env.FEMA_MAX_FILE_SIZE_MB = '0.000001'
            try {
                const { mockWorkspace, mockTenant } = await mockAndSaveBasicSetup()
                const engineToken = await generateMockToken({
                    type: PrincipalType.ENGINE,
                    id: apId(),
                    workspaceId: mockWorkspace.id,
                    tenant: { id: mockTenant.id },
                })

                const response = await app!.inject({
                    method: 'PUT',
                    url: `/api/v1/files/${apId()}`,
                    query: { token: engineToken },
                    headers: {
                        'content-type': 'application/octet-stream',
                        'x-ap-file-type': FileType.WORKFLOW_STEP_FILE,
                    },
                    payload: Buffer.from('x'.repeat(1024)),
                })
                expect(response?.statusCode).not.toBe(StatusCodes.OK)
            }
            finally {
                if (originalMaxFileSize === undefined) {
                    delete process.env.FEMA_MAX_FILE_SIZE_MB
                }
                else {
                    process.env.FEMA_MAX_FILE_SIZE_MB = originalMaxFileSize
                }
            }
        })

        it('rejects a request whose token is not an engine principal', async () => {
            const { mockWorkspace, mockTenant } = await mockAndSaveBasicSetup()
            const userToken = await generateMockToken({
                type: PrincipalType.USER,
                id: apId(),
                workspaceId: mockWorkspace.id,
                tenant: { id: mockTenant.id },
                tokenVersion: undefined,
            } as never)
            const fileId = apId()

            const response = await app!.inject({
                method: 'PUT',
                url: `/api/v1/files/${fileId}`,
                query: { token: userToken },
                headers: {
                    'content-type': 'application/octet-stream',
                    'x-ap-file-type': FileType.WORKFLOW_STEP_FILE,
                },
                payload: Buffer.from('x'),
            })

            expect(response?.statusCode).toBe(StatusCodes.UNAUTHORIZED)
        })

        it('rejects a request without X-AP-File-Type', async () => {
            const { mockWorkspace, mockTenant } = await mockAndSaveBasicSetup()
            const engineToken = await generateMockToken({
                type: PrincipalType.ENGINE,
                id: apId(),
                workspaceId: mockWorkspace.id,
                tenant: { id: mockTenant.id },
            })

            const response = await app!.inject({
                method: 'PUT',
                url: `/api/v1/files/${apId()}`,
                query: { token: engineToken },
                headers: {
                    'content-type': 'application/octet-stream',
                },
                payload: Buffer.from('x'),
            })

            expect([
                StatusCodes.BAD_REQUEST,
                StatusCodes.CONFLICT,
                StatusCodes.INTERNAL_SERVER_ERROR,
            ]).toContain(response?.statusCode)
        })

        it('rejects an unsupported X-AP-File-Type', async () => {
            const { mockWorkspace, mockTenant } = await mockAndSaveBasicSetup()
            const engineToken = await generateMockToken({
                type: PrincipalType.ENGINE,
                id: apId(),
                workspaceId: mockWorkspace.id,
                tenant: { id: mockTenant.id },
            })

            const response = await app!.inject({
                method: 'PUT',
                url: `/api/v1/files/${apId()}`,
                query: { token: engineToken },
                headers: {
                    'content-type': 'application/octet-stream',
                    'x-ap-file-type': FileType.SAMPLE_DATA,
                },
                payload: Buffer.from('x'),
            })

            expect([
                StatusCodes.BAD_REQUEST,
                StatusCodes.CONFLICT,
                StatusCodes.INTERNAL_SERVER_ERROR,
            ]).toContain(response?.statusCode)
        })
    })

    describe('GET /v1/files/:fileId', () => {
        it('returns the bytes when called with the per-file FILE_READ token', async () => {
            const { mockWorkspace, mockTenant } = await mockAndSaveBasicSetup()
            const engineToken = await generateMockToken({
                type: PrincipalType.ENGINE,
                id: apId(),
                workspaceId: mockWorkspace.id,
                tenant: { id: mockTenant.id },
            })
            const fileId = apId()
            const body = Buffer.from('downloadable content', 'utf-8')

            const putResponse = await app!.inject({
                method: 'PUT',
                url: `/api/v1/files/${fileId}`,
                query: { token: engineToken },
                headers: {
                    'content-type': 'application/octet-stream',
                    'x-ap-file-type': FileType.WORKFLOW_STEP_FILE,
                },
                payload: body,
            })
            expect(putResponse?.statusCode).toBe(StatusCodes.OK)
            const readUrl = putResponse!.json().readUrl as string
            const readToken = new URL(readUrl).searchParams.get('token') as string

            const getResponse = await app!.inject({
                method: 'GET',
                url: `/api/v1/files/${fileId}`,
                query: { token: readToken },
            })

            expect(getResponse?.statusCode).toBe(StatusCodes.OK)
            expect(getResponse?.rawPayload.toString('utf-8')).toBe('downloadable content')
        })

        it('returns the bytes when called with the engine principal token', async () => {
            const { mockWorkspace, mockTenant } = await mockAndSaveBasicSetup()
            const engineToken = await generateMockToken({
                type: PrincipalType.ENGINE,
                id: apId(),
                workspaceId: mockWorkspace.id,
                tenant: { id: mockTenant.id },
            })
            const fileId = apId()
            const body = Buffer.from('engine read', 'utf-8')

            await app!.inject({
                method: 'PUT',
                url: `/api/v1/files/${fileId}`,
                query: { token: engineToken },
                headers: {
                    'content-type': 'application/octet-stream',
                    'x-ap-file-type': FileType.EXECUTION_LOG_SLICE,
                },
                payload: body,
            })

            const getResponse = await app!.inject({
                method: 'GET',
                url: `/api/v1/files/${fileId}`,
                query: { token: engineToken },
            })

            expect(getResponse?.statusCode).toBe(StatusCodes.OK)
            expect(getResponse?.rawPayload.toString('utf-8')).toBe('engine read')
        })

        it.each([
            { type: FileType.EXECUTION_LOG_SLICE, extension: 'json' },
            { type: FileType.WORKFLOW_STEP_FILE, extension: 'bin' },
        ])('names an unnamed $type download <id>.$extension', async ({ type, extension }) => {
            const { mockWorkspace, mockTenant } = await mockAndSaveBasicSetup()
            const engineToken = await generateMockToken({
                type: PrincipalType.ENGINE,
                id: apId(),
                workspaceId: mockWorkspace.id,
                tenant: { id: mockTenant.id },
            })
            const fileId = apId()

            await app!.inject({
                method: 'PUT',
                url: `/api/v1/files/${fileId}`,
                query: { token: engineToken },
                headers: {
                    'content-type': 'application/octet-stream',
                    'x-ap-file-type': type,
                },
                payload: Buffer.from('{"rows":[]}', 'utf-8'),
            })

            const getResponse = await app!.inject({
                method: 'GET',
                url: `/api/v1/files/${fileId}`,
                query: { token: engineToken },
            })

            expect(getResponse?.statusCode).toBe(StatusCodes.OK)
            expect(getResponse?.headers['content-disposition']).toBe(`attachment; filename="${fileId}.${extension}"`)
            expect(getResponse?.headers['x-content-type-options']).toBe('nosniff')
        })

        it('keeps the uploaded name when the file has one', async () => {
            const { mockWorkspace, mockTenant } = await mockAndSaveBasicSetup()
            const engineToken = await generateMockToken({
                type: PrincipalType.ENGINE,
                id: apId(),
                workspaceId: mockWorkspace.id,
                tenant: { id: mockTenant.id },
            })
            const fileId = apId()

            await app!.inject({
                method: 'PUT',
                url: `/api/v1/files/${fileId}`,
                query: { token: engineToken },
                headers: {
                    'content-type': 'application/octet-stream',
                    'x-ap-file-type': FileType.WORKFLOW_STEP_FILE,
                    'x-ap-file-name': 'invoice.pdf',
                },
                payload: Buffer.from('%PDF-1.4', 'utf-8'),
            })

            const getResponse = await app!.inject({
                method: 'GET',
                url: `/api/v1/files/${fileId}`,
                query: { token: engineToken },
            })

            expect(getResponse?.headers['content-disposition']).toBe('attachment; filename="invoice.pdf"')
        })

        it.each([
            { fileName: 'résumé.pdf', expected: 'attachment; filename="résumé.pdf"' },
            { fileName: '報告書.json', expected: 'attachment; filename="???.json"; filename*=UTF-8\'\'%E5%A0%B1%E5%91%8A%E6%9B%B8.json' },
            { fileName: 'evil\r\nX-Injected: 1.json', expected: 'attachment; filename="evil??X-Injected: 1.json"; filename*=UTF-8\'\'evil%0D%0AX-Injected%3A%201.json' },
        ])('escapes $fileName in the disposition header without emitting a raw newline', async ({ fileName, expected }) => {
            const { mockWorkspace, mockTenant } = await mockAndSaveBasicSetup()
            const file = await fileService(app!.log).save({
                workspaceId: mockWorkspace.id,
                tenantId: mockTenant.id,
                type: FileType.WORKFLOW_STEP_FILE,
                compression: FileCompression.NONE,
                fileName,
                data: Buffer.from('payload', 'utf-8'),
            })
            const readUrl = await filesService.constructReadUrl({
                fileId: file.id,
                fileType: FileType.WORKFLOW_STEP_FILE,
                tenantId: mockTenant.id,
            })

            const getResponse = await app!.inject({
                method: 'GET',
                url: `/api/v1/files/${file.id}`,
                query: { token: new URL(readUrl).searchParams.get('token') as string },
            })

            expect(getResponse?.statusCode).toBe(StatusCodes.OK)
            expect(getResponse?.headers['content-disposition']).toBe(expected)
            expect(getResponse?.headers['content-disposition']).not.toMatch(/[\r\n]/)
        })

        it('rejects a download with a read token bound to a different fileId', async () => {
            const otherFileReadUrl = await filesService.constructReadUrl({
                fileId: apId(),
                fileType: FileType.WORKFLOW_STEP_FILE,
                tenantId: null,
            })
            const otherFileToken = new URL(otherFileReadUrl).searchParams.get('token') as string

            const response = await app!.inject({
                method: 'GET',
                url: `/api/v1/files/${apId()}`,
                query: { token: otherFileToken },
            })

            expect(response?.statusCode).toBe(StatusCodes.UNAUTHORIZED)
        })
    })

    describe('GET /v1/step-files/signed (backward-compat alias)', () => {
        it('resolves an old-shape signed step-file URL', async () => {
            const { mockWorkspace, mockTenant } = await mockAndSaveBasicSetup()
            const engineToken = await generateMockToken({
                type: PrincipalType.ENGINE,
                id: apId(),
                workspaceId: mockWorkspace.id,
                tenant: { id: mockTenant.id },
            })
            const fileId = apId()

            await app!.inject({
                method: 'PUT',
                url: `/api/v1/files/${fileId}`,
                query: { token: engineToken },
                headers: {
                    'content-type': 'application/octet-stream',
                    'x-ap-file-type': FileType.WORKFLOW_STEP_FILE,
                    'x-ap-file-name': 'attachment.bin',
                },
                payload: Buffer.from('legacy reader'),
            })

            const oldUrl = await filesService.constructReadUrl({
                fileId,
                fileType: FileType.WORKFLOW_STEP_FILE,
                tenantId: mockTenant.id,
            })
            const readToken = new URL(oldUrl).searchParams.get('token') as string

            const response = await app!.inject({
                method: 'GET',
                url: '/api/v1/step-files/signed',
                query: { token: readToken },
            })

            // The alias either streams the bytes (DB storage) or redirects to S3.
            expect([StatusCodes.OK, StatusCodes.TEMPORARY_REDIRECT, StatusCodes.MOVED_TEMPORARILY]).toContain(response?.statusCode)
        })
    })
})
