const express = require('express');
const resolveInstance = require('../middleware/resolveInstance');
const proxyToContainer = require('../middleware/proxyToContainer');

const router = express.Router();

/**
 * GET /api/message/list
 * Get message list
 */
router.get('/list', resolveInstance, proxyToContainer);

/**
 * POST /api/message/send
 * Send message (individual route, different from /api/send/message)
 */
router.post('/send', resolveInstance, proxyToContainer);

/**
 * POST /api/message/reaction/send
 * Send message reaction
 */
router.post('/reaction/send', resolveInstance, proxyToContainer);

/**
 * POST /api/message/revoke
 * Revoke message
 */
router.post('/revoke', resolveInstance, proxyToContainer);

/**
 * POST /api/message/update
 * Update message
 */
router.post('/update', resolveInstance, proxyToContainer);

/**
 * GET /api/message/history
 * Get message history
 */
router.get('/history', resolveInstance, proxyToContainer);

module.exports = router;