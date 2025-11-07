import express, {Request, Response} from 'express';
import axios from "axios";
import dayjs from "dayjs";
import {
    callPaystack,
    changePaystackSubscription,
    chargeAuthorization, createPlan,
    disablePaystackSubscription,
    fetchPaystackPlan,
    fetchPaystackSubscription,
    markLocalSubscriptionDisabled,
    saveLocalSubscription,
    updateLocalSubscriptionStatus
} from "../providers/paystack";
import crypto from "crypto";
import planRepository from "../repositories/planRepository";

const router = express.Router();

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY; // set in .env
const PAYSTACK_INIT_URL = "https://api.paystack.co/transaction/initialize";
const PAYSTACK_BASE_URL = "https://api.paystack.co";

if (!PAYSTACK_SECRET_KEY) throw new Error("Missing PAYSTACK_SECRET_KEY in env");
/**
 * Initialize a transaction with Paystack.
 * Request body example: { email: "user@example.com", amount: 5000, currency?: "NGN", metadata?: {...} }
 *
 * Note: Paystack expects amount in the smallest currency unit (for NGN => kobo).
 * If using NGN and you want to charge Naira, pass amount in kobo (e.g., 5000 NGN = 500000 kobo).
 * Adjust according to the currency you're using.
 */
router.post("/initialize", async (req: Request, res: Response) => {
    try {
        const {email, amount, currency, metadata, callback_url} = req.body;

        if (!email || !amount) {
            return res.status(400).json({error: "email and amount are required"});
        }

        // Build payload for Paystack
        const payload: Record<string, any> = {
            email,
            amount, // ensure caller sends smallest currency unit if required (kobo)
        };

        if (metadata) payload.metadata = metadata;
        if (callback_url) payload.callback_url = callback_url;
        if (currency) payload.currency = currency;

        const response = await axios.post(PAYSTACK_INIT_URL, payload, {
            headers: {
                Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
                "Content-Type": "application/json",
            },
        });

        // Paystack returns data.authorization_url and data.reference
        return res.status(200).json(response.data);
    } catch (err: any) {
        console.error("Error initializing Paystack transaction:", err?.response?.data || err.message);
        return res.status(500).json({
            error: "Failed to initialize payment",
            details: err?.response?.data ?? err.message
        });
    }
});
/**
 * POST /paystack/subscription/disable
 * Body: { subscription_code: string, token?: string }
 */
router.post("/subscription/disable", async (req: Request, res: Response) => {
    const {subscription_code, token} = req.body;

    if (!subscription_code) {
        return res.status(400).json({error: "Missing subscription_code"});
    }

    try {
        // If you store auth token per customer, you can fetch it from DB instead of body
        const payload = {code: subscription_code, token};
        const data = await callPaystack("/subscription/disable", payload);

        await updateLocalSubscriptionStatus(subscription_code, "disabled");

        return res.status(200).json({
            message: "Subscription disabled successfully",
            paystack: data,
        });
    } catch (err: any) {
        console.error("Disable subscription error:", err?.response?.data ?? err.message);
        return res.status(500).json({
            error: "failed_to_disable_subscription",
            details: err?.response?.data ?? err.message,
        });
    }
});
/**
 * POST /paystack/subscription/enable
 * Body: { subscription_code: string, token?: string }
 */
router.post("/subscription/enable", async (req: Request, res: Response) => {
    const {subscription_code, token} = req.body;

    if (!subscription_code) {
        return res.status(400).json({error: "Missing subscription_code"});
    }

    try {
        const payload = {code: subscription_code, token};
        const data = await callPaystack("/subscription/enable", payload);

        await updateLocalSubscriptionStatus(subscription_code, "active");

        return res.status(200).json({
            message: "Subscription enabled successfully",
            paystack: data,
        });
    } catch (err: any) {
        console.error("Enable subscription error:", err?.response?.data ?? err.message);
        return res.status(500).json({
            error: "failed_to_enable_subscription",
            details: err?.response?.data ?? err.message,
        });
    }
});
/**
 * POST /paystack/subscription/change
 * Body:
 * {
 *   "old_subscription_code": "SUB_old123",
 *   "new_plan_code": "PLN_new123",
 *   "charge_prorate": true (optional, default false)
 * }
 *
 * Behavior:
 *  - Fetch old subscription details from Paystack
 *  - Fetch old & new plan details (for pricing)
 *  - Optionally compute a basic prorated amount and charge it immediately using authorization_code
 *  - Create a new subscription for the same customer using auth code
 *  - Disable old subscription
 *  - Persist local DB changes (placeholders)
 */
router.post("/subscription/change", async (req: Request, res: Response) => {
    const {old_subscription_code, new_plan_code, charge_prorate} = req.body as {
        old_subscription_code?: string;
        new_plan_code?: string;
        charge_prorate?: boolean;
    };

    if (!old_subscription_code || !new_plan_code) {
        return res.status(400).json({error: "old_subscription_code and new_plan_code are required"});
    }

    try {
        // 1. Fetch old subscription details from Paystack
        const oldSub = await fetchPaystackSubscription(old_subscription_code);
        if (!oldSub) return res.status(404).json({error: "Old subscription not found on Paystack"});

        // oldSub sample fields: { subscription_code, customer, plan, email, next_payment_date, start_date, authorization, ... }
        const customerIdentifier = oldSub.customer || oldSub.customer_email || oldSub.customer?.email;
        const authCode = oldSub?.authorization?.authorization_code || undefined;
        const oldPlanCode = oldSub.plan?.plan_code || oldSub.plan?.id || oldSub.plan || undefined;

        if (!customerIdentifier) {
            return res.status(500).json({error: "Could not determine customer identifier from old subscription"});
        }

        // 2. Fetch plan details for old and new (to compute amounts)
        const [oldPlan, newPlan] = await Promise.all([
            oldPlanCode ? fetchPaystackPlan(oldPlanCode) : Promise.resolve(null),
            fetchPaystackPlan(new_plan_code),
        ]);

        if (!newPlan) {
            return res.status(404).json({error: "New plan not found on Paystack"});
        }

        // amounts in smallest unit (kobo) as integers
        const oldAmount = Number(oldPlan?.amount ?? 0);
        const newAmount = Number(newPlan.amount);

        // 3. Optionally compute prorated charge
        let proratedCharge = 0;
        if (charge_prorate) {
            // We'll attempt to compute a simple prorated amount:
            // - If next_payment_date is available, compute days remaining until next_payment_date.
            // - Determine cycle length (days) based on plan interval (monthly/yearly) falling back to 30/365.
            // - proratedCharge = max(0, Math.round((newAmount - oldAmount) * (remainingDays / cycleDays)))
            try {
                const nextPaymentIso = oldSub.next_payment_date || oldSub.next_payment_at || null;
                let remainingDays = 0;
                if (nextPaymentIso) {
                    const now = dayjs();
                    const nextPay = dayjs(nextPaymentIso);
                    remainingDays = Math.max(0, nextPay.diff(now, "day", true)); // fractional days
                } else {
                    // fallback: assume full cycle remaining -> remainingDays = cycle days
                    remainingDays = undefined as any;
                }

                // Determine cycleDays from old plan interval if available, else fallback
                const oldInterval = oldPlan?.interval || oldSub?.plan?.interval || newPlan?.interval || "monthly";
                const cycleDays = oldInterval === "yearly" ? 365 : 30;

                const fractionRemaining = remainingDays === undefined ? 1 : Math.max(0, Math.min(1, remainingDays / cycleDays));

                // Charge difference immediate = (newAmount - oldAmount) * fractionRemaining
                const diff = newAmount - (oldAmount || 0);
                proratedCharge = Math.round(Math.max(0, diff) * fractionRemaining);
            } catch (e) {
                // If proration computation fails, set to 0 and continue
                proratedCharge = 0;
            }
        }

        // 4. If proratedCharge > 0 -> attempt to charge immediately using authorization_code
        let chargeResult: any = null;
        if (proratedCharge > 0) {
            if (!authCode && !oldSub.authorization?.authorization_code) {
                return res.status(400).json({error: "No reusable authorization_code available to charge prorated amount"});
            }

            const authorizationToUse = authCode ?? oldSub.authorization?.authorization_code;
            // Paystack requires email used when creating the authorization
            const emailToUse = oldSub.customer_email || oldSub.customer?.email || oldSub.email || customerIdentifier;

            // attempt to charge authorization
            try {
                chargeResult = await chargeAuthorization(proratedCharge, authorizationToUse, emailToUse);
                // You should verify chargeResult.status & ensure success
            } catch (e: any) {
                // Log error and decide whether to fail or continue.
                // For safety we return an error so that the developer can decide to retry or inform user
                console.error("Prorated charge failed:", e?.response?.data ?? e.message);
                return res.status(500).json({error: "Prorated charge failed", details: e?.response?.data ?? e.message});
            }
        }

        // 5. Create new subscription for the same customer
        // We pass authorization code if available to ensure Paystack uses stored card
        const customerIdentifierForCreate = oldSub.customer || oldSub.customer_email || oldSub.customer?.id || oldSub.customer?.email || oldSub.email;
        const newSubscription = await changePaystackSubscription(customerIdentifierForCreate, new_plan_code, authCode);

        // 6. Disable (cancel) old subscription
        // Paystack may require token (email token) in addition to code; token optional if not available.
        try {
            await disablePaystackSubscription(old_subscription_code, undefined);
            // Update local DB
            await markLocalSubscriptionDisabled(old_subscription_code);
        } catch (e: any) {
            // disabling failed — log but continue to return success for new sub creation
            console.error("Failed to disable old subscription:", e?.response?.data ?? e.message);
            // optionally return 500 here if you want to force atomicity
        }

        // 7. Persist new subscription locally (placeholder)
        await saveLocalSubscription({
            subscription_code: newSubscription.subscription_code || newSubscription.code || newSubscription.id,
            customer_email: oldSub.customer_email || oldSub.customer?.email || customerIdentifierForCreate,
            plan_code: new_plan_code,
            status: newSubscription.status || "active",
            paystack_subscription_id: newSubscription.id,
            authorization_code: authCode,
        });

        // 8. Respond
        return res.status(200).json({
            message: "Subscription changed successfully",
            old_subscription: {code: old_subscription_code},
            new_subscription: newSubscription,
            prorated: {
                charged: proratedCharge > 0,
                amount_charged: proratedCharge,
                charge_result: chargeResult,
            },
        });
    } catch (err: any) {
        console.error("Error changing subscription:", err?.response?.data ?? err.message);
        return res.status(500).json({
            error: "failed_to_change_subscription",
            details: err?.response?.data ?? err.message
        });
    }
});

router.post("/plan", async (req: Request, res: Response) => {
    try {
        const {name, amount, interval} = req.body as {
            name: string,
            amount: number,
            interval: "monthly" | "yearly"
        };
        const planId = crypto.randomUUID();
        if (!name) return res.status(400).json({error: 'name is required'});
        if (!amount) return res.status(400).json({error: 'amount is required'});
        if (!interval) return res.status(400).json({error: 'interval is required'});
        const planRes = await createPlan(name, amount, interval);
        //create plan on db
        const planData = {
            id: planId,
            code: planRes.code,
            name: name,
            amount: amount,
            interval: interval,
        }
        const plan = await planRepository.create(planData);
        res.status(200).json({plan});
    } catch (err: any) {
        console.error('failed to create plan with error', err);
        res.status(400).json({error: err.message ?? 'failed to create plan'});
    }
});

export default router;
