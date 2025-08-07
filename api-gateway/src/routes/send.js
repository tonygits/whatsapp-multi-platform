const express = require('express');
const axios = require('axios');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const PhoneUtils = require('../utils/phoneUtils');
const resolveInstance = require('../middleware/resolveInstance');
const proxyToContainer = require('../middleware/proxyToContainer');

const router = express.Router();


/**
 * POST /api/send/message
 * Send message
 */
router.post('/message', resolveInstance, proxyToContainer);

/**
 * POST /api/send/image
 * Send image
 */
router.post('/image', resolveInstance, proxyToContainer);

/**
 * POST /api/send/audio
 * Send audio
 */
router.post('/audio', resolveInstance, proxyToContainer);

/**
 * POST /api/send/video
 * Send video
 */
router.post('/video', resolveInstance, proxyToContainer);

/**
 * POST /api/send/file
 * Send file
 */
router.post('/file', resolveInstance, proxyToContainer);

/**
 * POST /api/send/contact
 * Send contact
 */
router.post('/contact', resolveInstance, proxyToContainer);

/**
 * POST /api/send/link
 * Send link
 */
router.post('/link', resolveInstance, proxyToContainer);

/**
 * POST /api/send/location
 * Send location
 */
router.post('/location', resolveInstance, proxyToContainer);

/**
 * POST /api/send/poll
 * Send poll/vote
 */
router.post('/poll', resolveInstance, proxyToContainer);

/**
 * POST /api/send/presence
 * Send presence status
 */
router.post('/presence', resolveInstance, proxyToContainer);

/**
 * POST /api/send/chat-presence
 * Send chat presence (typing indicator)
 */
router.post('/chat-presence', resolveInstance, proxyToContainer);

module.exports = router;