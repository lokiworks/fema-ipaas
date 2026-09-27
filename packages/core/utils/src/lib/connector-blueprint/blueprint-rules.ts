import { isNil } from '../utils'
import {
    BlueprintAuth,
    BlueprintAuthField,
    BlueprintAuthFieldControl,
    BlueprintAuthFlowStep,
    BlueprintAuthType,
    BlueprintBodyType,
    BlueprintCredentialLocation,
    BlueprintHttpMethod,
    BlueprintInput,
    BlueprintInputControl,
    BlueprintOperation,
    BlueprintOptionsSource,
    BlueprintPagination,
    BlueprintRequestConfig,
    BlueprintStatusConfig,
    BlueprintTrigger,
    BlueprintTriggerType,
    BlueprintValueType,
    ConnectorBlueprintDefinition,
} from './blueprint-definition'
import { blueprintExpression } from './blueprint-expression'
import { blueprintStatus } from './blueprint-status'
import { blueprintTemplate } from './blueprint-template'

export const blueprintRules = {
    isValidIdentifier(identifier: string): boolean {
        return IDENTIFIER_REGEX.test(identifier) && identifier.length <= BLUEPRINT_LIMITS.identifier
    },
    isValidKey(key: string): boolean {
        return IDENTIFIER_REGEX.test(key) && key.length <= BLUEPRINT_LIMITS.key
    },
    isValidFieldKey(key: string): boolean {
        return FIELD_KEY_REGEX.test(key) && key.length <= BLUEPRINT_LIMITS.key
    },
    isHttpUrl(url: string): boolean {
        return HTTP_URL_REGEX.test(url.trim())
    },
    isValidRegex(pattern: string): boolean {
        try {
            new RegExp(pattern)
            return true
        }
        catch {
            return false
        }
    },
    connectorNameOf(identifier: string): string {
        return `${CUSTOM_CONNECTOR_PREFIX}${identifier.replace(/_/g, '-')}`
    },
    isBlueprintConnectorName(name: string): boolean {
        return name.startsWith(CUSTOM_CONNECTOR_PREFIX)
    },
    uniqueKey({ base, taken }: { base: string, taken: string[] }): string {
        const candidates = Array.from({ length: taken.length + 2 }, (_value, index) => (index === 0 ? base : `${base}${index + 1}`))
        return candidates.find((candidate) => !taken.includes(candidate)) ?? `${base}_${taken.length + 2}`
    },
    slug(value: string): string {
        const slug = value
            .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
        const prefixed = /^[a-z]/.test(slug) ? slug : `op_${slug}`
        return prefixed.replace(/_+$/g, '').slice(0, BLUEPRINT_LIMITS.identifier)
    },
}

export const blueprintVersions = {
    parse(version: string): [number, number] | null {
        const match = /^(\d{1,3})\.(\d{1,3})$/.exec(version.trim())
        return isNil(match) ? null : [Number(match[1]), Number(match[2])]
    },
    compare({ left, right }: { left: string, right: string }): number {
        const a = left.split('.').map(Number)
        const b = right.split('.').map(Number)
        const index = [0, 1, 2].find((position) => (a[position] || 0) !== (b[position] || 0))
        return isNil(index) ? 0 : (a[index] || 0) - (b[index] || 0)
    },
    highest(versions: string[]): string | null {
        return versions.reduce<string | null>((best, version) => (isNil(best) || blueprintVersions.compare({ left: version, right: best }) > 0 ? version : best), null)
    },
    suggestNext(versions: string[]): string {
        const top = blueprintVersions.highest(versions)
        const parsed = isNil(top) ? null : blueprintVersions.parse(blueprintVersions.displayOf(top))
        return isNil(parsed) ? '1.0' : `${parsed[0]}.${parsed[1] + 1}`
    },
    newVersionError({ version, existing }: { version: string, existing: string[] }): BlueprintVersionError | null {
        const parsed = blueprintVersions.parse(version)
        if (isNil(parsed) || (parsed[0] === 0 && parsed[1] === 0)) {
            return BlueprintVersionError.FORMAT
        }
        const top = blueprintVersions.highest(existing)
        if (!isNil(top) && blueprintVersions.compare({ left: version.trim(), right: blueprintVersions.displayOf(top) }) <= 0) {
            return BlueprintVersionError.NOT_GREATER
        }
        return null
    },
    packageVersionOf({ version, patch }: { version: string, patch: number }): string {
        return `${version.trim()}.${patch}`
    },
    displayOf(packageVersion: string): string {
        return packageVersion.split('.').slice(0, 2).join('.')
    },
    patchOf(packageVersion: string): number {
        return Number(packageVersion.split('.')[2] ?? 0)
    },
    nextStatus({ status, action }: { status: BlueprintVersionStatus, action: BlueprintVersionAction }): BlueprintVersionStatus | null {
        switch (action) {
            case BlueprintVersionAction.PROMOTE:
                return status === BlueprintVersionStatus.CANARY ? BlueprintVersionStatus.FULL : null
            case BlueprintVersionAction.STOP_CANARY:
                return status === BlueprintVersionStatus.CANARY ? BlueprintVersionStatus.STOPPED : null
            case BlueprintVersionAction.STOP:
                return status === BlueprintVersionStatus.FULL ? BlueprintVersionStatus.STOPPED : null
            case BlueprintVersionAction.RESTORE:
                return status === BlueprintVersionStatus.STOPPED ? BlueprintVersionStatus.FULL : null
        }
    },
}

export const blueprintAvailability = {
    isRunnable({ rules, packageVersion, projectId }: RunnableParams): boolean {
        const rule = rules.find((candidate) => candidate.version === blueprintVersions.displayOf(packageVersion))
        if (isNil(rule) || rule.status !== BlueprintVersionStatus.CANARY || isNil(projectId)) {
            return true
        }
        return rule.canaryProjectIds.includes(projectId)
    },
    pickSelectable({ rules, packageVersions, projectId }: SelectableParams): string | null {
        if (rules.length === 0) {
            return blueprintVersions.highest(packageVersions)
        }
        const selectable = packageVersions.filter((packageVersion) => {
            const rule = rules.find((candidate) => candidate.version === blueprintVersions.displayOf(packageVersion))
            if (isNil(rule)) {
                return false
            }
            switch (rule.status) {
                case BlueprintVersionStatus.FULL:
                    return true
                case BlueprintVersionStatus.CANARY:
                    return !isNil(projectId) && rule.canaryProjectIds.includes(projectId)
                case BlueprintVersionStatus.STOPPED:
                    return false
            }
        })
        return blueprintVersions.highest(selectable)
    },
    connectorState(rules: BlueprintVersionRule[]): { state: BlueprintConnectorState, currentVersion: string | null } {
        const live = rules.filter((rule) => rule.status !== BlueprintVersionStatus.STOPPED)
        const full = live.filter((rule) => rule.status === BlueprintVersionStatus.FULL)
        const pool = full.length > 0 ? full : live
        const current = blueprintVersions.highest(pool.map((rule) => rule.version))
        if (live.length > 0) {
            return { state: BlueprintConnectorState.PUBLISHED, currentVersion: current }
        }
        return { state: rules.length > 0 ? BlueprintConnectorState.OFFLINE : BlueprintConnectorState.DRAFT, currentVersion: null }
    },
}

export const blueprintFactory = {
    definition({ displayName, description, iconColor, baseUrl }: DefinitionParams): ConnectorBlueprintDefinition {
        return {
            displayName,
            description,
            iconColor,
            helpUrl: '',
            baseUrl,
            auth: null,
            status: blueprintStatus.defaults(),
            groups: [],
            operations: [],
            triggers: [],
        }
    },
    auth({ type, name, description }: AuthParams): BlueprintAuth {
        const tokenType = type === BlueprintAuthType.AUTHORIZATION_CODE || type === BlueprintAuthType.CLIENT_CREDENTIALS
        return {
            type,
            enabled: true,
            name,
            description,
            credentialLocation: BlueprintCredentialLocation.HEADER,
            credentialName: tokenType ? 'Authorization' : 'X-Api-Key',
            credentialPrefix: tokenType ? 'Bearer ' : '',
            authorizeUrl: '',
            tokenUrl: '',
            scope: '',
            pkce: false,
            fields: [],
            tokenFlow: flowStep({ enabled: type === BlueprintAuthType.CLIENT_CREDENTIALS, method: BlueprintHttpMethod.POST, url: '/oauth/token', config: CLIENT_CREDENTIALS_TOKEN_CONFIG, resultPath: 'access_token' }),
            refreshFlow: flowStep({ enabled: false, method: BlueprintHttpMethod.POST, url: '/oauth/token', config: '{}', resultPath: 'access_token' }),
            userFlow: flowStep({ enabled: !tokenType, method: BlueprintHttpMethod.GET, url: '/me', config: '{}', resultPath: 'name' }),
            plugin: { enabled: false, code: SIGNING_PLUGIN_TEMPLATE },
        }
    },
    autoAuthFields(type: BlueprintAuthType): BlueprintAuthField[] {
        switch (type) {
            case BlueprintAuthType.API_KEY:
                return [authField({ key: 'api_key', label: 'API Key', control: BlueprintAuthFieldControl.PASSWORD })]
            case BlueprintAuthType.BASIC_AUTH:
                return [
                    authField({ key: 'username', label: 'Username', control: BlueprintAuthFieldControl.TEXT }),
                    authField({ key: 'password', label: 'Password', control: BlueprintAuthFieldControl.PASSWORD }),
                ]
            case BlueprintAuthType.CLIENT_CREDENTIALS:
            case BlueprintAuthType.AUTHORIZATION_CODE:
                return [
                    authField({ key: 'client_id', label: 'Client ID', control: BlueprintAuthFieldControl.TEXT }),
                    authField({ key: 'client_secret', label: 'Client Secret', control: BlueprintAuthFieldControl.PASSWORD }),
                ]
        }
    },
    flowRequirements(type: BlueprintAuthType): BlueprintFlowRequirement[] {
        switch (type) {
            case BlueprintAuthType.AUTHORIZATION_CODE:
                return [{ flow: BlueprintAuthFlow.USER, required: false }]
            case BlueprintAuthType.CLIENT_CREDENTIALS:
                return [{ flow: BlueprintAuthFlow.TOKEN, required: true }, { flow: BlueprintAuthFlow.USER, required: false }]
            case BlueprintAuthType.API_KEY:
            case BlueprintAuthType.BASIC_AUTH:
                return [{ flow: BlueprintAuthFlow.USER, required: true }]
        }
    },
    input({ key, label }: { key: string, label: string }): BlueprintInput {
        return {
            key,
            label,
            type: BlueprintValueType.STRING,
            control: BlueprintInputControl.TEXT,
            required: false,
            hint: '',
            options: [],
            optionsSource: BlueprintOptionsSource.STATIC,
            optionsOperation: null,
            optionsItemsPath: '',
            optionsLabelPath: 'name',
            optionsValuePath: 'id',
            pattern: '',
            patternMessage: '',
            visibleIf: '',
        }
    },
    operation({ key, name, method, path, group }: OperationParams): BlueprintOperation {
        return { key, name, description: '', group, method, path, inputs: [], request: null, sample: {}, statusOverride: null }
    },
    trigger({ key, name, type }: TriggerParams): BlueprintTrigger {
        return {
            key,
            name,
            description: '',
            type,
            inputs: [],
            sample: {},
            instant: {
                subscribe: { enabled: true, method: BlueprintHttpMethod.POST, path: '/webhooks', request: jsonRequest('{\n  "url": "{{webhookUrl}}"\n}') },
                unsubscribe: { enabled: true, method: BlueprintHttpMethod.DELETE, path: '/webhooks/{{subscriptionId}}', request: null },
                subscriptionIdPath: 'body.id',
                handle: '{{event}}',
            },
            polling: {
                method: BlueprintHttpMethod.GET,
                path: `/${key}`,
                request: null,
                intervalMinutes: 5,
                pagination: BlueprintPagination.NONE,
                pageParam: 'page',
                startPage: 1,
                cursorParam: 'cursor',
                cursorPath: 'body.next_cursor',
                hasMorePath: 'body.has_more',
                maxPages: 5,
                listPath: 'body.items',
                dedupeKey: 'id',
                checkpointName: '',
                checkpointItemPath: '',
            },
        }
    },
    fromPreset({ presetId, displayName, description, iconColor }: FromPresetParams): ConnectorBlueprintDefinition {
        const preset = BLUEPRINT_PRESETS.find((candidate) => candidate.id === presetId)
        const base = blueprintFactory.definition({ displayName, description, iconColor, baseUrl: preset?.baseUrl ?? '' })
        if (isNil(preset)) {
            return base
        }
        const auth = blueprintFactory.auth({ type: preset.authType, name: preset.name, description: '' })
        return {
            ...base,
            auth: {
                ...auth,
                credentialName: preset.credentialName ?? auth.credentialName,
                credentialPrefix: preset.credentialPrefix ?? auth.credentialPrefix,
                credentialLocation: preset.credentialLocation ?? auth.credentialLocation,
                authorizeUrl: preset.authorizeUrl ?? '',
                tokenUrl: preset.tokenUrl ?? '',
                tokenFlow: isNil(preset.tokenUrl) ? auth.tokenFlow : { ...auth.tokenFlow, url: preset.tokenUrl },
            },
        }
    },
}

export const blueprintOutput = {
    fields(sample: unknown): BlueprintOutputField[] {
        return fieldsOf({ value: sample, depth: 0 })
    },
}

export const blueprintProblems = {
    input({ input, operationKeys }: { input: BlueprintInput, operationKeys: string[] }): BlueprintInputProblem[] {
        return [
            input.label.trim().length === 0 ? BlueprintInputProblem.LABEL : null,
            !blueprintRules.isValidFieldKey(input.key) ? BlueprintInputProblem.KEY : null,
            input.pattern.length > 0 && !blueprintRules.isValidRegex(input.pattern) ? BlueprintInputProblem.PATTERN : null,
            !blueprintExpression.isValid(input.visibleIf) ? BlueprintInputProblem.VISIBILITY : null,
            input.control === BlueprintInputControl.DROPDOWN && input.optionsSource === BlueprintOptionsSource.STATIC && input.options.length === 0 ? BlueprintInputProblem.OPTIONS : null,
            input.control === BlueprintInputControl.DROPDOWN && input.optionsSource === BlueprintOptionsSource.OPERATION && (isNil(input.optionsOperation) || !operationKeys.includes(input.optionsOperation)) ? BlueprintInputProblem.OPTIONS_OPERATION : null,
        ].filter((problem): problem is BlueprintInputProblem => !isNil(problem))
    },
    operation({ operation, operationKeys }: { operation: BlueprintOperation, operationKeys: string[] }): BlueprintOperationProblem[] {
        const request = blueprintTemplate.resolveRequest(operation)
        const inputKeys = operation.inputs.map((input) => input.key)
        const inputProblems = operation.inputs.flatMap((input) => blueprintProblems.input({ input, operationKeys: operationKeys.filter((key) => key !== operation.key) }))
        return [
            operation.name.trim().length === 0 ? BlueprintOperationProblem.NAME : null,
            !operation.path.startsWith('/') && !blueprintRules.isHttpUrl(operation.path) ? BlueprintOperationProblem.PATH : null,
            requestProblem({ request }),
            blueprintTemplate.unknownInputRefs({ texts: requestTexts({ path: operation.path, request }), inputKeys }).length > 0 ? BlueprintOperationProblem.UNKNOWN_REFS : null,
            new Set(inputKeys).size !== inputKeys.length ? BlueprintOperationProblem.DUPLICATE_INPUTS : null,
            inputProblems.length > 0 ? BlueprintOperationProblem.INPUTS : null,
            !isNil(operation.statusOverride) && statusProblem(operation.statusOverride) ? BlueprintOperationProblem.STATUS : null,
        ].filter((problem): problem is BlueprintOperationProblem => !isNil(problem))
    },
    trigger({ trigger, operationKeys }: { trigger: BlueprintTrigger, operationKeys: string[] }): BlueprintTriggerProblem[] {
        const inputKeys = trigger.inputs.map((input) => input.key)
        const inputProblems = trigger.inputs.flatMap((input) => blueprintProblems.input({ input, operationKeys }))
        const common = [
            trigger.name.trim().length === 0 ? BlueprintTriggerProblem.NAME : null,
            inputProblems.length > 0 ? BlueprintTriggerProblem.INPUTS : null,
        ]
        if (trigger.type === BlueprintTriggerType.POLLING) {
            const polling = trigger.polling
            const request = blueprintTemplate.resolveRequest({ method: polling.method, path: polling.path, inputs: trigger.inputs, request: polling.request })
            return [
                ...common,
                !polling.path.startsWith('/') && !blueprintRules.isHttpUrl(polling.path) ? BlueprintTriggerProblem.PATH : null,
                !Number.isInteger(polling.intervalMinutes) || polling.intervalMinutes < 1 || polling.intervalMinutes > BLUEPRINT_LIMITS.pollingIntervalMax ? BlueprintTriggerProblem.INTERVAL : null,
                polling.listPath.trim().length === 0 ? BlueprintTriggerProblem.LIST_PATH : null,
                polling.dedupeKey.trim().length === 0 ? BlueprintTriggerProblem.DEDUPE_KEY : null,
                polling.pagination === BlueprintPagination.CURSOR && polling.cursorPath.trim().length === 0 ? BlueprintTriggerProblem.PAGINATION : null,
                polling.pagination !== BlueprintPagination.NONE && (polling.hasMorePath.trim().length === 0 || polling.maxPages < 1) ? BlueprintTriggerProblem.PAGINATION : null,
                requestProblem({ request }) === null ? null : BlueprintTriggerProblem.REQUEST,
                blueprintTemplate.unknownInputRefs({ texts: requestTexts({ path: polling.path, request }), inputKeys }).length > 0 ? BlueprintTriggerProblem.UNKNOWN_REFS : null,
            ].filter((problem): problem is BlueprintTriggerProblem => !isNil(problem))
        }
        const instant = trigger.instant
        const endpoints = [instant.subscribe, instant.unsubscribe].filter((endpoint) => endpoint.enabled)
        return [
            ...common,
            endpoints.some((endpoint) => !endpoint.path.startsWith('/') && !blueprintRules.isHttpUrl(endpoint.path)) ? BlueprintTriggerProblem.ENDPOINT : null,
            endpoints.some((endpoint) => !isNil(endpoint.request) && requestProblem({ request: endpoint.request }) !== null) ? BlueprintTriggerProblem.REQUEST : null,
            instant.handle.trim().length === 0 || blueprintTemplate.jsonError(instant.handle) ? BlueprintTriggerProblem.HANDLE : null,
        ].filter((problem): problem is BlueprintTriggerProblem => !isNil(problem))
    },
    auth({ auth }: { auth: BlueprintAuth }): BlueprintAuthProblem[] {
        const autoKeys = blueprintFactory.autoAuthFields(auth.type).map((field) => field.key)
        const fieldKeys = [...autoKeys, ...auth.fields.map((field) => field.key)]
        const flows = blueprintFactory.flowRequirements(auth.type)
        const flowProblems = flows
            .filter((requirement) => requirement.required || flowOf({ auth, flow: requirement.flow }).enabled)
            .map((requirement) => flowOf({ auth, flow: requirement.flow }))
            .some((step) => step.url.trim().length === 0 || (!step.url.startsWith('/') && !blueprintRules.isHttpUrl(step.url)) || blueprintTemplate.jsonError(step.config))
        return [
            auth.name.trim().length === 0 ? BlueprintAuthProblem.NAME : null,
            new Set(fieldKeys).size !== fieldKeys.length || auth.fields.some((field) => !blueprintRules.isValidFieldKey(field.key) || field.label.trim().length === 0) ? BlueprintAuthProblem.FIELDS : null,
            auth.type === BlueprintAuthType.AUTHORIZATION_CODE && (!blueprintRules.isHttpUrl(auth.authorizeUrl) || !blueprintRules.isHttpUrl(auth.tokenUrl)) ? BlueprintAuthProblem.OAUTH_URLS : null,
            (auth.type === BlueprintAuthType.API_KEY || auth.type === BlueprintAuthType.CLIENT_CREDENTIALS || auth.type === BlueprintAuthType.AUTHORIZATION_CODE) && !/^[A-Za-z0-9_-]+$/.test(auth.credentialName) ? BlueprintAuthProblem.CREDENTIAL : null,
            flowProblems ? BlueprintAuthProblem.FLOWS : null,
            auth.plugin.enabled && !/function\s+beforeRequest\s*\(/.test(auth.plugin.code) ? BlueprintAuthProblem.PLUGIN : null,
        ].filter((problem): problem is BlueprintAuthProblem => !isNil(problem))
    },
    publish({ definition, authPublished }: PublishParams): BlueprintPublishIssue[] {
        const operationKeys = definition.operations.map((operation) => operation.key)
        const auth = definition.auth
        const authActive = !isNil(auth) && auth.enabled
        return [
            definition.displayName.trim().length === 0 ? issue({ code: BlueprintIssueCode.NAME_MISSING, section: BlueprintIssueSection.BASIC }) : null,
            definition.displayName.length > BLUEPRINT_LIMITS.name ? issue({ code: BlueprintIssueCode.NAME_TOO_LONG, section: BlueprintIssueSection.BASIC }) : null,
            definition.description.trim().length === 0 ? issue({ code: BlueprintIssueCode.DESCRIPTION_MISSING, section: BlueprintIssueSection.BASIC }) : null,
            !blueprintRules.isHttpUrl(definition.baseUrl) ? issue({ code: BlueprintIssueCode.BASE_URL_INVALID, section: BlueprintIssueSection.BASIC }) : null,
            definition.operations.length + definition.triggers.length === 0 ? issue({ code: BlueprintIssueCode.NO_OPERATIONS, section: BlueprintIssueSection.BASIC }) : null,
            authActive && !authPublished ? issue({ code: BlueprintIssueCode.AUTH_NOT_PUBLISHED, section: BlueprintIssueSection.AUTH }) : null,
            statusProblem(definition.status) ? issue({ code: BlueprintIssueCode.STATUS_INVALID, section: BlueprintIssueSection.STATUS }) : null,
            ...definition.operations
                .filter((operation) => blueprintProblems.operation({ operation, operationKeys }).length > 0)
                .map((operation) => issue({ code: BlueprintIssueCode.OPERATION_INVALID, section: BlueprintIssueSection.OPERATION, key: operation.key, name: operation.name })),
            ...definition.triggers
                .filter((trigger) => blueprintProblems.trigger({ trigger, operationKeys }).length > 0)
                .map((trigger) => issue({ code: BlueprintIssueCode.TRIGGER_INVALID, section: BlueprintIssueSection.TRIGGER, key: trigger.key, name: trigger.name })),
        ].filter((entry): entry is BlueprintPublishIssue => !isNil(entry))
    },
}

export const blueprintChanges = {
    compute({ baseline, draft }: ComputeChangesParams): BlueprintChange[] {
        const operations = diffItems({
            kind: BlueprintChangeKind.OPERATION,
            before: baseline?.operations ?? [],
            after: draft.operations,
            describe: (operation) => ({ key: operation.key, name: operation.name, method: operation.method }),
        })
        const triggers = diffItems({
            kind: BlueprintChangeKind.TRIGGER,
            before: baseline?.triggers ?? [],
            after: draft.triggers,
            describe: (trigger) => ({ key: trigger.key, name: trigger.name, method: null }),
        })
        const beforeConfig = isNil(baseline) ? null : configOf(baseline)
        const afterConfig = configOf(draft)
        const config: BlueprintChange[] = same({ left: beforeConfig, right: afterConfig })
            ? []
            : [{
                id: CONFIG_CHANGE_ID,
                kind: BlueprintChangeKind.CONFIG,
                key: CONFIG_CHANGE_ID,
                name: draft.displayName,
                method: null,
                change: isNil(beforeConfig) ? BlueprintChangeType.ADD : BlueprintChangeType.UPDATE,
                before: beforeConfig,
                after: afterConfig,
                changedFields: changedFields({ before: beforeConfig, after: afterConfig }),
            }]
        return [...config, ...operations, ...triggers]
    },
    apply({ baseline, draft, changeIds }: ApplyChangesParams): ConnectorBlueprintDefinition {
        const picked = new Set(changeIds)
        const configSource = isNil(baseline) || picked.has(CONFIG_CHANGE_ID) ? draft : baseline
        const operations = applyItems({ kind: BlueprintChangeKind.OPERATION, before: baseline?.operations ?? [], after: draft.operations, picked })
        const triggers = applyItems({ kind: BlueprintChangeKind.TRIGGER, before: baseline?.triggers ?? [], after: draft.triggers, picked })
        const groups = [...new Set([...draft.groups, ...operations.map((operation) => operation.group).filter((group) => group.length > 0)])]
        return {
            ...configSource,
            groups,
            operations,
            triggers,
        }
    },
    includesRemoval({ changes, changeIds }: { changes: BlueprintChange[], changeIds: string[] }): boolean {
        return changes.some((change) => changeIds.includes(change.id) && change.change === BlueprintChangeType.REMOVE)
    },
    changeIdOf({ kind, key }: { kind: BlueprintChangeKind, key: string }): string {
        return kind === BlueprintChangeKind.CONFIG ? CONFIG_CHANGE_ID : `${kind}:${key}`
    },
}

function flowStep({ enabled, method, url, config, resultPath }: BlueprintAuthFlowStep): BlueprintAuthFlowStep {
    return { enabled, method, url, config, resultPath }
}

function authField({ key, label, control }: { key: string, label: string, control: BlueprintAuthFieldControl }): BlueprintAuthField {
    return { key, label, control, required: true, options: [] }
}

function jsonRequest(body: string): BlueprintRequestConfig {
    return {
        headers: [{ key: 'Content-Type', value: 'application/json' }],
        query: [],
        bodyType: BlueprintBodyType.JSON,
        body,
        form: [],
        timeoutSeconds: 30,
        followRedirect: true,
    }
}

function flowOf({ auth, flow }: { auth: BlueprintAuth, flow: BlueprintAuthFlow }): BlueprintAuthFlowStep {
    switch (flow) {
        case BlueprintAuthFlow.TOKEN:
            return auth.tokenFlow
        case BlueprintAuthFlow.REFRESH:
            return auth.refreshFlow
        case BlueprintAuthFlow.USER:
            return auth.userFlow
    }
}

function requestProblem({ request }: { request: BlueprintRequestConfig }): BlueprintOperationProblem | null {
    if (!Number.isInteger(request.timeoutSeconds) || request.timeoutSeconds < 1 || request.timeoutSeconds > BLUEPRINT_LIMITS.timeoutMax) {
        return BlueprintOperationProblem.TIMEOUT
    }
    if (request.bodyType === BlueprintBodyType.JSON && blueprintTemplate.jsonError(request.body)) {
        return BlueprintOperationProblem.BODY
    }
    const headerKeys = request.headers.map((pair) => pair.key.trim().toLowerCase()).filter((key) => key.length > 0)
    const queryKeys = request.query.map((pair) => pair.key.trim()).filter((key) => key.length > 0)
    if (new Set(headerKeys).size !== headerKeys.length || new Set(queryKeys).size !== queryKeys.length) {
        return BlueprintOperationProblem.DUPLICATE_PAIRS
    }
    return null
}

function requestTexts({ path, request }: { path: string, request: BlueprintRequestConfig }): string[] {
    return [
        path,
        ...request.headers.map((pair) => pair.value),
        ...request.query.map((pair) => pair.value),
        request.body,
        ...request.form.map((pair) => pair.value),
    ]
}

function statusProblem(config: BlueprintStatusConfig): boolean {
    const codes = config.rules.map((rule) => rule.code.trim())
    return codes.length === 0 || codes.some((code) => code.length === 0) || new Set(codes).size !== codes.length
}

function issue({ code, section, key, name }: { code: BlueprintIssueCode, section: BlueprintIssueSection, key?: string, name?: string }): BlueprintPublishIssue {
    return { code, section, key: key ?? null, name: name ?? null }
}

function fieldsOf({ value, depth }: { value: unknown, depth: number }): BlueprintOutputField[] {
    if (depth >= MAX_OUTPUT_DEPTH || value === null || value === undefined || typeof value !== 'object') {
        return []
    }
    if (Array.isArray(value)) {
        return fieldsOf({ value: value[0], depth })
    }
    return Object.entries(value).map(([key, child]) => {
        if (Array.isArray(child)) {
            const items = fieldsOf({ value: child[0], depth: depth + 1 })
            return items.length > 0 ? { key, listItems: items } : { key }
        }
        const children = fieldsOf({ value: child, depth: depth + 1 })
        return children.length > 0 ? { key, children } : { key }
    })
}

function configOf(definition: ConnectorBlueprintDefinition): BlueprintConfigSnapshot {
    return {
        displayName: definition.displayName,
        description: definition.description,
        iconColor: definition.iconColor,
        helpUrl: definition.helpUrl,
        baseUrl: definition.baseUrl,
        auth: definition.auth,
        status: definition.status,
    }
}

function diffItems<T extends { key: string }>({ kind, before, after, describe }: DiffItemsParams<T>): BlueprintChange[] {
    const added = after
        .filter((item) => !before.some((candidate) => candidate.key === item.key))
        .map((item) => ({ item, change: BlueprintChangeType.ADD, previous: null }))
    const updated = after
        .map((item) => ({ item, previous: before.find((candidate) => candidate.key === item.key) ?? null }))
        .filter((entry) => !isNil(entry.previous) && !same({ left: entry.previous, right: entry.item }))
        .map((entry) => ({ ...entry, change: BlueprintChangeType.UPDATE }))
    const removed = before
        .filter((item) => !after.some((candidate) => candidate.key === item.key))
        .map((item) => ({ item, change: BlueprintChangeType.REMOVE, previous: item }))
    return [...added, ...updated, ...removed].map(({ item, change, previous }) => {
        const described = describe(item)
        const afterValue = change === BlueprintChangeType.REMOVE ? null : item
        return {
            id: blueprintChanges.changeIdOf({ kind, key: item.key }),
            kind,
            key: described.key,
            name: described.name,
            method: described.method,
            change,
            before: previous,
            after: afterValue,
            changedFields: change === BlueprintChangeType.UPDATE ? changedFields({ before: previous, after: afterValue }) : [],
        }
    })
}

function applyItems<T extends { key: string }>({ kind, before, after, picked }: ApplyItemsParams<T>): T[] {
    const fromDraft = after.flatMap((item) => {
        const isPicked = picked.has(blueprintChanges.changeIdOf({ kind, key: item.key }))
        const previous = before.find((candidate) => candidate.key === item.key)
        if (isPicked) {
            return [item]
        }
        return isNil(previous) ? [] : [previous]
    })
    const kept = before.filter((item) => !after.some((candidate) => candidate.key === item.key) && !picked.has(blueprintChanges.changeIdOf({ kind, key: item.key })))
    return [...fromDraft, ...kept]
}

function changedFields({ before, after }: { before: unknown, after: unknown }): string[] {
    if (!isRecord(before) || !isRecord(after)) {
        return []
    }
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    return keys.filter((key) => !same({ left: before[key], right: after[key] }))
}

function same({ left, right }: { left: unknown, right: unknown }): boolean {
    return JSON.stringify(left) === JSON.stringify(right)
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export enum BlueprintVersionStatus {
    CANARY = 'CANARY',
    FULL = 'FULL',
    STOPPED = 'STOPPED',
}

export enum BlueprintVersionAction {
    PROMOTE = 'PROMOTE',
    STOP_CANARY = 'STOP_CANARY',
    STOP = 'STOP',
    RESTORE = 'RESTORE',
}

export enum BlueprintConnectorState {
    DRAFT = 'DRAFT',
    PUBLISHED = 'PUBLISHED',
    OFFLINE = 'OFFLINE',
}

export enum BlueprintVersionError {
    FORMAT = 'FORMAT',
    NOT_GREATER = 'NOT_GREATER',
}

export enum BlueprintAuthFlow {
    TOKEN = 'TOKEN',
    REFRESH = 'REFRESH',
    USER = 'USER',
}

export enum BlueprintChangeKind {
    CONFIG = 'config',
    OPERATION = 'operation',
    TRIGGER = 'trigger',
}

export enum BlueprintChangeType {
    ADD = 'ADD',
    UPDATE = 'UPDATE',
    REMOVE = 'REMOVE',
}

export enum BlueprintIssueCode {
    NAME_MISSING = 'NAME_MISSING',
    NAME_TOO_LONG = 'NAME_TOO_LONG',
    DESCRIPTION_MISSING = 'DESCRIPTION_MISSING',
    BASE_URL_INVALID = 'BASE_URL_INVALID',
    NO_OPERATIONS = 'NO_OPERATIONS',
    AUTH_NOT_PUBLISHED = 'AUTH_NOT_PUBLISHED',
    STATUS_INVALID = 'STATUS_INVALID',
    OPERATION_INVALID = 'OPERATION_INVALID',
    TRIGGER_INVALID = 'TRIGGER_INVALID',
}

export enum BlueprintIssueSection {
    BASIC = 'basic',
    AUTH = 'auth',
    STATUS = 'status',
    OPERATION = 'operation',
    TRIGGER = 'trigger',
}

export enum BlueprintInputProblem {
    LABEL = 'LABEL',
    KEY = 'KEY',
    PATTERN = 'PATTERN',
    VISIBILITY = 'VISIBILITY',
    OPTIONS = 'OPTIONS',
    OPTIONS_OPERATION = 'OPTIONS_OPERATION',
}

export enum BlueprintOperationProblem {
    NAME = 'NAME',
    PATH = 'PATH',
    TIMEOUT = 'TIMEOUT',
    BODY = 'BODY',
    DUPLICATE_PAIRS = 'DUPLICATE_PAIRS',
    UNKNOWN_REFS = 'UNKNOWN_REFS',
    DUPLICATE_INPUTS = 'DUPLICATE_INPUTS',
    INPUTS = 'INPUTS',
    STATUS = 'STATUS',
}

export enum BlueprintTriggerProblem {
    NAME = 'NAME',
    INPUTS = 'INPUTS',
    PATH = 'PATH',
    INTERVAL = 'INTERVAL',
    LIST_PATH = 'LIST_PATH',
    DEDUPE_KEY = 'DEDUPE_KEY',
    PAGINATION = 'PAGINATION',
    REQUEST = 'REQUEST',
    UNKNOWN_REFS = 'UNKNOWN_REFS',
    ENDPOINT = 'ENDPOINT',
    HANDLE = 'HANDLE',
}

export enum BlueprintAuthProblem {
    NAME = 'NAME',
    FIELDS = 'FIELDS',
    OAUTH_URLS = 'OAUTH_URLS',
    CREDENTIAL = 'CREDENTIAL',
    FLOWS = 'FLOWS',
    PLUGIN = 'PLUGIN',
}

export const BLUEPRINT_LIMITS = {
    name: 30,
    identifier: 40,
    key: 64,
    description: 200,
    operationDescription: 100,
    inputLabel: 30,
    group: 20,
    versionDescription: 300,
    timeoutMax: 300,
    pollingIntervalMax: 1440,
    debugRecords: 20,
}

export const BLUEPRINT_ICON_COLORS = ['#0EA5E9', '#2563EB', '#8142E3', '#0891B2', '#16A34A', '#D97706', '#E11D48', '#DB2777', '#525252']

export const BLUEPRINT_DEVKIT_ACTIONS = {
    authTest: '__devkit_auth_test',
    debugPrefix: '__devkit_debug_',
}

export const SIGNING_PLUGIN_TEMPLATE = 'function beforeRequest(request, auth) {\n  return request;\n}\n'

export const BLUEPRINT_PRESETS: BlueprintPreset[] = [
    { id: 'github', name: 'GitHub', baseUrl: 'https://api.github.com', authType: BlueprintAuthType.AUTHORIZATION_CODE, authorizeUrl: 'https://github.com/login/oauth/authorize', tokenUrl: 'https://github.com/login/oauth/access_token' },
    { id: 'jira', name: 'Jira', baseUrl: 'https://your-domain.atlassian.net/rest/api/3', authType: BlueprintAuthType.BASIC_AUTH },
    { id: 'salesforce', name: 'Salesforce', baseUrl: 'https://your-instance.my.salesforce.com/services/data/v60.0', authType: BlueprintAuthType.AUTHORIZATION_CODE, authorizeUrl: 'https://login.salesforce.com/services/oauth2/authorize', tokenUrl: 'https://login.salesforce.com/services/oauth2/token' },
    { id: 'kingdee', name: '金蝶云星空', baseUrl: 'https://your-host/k3cloud', authType: BlueprintAuthType.CLIENT_CREDENTIALS },
    { id: 'dingtalk', name: '钉钉', baseUrl: 'https://api.dingtalk.com', authType: BlueprintAuthType.CLIENT_CREDENTIALS, tokenUrl: 'https://api.dingtalk.com/v1.0/oauth2/accessToken', credentialName: 'x-acs-dingtalk-access-token', credentialPrefix: '' },
    { id: 'wecom', name: '企业微信', baseUrl: 'https://qyapi.weixin.qq.com/cgi-bin', authType: BlueprintAuthType.CLIENT_CREDENTIALS, tokenUrl: 'https://qyapi.weixin.qq.com/cgi-bin/gettoken', credentialLocation: BlueprintCredentialLocation.QUERY, credentialName: 'access_token', credentialPrefix: '' },
    { id: 'shopify', name: 'Shopify', baseUrl: 'https://your-store.myshopify.com/admin/api/2024-04', authType: BlueprintAuthType.API_KEY, credentialName: 'X-Shopify-Access-Token' },
    { id: 'notion', name: 'Notion', baseUrl: 'https://api.notion.com/v1', authType: BlueprintAuthType.API_KEY, credentialName: 'Authorization', credentialPrefix: 'Bearer ' },
    { id: 'zendesk', name: 'Zendesk', baseUrl: 'https://your-subdomain.zendesk.com/api/v2', authType: BlueprintAuthType.BASIC_AUTH },
    { id: 'hubspot', name: 'HubSpot', baseUrl: 'https://api.hubapi.com', authType: BlueprintAuthType.API_KEY, credentialName: 'Authorization', credentialPrefix: 'Bearer ' },
    { id: 'gitlab', name: 'GitLab', baseUrl: 'https://gitlab.com/api/v4', authType: BlueprintAuthType.API_KEY, credentialName: 'PRIVATE-TOKEN' },
]

const IDENTIFIER_REGEX = /^[a-z][a-z0-9_]*$/
const FIELD_KEY_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/
const HTTP_URL_REGEX = /^https?:\/\/[^\s/?#]+[^\s]*$/i
const CUSTOM_CONNECTOR_PREFIX = '@fema-ipaas/connector-custom-'
const CONFIG_CHANGE_ID = 'config'
const MAX_OUTPUT_DEPTH = 6
const CLIENT_CREDENTIALS_TOKEN_CONFIG = '{\n  "bodyType": "FORM",\n  "body": {\n    "grant_type": "client_credentials",\n    "client_id": "{{authInput.client_id}}",\n    "client_secret": "{{authInput.client_secret}}"\n  }\n}'

type DefinitionParams = {
    displayName: string
    description: string
    iconColor: string
    baseUrl: string
}

type AuthParams = {
    type: BlueprintAuthType
    name: string
    description: string
}

type OperationParams = {
    key: string
    name: string
    method: BlueprintHttpMethod
    path: string
    group: string
}

type TriggerParams = {
    key: string
    name: string
    type: BlueprintTriggerType
}

type FromPresetParams = {
    presetId: string
    displayName: string
    description: string
    iconColor: string
}

type RunnableParams = {
    rules: BlueprintVersionRule[]
    packageVersion: string
    projectId: string | undefined
}

type SelectableParams = {
    rules: BlueprintVersionRule[]
    packageVersions: string[]
    projectId: string | undefined
}

type PublishParams = {
    definition: ConnectorBlueprintDefinition
    authPublished: boolean
}

type ComputeChangesParams = {
    baseline: ConnectorBlueprintDefinition | null
    draft: ConnectorBlueprintDefinition
}

type ApplyChangesParams = ComputeChangesParams & {
    changeIds: string[]
}

type DiffItemsParams<T> = {
    kind: BlueprintChangeKind
    before: T[]
    after: T[]
    describe: (item: T) => { key: string, name: string, method: BlueprintHttpMethod | null }
}

type ApplyItemsParams<T> = {
    kind: BlueprintChangeKind
    before: T[]
    after: T[]
    picked: Set<string>
}

type BlueprintConfigSnapshot = {
    displayName: string
    description: string
    iconColor: string
    helpUrl: string
    baseUrl: string
    auth: BlueprintAuth | null
    status: BlueprintStatusConfig
}

export type BlueprintVersionRule = {
    version: string
    status: BlueprintVersionStatus
    canaryProjectIds: string[]
}

export type BlueprintFlowRequirement = {
    flow: BlueprintAuthFlow
    required: boolean
}

export type BlueprintOutputField = {
    key: string
    children?: BlueprintOutputField[]
    listItems?: BlueprintOutputField[]
}

export type BlueprintPublishIssue = {
    code: BlueprintIssueCode
    section: BlueprintIssueSection
    key: string | null
    name: string | null
}

export type BlueprintChange = {
    id: string
    kind: BlueprintChangeKind
    key: string
    name: string
    method: BlueprintHttpMethod | null
    change: BlueprintChangeType
    before: unknown
    after: unknown
    changedFields: string[]
}

export type BlueprintPreset = {
    id: string
    name: string
    baseUrl: string
    authType: BlueprintAuthType
    authorizeUrl?: string
    tokenUrl?: string
    credentialLocation?: BlueprintCredentialLocation
    credentialName?: string
    credentialPrefix?: string
}
