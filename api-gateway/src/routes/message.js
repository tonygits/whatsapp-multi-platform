const express = require('express');
const resolveInstance = require('../middleware/resolveInstance');
const proxyToContainer = require('../middleware/proxyToContainer');

const router = express.Router();

/**
 * POST /api/message/:message_id/revoke
 * Revoke Message
 */
router.post('/:message_id/revoke', resolveInstance, proxyToContainer);

/**
 * POST /api/message/:message_id/delete
 * Delete Message
 */
router.post('/:message_id/delete', resolveInstance, proxyToContainer);

/**
 * POST /api/message/:message_id/reaction
 * Send reaction to message
 */
router.post('/:message_id/reaction', resolveInstance, proxyToContainer);

/**
 * POST /api/message/:message_id/update
 * Edit message by message ID before 15 minutes
 */
router.post('/:message_id/update', resolveInstance, proxyToContainer);

/**
 * POST /api/message/:message_id/read
 * Mark as read message
 */
router.post('/:message_id/read', resolveInstance, proxyToContainer);

/**
 * POST /api/message/:message_id/star
 * Star message
 */
router.post('/:message_id/star', resolveInstance, proxyToContainer);

/**
 * POST /api/message/:message_id/unstar
 * Unstar message
 */
router.post('/:message_id/unstar', resolveInstance, proxyToContainer);

module.exports = router;