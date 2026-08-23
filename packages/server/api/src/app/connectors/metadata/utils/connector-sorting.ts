import { ConnectorOrderBy, ConnectorSortBy } from '@fema/shared'
import dayjs from 'dayjs'
import { ConnectorMetadataSchema } from '../connector-metadata-entity'


export const connectorSorting = {
    sortAndOrder: (
        sortBy: ConnectorSortBy | undefined,
        orderBy: ConnectorOrderBy | undefined,
        connectors: ConnectorMetadataSchema[],
    ): ConnectorMetadataSchema[] => {
        const sortByDefault = sortBy ?? ConnectorSortBy.NAME
        const orderByDefault = orderBy ?? ConnectorOrderBy.ASC
        const sortedConnector = sortConnectors(sortByDefault, connectors)

        return reverseIfDesc(orderByDefault, sortedConnector)
    },
}


const sortConnectors = (
    sortBy: ConnectorSortBy | undefined,
    connectors: ConnectorMetadataSchema[],
): ConnectorMetadataSchema[] => {
    const sortByDefault = sortBy ?? ConnectorSortBy.NAME
    switch (sortByDefault) {
        case ConnectorSortBy.POPULARITY: {
            return sortByPopularity(connectors)
        }
        case ConnectorSortBy.NAME: {
            return sortByName(connectors)
        }
        case ConnectorSortBy.UPDATED: {
            return sortByUpdated(connectors)
        }
        case ConnectorSortBy.CREATED: {
            return sortByCreated(connectors)
        }
    }
}
const reverseIfDesc = (
    orderBy: ConnectorOrderBy,
    connectors: ConnectorMetadataSchema[],
): ConnectorMetadataSchema[] => {
    if (orderBy === ConnectorOrderBy.ASC) {
        return connectors
    }
    return connectors.reverse()
}

const sortByPopularity = (connectors: ConnectorMetadataSchema[]): ConnectorMetadataSchema[] => {
    return connectors.sort((a, b) =>
        a.projectUsage - b.projectUsage,
    )
}


const sortByName = (connectors: ConnectorMetadataSchema[]): ConnectorMetadataSchema[] => {
    return connectors.sort((a, b) =>
        a.displayName.toLocaleLowerCase().localeCompare(b.displayName.toLocaleLowerCase()),
    )
}

const sortByCreated = (connectors: ConnectorMetadataSchema[]): ConnectorMetadataSchema[] => {
    return connectors.sort(
        (a, b) => dayjs(a.created).unix() - dayjs(b.created).unix(),
    )
}

const sortByUpdated = (connectors: ConnectorMetadataSchema[]): ConnectorMetadataSchema[] => {
    return connectors.sort(
        (a, b) => dayjs(a.updated).unix() - dayjs(b.updated).unix(),
    )
}
