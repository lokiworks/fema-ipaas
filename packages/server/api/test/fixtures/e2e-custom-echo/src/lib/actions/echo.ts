import { createAction } from '@fema-ipaas/connector-sdk'

export const echo = createAction({
    name: 'echo',
    displayName: 'Echo Message',
    description: 'Returns a constant payload so the workflow can be verified end-to-end.',
    props: {},
    async run() {
        return { message: 'custom-connector-works' }
    },
})
