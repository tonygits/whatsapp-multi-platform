export type ApiRequest = {
    id: string,
    userId: string,
    userAgent: string,
    ipAddress: string,
    deviceHash: string,
    endpoint: string,
    method: string,
    createdAt: string,
}

export type ApiRequestCount = {
    userId: string,
    deviceHash: string,
    count: number,
}
