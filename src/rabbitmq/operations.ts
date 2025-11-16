// business logic functions that get triggered by messages
import apiRequestRepository from "../repositories/ApiRequestRepository";
import {sendMail} from "../providers/email";
import database from "../database/database";

export async function sendUserEmail(payloadId: string | undefined, payload: any) {
    console.log(`[worker] email payload: payloadId=${payloadId}`, payload);
    // simulate async work
    const info = await sendMail({ from: payload.from, to: payload.to, title: payload.title, body: payload?.body, html: payload.html });
    console.log(info);
    // Replace with real logic (DB calls, HTTP calls, etc.)
    return { success: true, payloadId, processedAt: new Date().toISOString() };
}

export async function doOtherTask(payload: any) {
    console.log('[worker] doOtherTask', payload);
    await new Promise(res => setTimeout(res, 200));
    return { ok: true };
}

export async function createApiRequests(payloadId: string | undefined, payload: any) {

    console.log('[worker] create api requests', payloadId);

    console.log('🔐 Initializing database...');
    await database.initialize();
    console.log('✅ database initialized');

    await apiRequestRepository.create({requestId: payload.requestId,
        numberHash: payload.numberHash, userAgent: payload.userAgent, ipAddress: payload.ipAddress,
        userId: payload.userId, method: payload.method, endpoint: payload.endpoint});

    return { ok: 'success' };
}
