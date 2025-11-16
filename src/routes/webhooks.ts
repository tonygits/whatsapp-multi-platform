import express, {Request, Response} from 'express';
import crypto from "crypto";
import {verifyPaystackTransaction} from "../providers/paystack";
import planRepository from "../repositories/planRepository";
import subscriptionRepository from "../repositories/SubscriptionRepository";
import webhookRepository from "../repositories/webhookRepository";

const router = express.Router();

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY; // set in .env

if (!PAYSTACK_SECRET_KEY) {
    console.error("Missing PAYSTACK_SECRET_KEY in environment");
    process.exit(1);
}

/**
 * Webhook endpoint.
 * - Use express.raw() specifically here to access the raw body bytes for HMAC verification.
 * - Configure your Paystack webhook URL to this endpoint in the Paystack dashboard.
 *
 * Paystack sends header: x-paystack-signature
 */

/**
 * Replace the placeholder DB helper functions with your actual DB logic.
 * They must be idempotent and fast.
 */
async function findProcessedWebhook(id: string) {
    // Check if you processed this webhook (unique webhook id or transaction reference)
    return await webhookRepository.findById(id);
}

async function markWebhookProcessed(id: string, payload: any) {
    // Persist that this webhook (id) was processed so retries are ignored
    return await webhookRepository.create({ data: { webhookId: id, payload: JSON.stringify(payload), status: 'processed'}});
}

async function markInvoiceFailed(subscriptionCode: string, invoiceData: any) {
    // Mark invoice failed (increase attempt count, set backoff schedule)
    return;
}

async function updateSubscriptionStatus(subscriptionCode: string, status: string, details?: any) {
    // Update subscription status in your DB
    console.log("requesting to update subscription")
    let dbSubscription = await subscriptionRepository.findByCode(subscriptionCode);
    if (dbSubscription) {
        //update subscription with next billing date
        //create next month billing date
       await subscriptionRepository.update(dbSubscription.code, {
            status: status,
            nextBillingDate: details.next_payment_date
        });
    }

    return;
}

/**
 * Webhook route for Paystack.
 * Use express.raw middleware so we can verify exact raw bytes for signature validation.
 *
 * Mount this route in server.ts as:
 * app.post('/webhook/paystack', express.raw({ type: 'application/json' }), PaystackWebhookRouter);
 */
router.post("/paystack", express.raw({type: "application/json"}), async (req: Request, res: Response) => {
    const rawBody = req.body as Buffer | undefined;
    const signature = (req.headers["x-paystack-signature"] || "") as string;

    if (!rawBody || !signature) {
        console.warn("Webhook missing raw body or signature");
        return res.status(400).send("Missing signature or body");
    }

    try {
        // 1) Verify signature
        const computed = crypto.createHmac("sha512", PAYSTACK_SECRET_KEY).update(rawBody).digest("hex");
        if (computed !== signature) {
            console.warn("Invalid Paystack signature");
            return res.status(400).send("Invalid signature");
        }

        // 2) Parse payload
        const payload = JSON.parse(rawBody.toString("utf8"));
        console.log("Paystack webhook payload:", payload.event, payload);
        const event = payload?.event;
        const webHookId = payload?.data?.id ? `paystack-${payload.data.id}` : payload?.id || `${event}-${payload?.data?.reference || Math.random()}`;

        // 3) Idempotency: ignore duplicate webhook deliveries
        const already = await findProcessedWebhook(webHookId);
        if (already) {
            // Already processed — respond 200 so Paystack doesn't retry
            return res.status(200).send("ok");
        }

        // 4) Handle event types (common recurring/payment events)
        // Extract useful fields depending on event shape. Paystack payloads usually include payload.data
        const data = payload.data ?? payload;
        switch ((event || "").toString()) {
            case "invoice.payment_succeeded":
            case "invoice.payment_success":
            case "invoice.paid":
            case "subscription.payment_success":
            case "charge.success":
            case "transaction.success": {
                // A recurring or one-off charge has succeeded
                // Extract reference and subscription code if present
                const reference = data?.reference || data?.trx?.reference;
                if (reference) {
                    // fallback: mark payment by reference and attach to subscription via lookup
                    await verifyPaystackTransaction(reference);
                } else {
                    console.log("Payment succeeded but no subscription reference found", data);
                }
                break;
            }

            case "invoice.payment_failed":
            case "invoice.failed":
            case "charge.failed":
            case "transaction.failed": {
                const subscriptionCode = data?.subscription || data?.subscription_code;
                if (subscriptionCode) {
                    await markInvoiceFailed(subscriptionCode, data);
                } else {
                    console.log("Payment failed but subscription code missing", data);
                }
                break;
            }

            case "subscription.create":
            case "subscription.created": {
                const subscriptionCode = data?.subscription_code || data?.subscription || data?.id || data?.code;
                if (subscriptionCode) {
                    await updateSubscriptionStatus(subscriptionCode, "active", data);
                }
                break;
            }

            case "subscription.disable":
            case "subscription.disabled":
            case "subscription.terminate":
            case "subscription.cancelled": {
                const subscriptionCode = data?.subscription_code || data?.subscription || data?.id || data?.code;
                if (subscriptionCode) {
                    await updateSubscriptionStatus(subscriptionCode, "disabled", data);
                }
                break;
            }

            case "subscription.enable":
            case "subscription.enabled":
            case "subscription.resume": {
                const subscriptionCode = data?.subscription_code || data?.subscription || data?.id || data?.code;
                if (subscriptionCode) {
                    await updateSubscriptionStatus(subscriptionCode, "active", data);
                }
                break;
            }

            default: {
                // Log unknown event types for future handling. Don't fail.
                console.info("Unhandled Paystack webhook event:", event);
                // You might want to persist or notify for manual review
                break;
            }
        }

        // 5) Mark webhook processed (idempotency entry) and respond 200 to acknowledge
        console.log('webHookId', webHookId);
        await markWebhookProcessed(webHookId, payload);

        return res.status(200).send("ok");
    } catch (err: any) {
        console.error("Error processing Paystack webhook:", err?.message ?? err);
        // 500 will cause Paystack to retry per their retry policy — choose 500 only for transient errors.
        return res.status(500).send("internal error");
    }
});

export default router;
