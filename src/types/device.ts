export type Device = {
    id: number,
    userId: string,
    numberHash: string,
    deviceDate?: DeviceState,
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

export type DeviceState = {
    id: string,
    deviceId: number,
    numberHash: string,
    userId: string,
    status: string,
    lastPaymentDate?: string,
    nextPaymentDate?: string,
    paymentPeriod: string,
    periodType: string,
    isRecurring: boolean,
    createdAt: string,
    updatedAt: string,
}

export type DevicePayment = {
    id: string,
    deviceId: number,
    numberHash: string,
    paymentId: string,
    createdAt: string,
    updatedAt: string,
}
