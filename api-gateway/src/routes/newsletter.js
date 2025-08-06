const express = require('express');
const resolveInstance = require('../middleware/resolveInstance');
const proxyToContainer = require('../middleware/proxyToContainer');

const router = express.Router();

/**
 * POST /api/newsletter/unfollow
 * Unfollow newsletter
 */
router.post('/unfollow', resolveInstance, proxyToContainer);

module.exports = router;