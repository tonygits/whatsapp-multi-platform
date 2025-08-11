const express = require('express');
const resolveInstance = require('../middleware/resolveInstance');
const proxyToContainer = require('../middleware/proxyToContainer');

const router = express.Router();

/**
 * GET /api/chats
 * Get list of chats
 */
router.get('/', [resolveInstance, resolveInstance.ensureActive], proxyToContainer);

/**
 * GET /api/chat/:chat_jid/messages
 * Get messages from a specific chat
 */
router.get('/:chat_jid/messages', [resolveInstance, resolveInstance.ensureActive], proxyToContainer);

/**
 * POST /api/chat/:chat_jid/label
 * Label or unlabel a chat
 */
router.post('/:chat_jid/label', [resolveInstance, resolveInstance.ensureActive], proxyToContainer);

/**
 * POST /api/chat/:chat_jid/pin
 * Pin or unpin a chat
 */
router.post('/:chat_jid/pin', [resolveInstance, resolveInstance.ensureActive], proxyToContainer);

module.exports = router;