const express = require('express');
const resolveInstance = require('../middleware/resolveInstance');
const proxyToContainer = require('../middleware/proxyToContainer');
const loginHandler = require('../middleware/loginHandler');

const router = express.Router();

/**
 * GET /api/app/login
 * Login to WhatsApp server
 */
router.get('/login', resolveInstance, loginHandler);

/**
 * GET /api/app/login-with-code
 * Login with pairing code
 */
router.get('/login-with-code', resolveInstance, proxyToContainer);

/**
 * GET /api/app/logout
 * Remove database and logout
 */
router.get('/logout', resolveInstance, proxyToContainer);

/**
 * GET /api/app/reconnect
 * Reconnecting to WhatsApp server
 */
router.get('/reconnect', resolveInstance, proxyToContainer);

/**
 * GET /api/app/devices
 * Get list connected devices
 */
router.get('/devices', resolveInstance, proxyToContainer);

module.exports = router;