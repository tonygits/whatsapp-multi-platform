export type ApiRequest = {
    id: string,
    userId: string,
    userAgent: string,
    ipAddress: string,
    numberHash: string,
    endpoint: string,
    method: string,
    createdAt: string,
}

export type ApiRequestCount = {
    userId: string,
    numberHash: string,
    count: number,
}
