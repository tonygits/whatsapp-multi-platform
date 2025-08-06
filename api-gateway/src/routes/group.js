const express = require('express');
const resolveInstance = require('../middleware/resolveInstance');
const proxyToContainer = require('../middleware/proxyToContainer');

const router = express.Router();

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