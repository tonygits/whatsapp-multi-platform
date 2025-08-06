const express = require('express');
const resolveInstance = require('../middleware/resolveInstance');
const proxyToContainer = require('../middleware/proxyToContainer');

const router = express.Router();

/**
 * GET /api/user/info
 * User Info
 */
router.get('/info', resolveInstance, proxyToContainer);

/**
 * GET /api/user/avatar
 * User Avatar
 */
router.get('/avatar', resolveInstance, proxyToContainer);

/**
 * POST /api/user/avatar
 * User Change Avatar
 */
router.post('/avatar', resolveInstance, proxyToContainer);

/**
 * POST /api/user/pushname
 * User Change Push Name
 */
router.post('/pushname', resolveInstance, proxyToContainer);

/**
 * GET /api/user/my/privacy
 * User My Privacy Setting
 */
router.get('/my/privacy', resolveInstance, proxyToContainer);

/**
 * GET /api/user/my/groups
 * User My List Groups
 */
router.get('/my/groups', resolveInstance, proxyToContainer);

/**
 * GET /api/user/my/newsletters
 * User My List Newsletters
 */
router.get('/my/newsletters', resolveInstance, proxyToContainer);

/**
 * GET /api/user/my/contacts
 * Get list of user contacts
 */
router.get('/my/contacts', resolveInstance, proxyToContainer);

/**
 * GET /api/user/check
 * Check if user is on WhatsApp
 */
router.get('/check', resolveInstance, proxyToContainer);

/**
 * GET /api/user/business-profile
 * Get Business Profile Information
 */
router.get('/business-profile', resolveInstance, proxyToContainer);

module.exports = router;