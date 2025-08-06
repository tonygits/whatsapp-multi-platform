const express = require('express');
const resolveInstance = require('../middleware/resolveInstance');
const proxyToContainer = require('../middleware/proxyToContainer');

const router = express.Router();

/**
 * GET /api/user/info
 * Get user information
 */
router.get('/info', resolveInstance, proxyToContainer);

/**
 * GET /api/user/avatar
 * Get profile picture
 */
router.get('/avatar', resolveInstance, proxyToContainer);

/**
 * GET /api/user/my/groups
 * Get joined groups
 */
router.get('/my/groups', resolveInstance, proxyToContainer);

/**
 * GET /api/user/my/privacy
 * Get privacy settings
 */
router.get('/my/privacy', resolveInstance, proxyToContainer);

/**
 * POST /api/user/avatar
 * Set profile picture
 */
router.post('/avatar', resolveInstance, proxyToContainer);

/**
 * PUT /api/user/privacy
 * Set privacy settings
 */
router.put('/privacy', resolveInstance, proxyToContainer);

module.exports = router;