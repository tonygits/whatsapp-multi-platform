// business logic functions that get triggered by messages
export async function processOrder(orderId: string | undefined, payload: any) {
    console.log(`[worker] processOrder: orderId=${orderId}`, payload);
    // simulate async work
    await new Promise(res => setTimeout(res, 300));
    // Replace with real logic (DB calls, HTTP calls, etc.)
    return { success: true, orderId, processedAt: new Date().toISOString() };
}

export async function doOtherTask(payload: any) {
    console.log('[worker] doOtherTask', payload);
    await new Promise(res => setTimeout(res, 200));
    return { ok: true };
}
