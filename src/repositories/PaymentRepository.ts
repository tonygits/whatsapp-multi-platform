import { randomUUID } from 'crypto';
import database from "../database/database";
import logger from "../utils/logger";
import {Payment} from "../types/payment";

class PaymentRepository {

    /**
     * Create a new device by device hash
     * @param {Object} paymentData - Payment data
     * @returns {Promise<Object>} - Created deviceState with ID
     */
    async create(paymentData: any): Promise<Payment> {
        try {
            const paymentId = randomUUID().toString()
            const {
                accessCode,
                transactionReference,
                amount,
                callBackUrl,
                currency,
                description,
                merchantRequestId,
                checkoutRequestId,
                paymentMode,
                phoneNumber,
                email,
                resourceId,
                resourceName,
                resourceType,
                transactionId,
                status,
                userId,
                paymentPeriod,
                periodType,
                isRecurring,
                transactionDate,
                paystackResponse,
                mpesaStkPushResponse,
            } = paymentData;

            if (!transactionReference) {
                throw new Error('transaction reference is mandatory');
            }

            const result = await database.run(
                `INSERT INTO payments (id, access_code, transaction_reference, amount, call_back_url,
                                       currency, description, merchant_request_id, checkout_request_id, payment_mode,
                                       phone_number,
                                       email, resource_id, resource_name, resource_type, transaction_id, status,
                                       user_id, payment_period, period_type, is_recurring, transaction_date,
                                       paystack_response, mpesa_stk_push_response)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    paymentId,
                    accessCode || null,
                    transactionReference,
                    amount,
                    callBackUrl || null,
                    currency,
                    description || null,
                    merchantRequestId || null,
                    checkoutRequestId || null,
                    paymentMode,
                    phoneNumber || null,
                    email || null,
                    resourceId,
                    resourceName,
                    resourceType,
                    transactionId,
                    status,
                    userId,
                    paymentPeriod,
                    periodType,
                    isRecurring,
                    transactionDate || null,
                    paystackResponse || null,
                    mpesaStkPushResponse || null,
                ]
            );

            const payment = await database.get(
                `SELECT *
                 FROM payments
                 WHERE id = ?`,
                [paymentId]
            );
            logger.info(`payment created: ${paymentId}`, {
                paymentId: paymentId,
                transactionReference: transactionReference
            });

            return {
                id: payment.id,
                accessCode: payment.access_code,
                transactionReference: payment.transaction_reference,
                amount: payment.amount,
                callBackUrl: payment.call_back_url,
                currency: payment.currency,
                description: payment.description,
                merchantRequestId: payment.merchant_request_id,
                checkoutRequestId: payment.checkout_request_id,
                paymentMode: payment.payment_mode,
                phoneNumber: payment.phone_number,
                email: payment.email,
                resourceId: payment.resourceId,
                resourceName: payment.resourceName,
                resourceType: payment.resourceType,
                transactionId: payment.transactionId,
                status: payment.status,
                userId: payment.user_id,
                paymentPeriod: payment.payment_period,
                periodType: payment.period_type,
                isRecurring: payment.is_recurring,
                transactionDate: payment.transaction_date,
                paystackResponse: payment.paystack_response,
                mpesaStkPushResponse: payment.mpesa_stk_push_response,
                createdAt: payment.created_at,
                updatedAt: payment.updated_at,
            };
        } catch (error) {
            logger.error('Error creating device key:', error);
            throw error;
        }
    }

    async updateDevicePaymentStateInformation(devicePaymentData: any): Promise<any> {
        try {
            let items: any;
            await database.transaction(async (db) => {
                // db is the wrapper instance
                await db.run('INSERT INTO items (name, qty) VALUES (?, ?)', ['apples', 10]);
                items = await db.run('INSERT INTO items (name, qty) VALUES (?, ?)', ['oranges', 5]);
            });

            return items;
        } catch (err: any) {
            console.log('Transaction failed and was rolled back:', err.message);
        }
    }

    /**
     * Find device by txn reference
     * @returns {Promise<Object|null>} - Payment or null
     * @param txnReference
     */
    async findByTransactionReference(txnReference: string): Promise<Payment> {
        try {
            const payment = await database.get(
                'SELECT * FROM payments WHERE transaction_reference = ?',
                [txnReference]
            );
            return {
                id: payment.id,
                accessCode: payment.access_code,
                transactionReference: payment.transaction_reference,
                amount: payment.amount,
                callBackUrl: payment.callBackUrl,
                currency: payment.currency,
                description: payment.description,
                merchantRequestId: payment.merchant_request_id,
                checkoutRequestId: payment.checkoutRequestId,
                paymentMode: payment.paymentMode,
                phoneNumber: payment.phoneNumber,
                email: payment.email,
                resourceId: payment.resourceId,
                resourceName: payment.resourceName,
                resourceType: payment.resourceType,
                transactionId: payment.transactionId,
                status: payment.status,
                userId: payment.user_id,
                paymentPeriod: payment.payment_period,
                periodType: payment.period_type,
                isRecurring: payment.is_recurring,
                transactionDate: payment.transaction_date,
                paystackResponse: payment.paystack_response,
                mpesaStkPushResponse: payment.mpesa_stk_push_response,
                createdAt: payment.created_at,
                updatedAt: payment.updated_at,
            };
        } catch (error) {
            logger.error('error fetching payment by txn reference:', error);
            throw error;
        }
    }

    /**
     * Update device
     * @param id
     * @param {Object} updateData - Data to update
     * @returns {Promise<Object|null>} - Updated device or null
     */
    async update(id: string, updateData: any): Promise<Payment> {
        try {
            let updatedPayment: any;
            await database.transaction(async (db) => {
                // db is the wrapper instance
                const allowedFields = [
                    'status', 'access_code', 'call_back_url', 'description', 'email',
                    'paystack_response', 'merchant_request_id', 'checkout_request_id',
                    'phone_number', 'transaction_date', 'mpesa_stk_push_response'
                ];

                // Convert camelCase to snake_case for database
                const fieldMapping = {
                    'status': 'status',
                    'accessCode': 'access_code',
                    'callBackUrl': 'call_back_url',
                    'description': 'description',
                    'email': 'email',
                    'paystackResponse': 'paystack_response',
                    'transactionDate': 'transaction_date',
                    'mpesaStkPushResponse': 'mpesa_stk_push_response',
                };

                const fields = [];
                const params = [];

                for (const [key, value] of Object.entries(updateData)) {
                    // Convert camelCase to snake_case if needed
                    const dbField = (fieldMapping as any)[key] || key;

                    if (allowedFields.includes(dbField)) {
                        fields.push(`${dbField} = ?`);
                        params.push(value);
                    }
                }

                if (fields.length === 0) {
                    throw new Error('No valid fields to update');
                }

                params.push(id);

                await db.run(
                    `UPDATE payments
                     SET ${fields.join(', ')}
                     WHERE id = ?`,
                    params
                );

                // Get the updated device directly
                 updatedPayment = await db.get(
                    'SELECT * FROM payments WHERE id = ?',
                    [id]
                );
                logger.info(`Updated payment: ${id}`);

                if (updatedPayment.status == 'paid') {

                    const device = await db.get(
                        'SELECT * FROM devices WHERE device_hash = ?',
                        [updatedPayment.resource_id]
                    );

                    if (device) {
                        const devicePaymentId = randomUUID().toString()
                        const result = await db.run(
                            `INSERT INTO device_payments (id, device_id, device_hash, payment_id)
                         VALUES (?, ?, ?, ?)`,
                            [
                                devicePaymentId,
                                device.device_id,
                                device.device_hash,
                                updatedPayment.id,
                            ]
                        );
                    }


                    //check if device has device state
                    const deviceState = await db.get(
                        'SELECT * FROM device_states WHERE device_hash = ?',
                        [updatedPayment.resource_id]
                    );

                    const deviceStateId = randomUUID().toString()
                    // Create a new Date object (e.g., current date)
                    const nextMonthDate = new Date();

                    // Get the current month (getMonth() returns 0 for January, 11 for December)
                    const currentMonth = nextMonthDate.getMonth();

                    // Add one to the current month and set it back to the date object
                    // setMonth() automatically handles year changes if the month goes beyond December
                    nextMonthDate.setMonth(currentMonth + 1);

                    // The originalDate object now holds the date with one month added
                    console.log(nextMonthDate);

                    if (!deviceState && device) {
                        const result = await db.run(
                            `INSERT INTO device_states (id, device_id, device_hash, user_id, status, 
                           last_payment_date, next_payment_date, payment_period, period_type, is_recurring)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [
                                deviceStateId,
                                device.device_id,
                                device.device_hash,
                                updatedPayment.user_id,
                                'active',
                                updatedPayment.transaction_date || null,
                                nextMonthDate || null,
                                updatedPayment.payment_period,
                                updatedPayment.period_type,
                                updatedPayment.is_recurring,
                            ]
                        );
                    }

                    if (deviceState && device) {
                        await db.run(
                            `UPDATE device_states SET (status, last_payment_date, next_payment_date,
                                period_type, is_recurring, transaction_date) = (?, ?, ?, ?, ?, ?)
                                WHERE id = ?`, ['active', updatedPayment.transaction_date, nextMonthDate,
                                updatedPayment.payment_period, updatedPayment.period_type, updatedPayment.is_recurring]
                        );
                    }
                }
            });

            return {
                id: updatedPayment.id,
                accessCode: updatedPayment.access_code,
                transactionReference: updatedPayment.transaction_reference,
                amount: updatedPayment.amount,
                callBackUrl: updatedPayment.call_back_url,
                currency: updatedPayment.currency,
                description: updatedPayment.description,
                merchantRequestId: updatedPayment.merchant_request_id,
                checkoutRequestId: updatedPayment.checkout_request_id,
                paymentMode: updatedPayment.payment_mode,
                phoneNumber: updatedPayment.phone_number,
                email: updatedPayment.email,
                resourceId: updatedPayment.resourceId,
                resourceName: updatedPayment.resourceName,
                resourceType: updatedPayment.resourceType,
                transactionId: updatedPayment.transactionId,
                status: updatedPayment.status,
                userId: updatedPayment.user_id,
                paymentPeriod: updatedPayment.payment_period,
                periodType: updatedPayment.period_type,
                isRecurring: updatedPayment.is_recurring,
                transactionDate: updatedPayment.transaction_date,
                paystackResponse: updatedPayment.paystack_response,
                mpesaStkPushResponse: updatedPayment.mpesa_stk_push_response,
                createdAt: updatedPayment.created_at,
                updatedAt: updatedPayment.updated_at,
            };
        } catch (error) {
            logger.error('Error updating payment:', error);
            throw error;
        }
    }
}
