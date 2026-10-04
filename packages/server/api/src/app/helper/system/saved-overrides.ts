import { SystemProp } from './system-props'

let overrides: ReadonlyMap<SystemProp, string> = new Map()

export const savedOverrides = {
    get({ prop }: { prop: SystemProp }): string | undefined {
        return overrides.get(prop)
    },
    replace({ values }: { values: ReadonlyMap<SystemProp, string> }): void {
        overrides = values
    },
    snapshot(): ReadonlyMap<SystemProp, string> {
        return overrides
    },
}
