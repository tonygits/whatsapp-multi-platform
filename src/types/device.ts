export type Device = {
    id: number,
    userId: string,
    deviceHash: string,
    containerId?: string,
    containerPort?: string,
    status: string,
    phoneNumber: string,
    port: string,
    webhookUrl?: string,
    webhookSecret?: string,
    statusWebhookUrl?: string,
    statusWebhookSecret?: string,
    createdAt: string
}
