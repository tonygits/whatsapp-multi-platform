const express = require('express');
const axios = require('axios');
const { asyncHandler, CustomError } = require('../middleware/errorHandler');
const deviceManager = require('../services/newDeviceManager');
const logger = require('../utils/logger');
const PhoneUtils = require('../utils/phoneUtils');
const resolveInstance = require('../middleware/resolveInstance');

const router = express.Router();

/**
 * Proxy request to WhatsApp container
 */
const proxyToContainer = asyncHandler(async (req, res) => {
  const containerPort = req.instance.container_port;
  const targetUrl = `http://localhost:${containerPort}${req.originalUrl.replace('/api', '')}`;

  try {
    const response = await axios({
      method: req.method,
      url: targetUrl,
      data: req.body,
      params: req.query,
      headers: {
        'Content-Type': 'application/json',
        ...req.headers
      },
      timeout: 30000
    });

    res.status(response.status).json(response.data);
  } catch (error) {
    logger.error(`Error proxying to container ${containerPort}:`, error.message);
    
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      throw new CustomError(
        'Container not responding',
        503,
        'CONTAINER_ERROR'
      );
    }
  }
});

/**
 * POST /api/group/create
 * Create group
 */
router.post('/create', resolveInstance, proxyToContainer);

/**
 * GET /api/group/list
 * Get group list
 */
router.get('/list', resolveInstance, proxyToContainer);

/**
 * POST /api/group/members
 * Get group members
 */
router.post('/members', resolveInstance, proxyToContainer);

/**
 * POST /api/group/admins
 * Get group admins
 */
router.post('/admins', resolveInstance, proxyToContainer);

/**
 * POST /api/group/add-member
 * Add member to group
 */
router.post('/add-member', resolveInstance, proxyToContainer);

/**
 * POST /api/group/remove-member
 * Remove member from group
 */
router.post('/remove-member', resolveInstance, proxyToContainer);

/**
 * POST /api/group/promote-member
 * Promote member to admin
 */
router.post('/promote-member', resolveInstance, proxyToContainer);

/**
 * POST /api/group/demote-member
 * Demote admin to member
 */
router.post('/demote-member', resolveInstance, proxyToContainer);

/**
 * POST /api/group/leave
 * Leave group
 */
router.post('/leave', resolveInstance, proxyToContainer);

/**
 * POST /api/group/invite-code/get
 * Get group invite code
 */
router.post('/invite-code/get', resolveInstance, proxyToContainer);

/**
 * POST /api/group/invite-code/revoke
 * Revoke group invite code
 */
router.post('/invite-code/revoke', resolveInstance, proxyToContainer);

/**
 * POST /api/group/join-with-code
 * Join group with invite code
 */
router.post('/join-with-code', resolveInstance, proxyToContainer);

/**
 * POST /api/group/settings/announcement
 * Set group announcement setting
 */
router.post('/settings/announcement', resolveInstance, proxyToContainer);

/**
 * POST /api/group/settings/locked
 * Set group locked setting
 */
router.post('/settings/locked', resolveInstance, proxyToContainer);

/**
 * POST /api/group/update-subject
 * Update group subject/name
 */
router.post('/update-subject', resolveInstance, proxyToContainer);

/**
 * POST /api/group/update-description
 * Update group description
 */
router.post('/update-description', resolveInstance, proxyToContainer);

/**
 * POST /api/group/update-picture
 * Update group picture
 */
router.post('/update-picture', resolveInstance, proxyToContainer);

/**
 * DELETE /api/group/delete-picture
 * Delete group picture
 */
router.delete('/delete-picture', resolveInstance, proxyToContainer);

module.exports = router;