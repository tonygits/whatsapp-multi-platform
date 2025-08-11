const express = require('express');
const resolveInstance = require('../middleware/resolveInstance');
const proxyToContainer = require('../middleware/proxyToContainer');

const router = express.Router();

/**
 * GET /api/group/info
 * Group Info
 */
router.get('/info', [resolveInstance, resolveInstance.ensureActive], proxyToContainer);

/**
 * POST /api/group
 * Create group and add participant
 */
router.post('/', [resolveInstance, resolveInstance.ensureActive], proxyToContainer);

/**
 * POST /api/group/participants
 * Adding more participants to group
 */
router.post('/participants', [resolveInstance, resolveInstance.ensureActive], proxyToContainer);

/**
 * POST /api/group/participants/remove
 * Remove participants from group
 */
router.post('/participants/remove', [resolveInstance, resolveInstance.ensureActive], proxyToContainer);

/**
 * POST /api/group/participants/promote
 * Promote participants to admin
 */
router.post('/participants/promote', [resolveInstance, resolveInstance.ensureActive], proxyToContainer);

/**
 * POST /api/group/participants/demote
 * Demote participants to member
 */
router.post('/participants/demote', [resolveInstance, resolveInstance.ensureActive], proxyToContainer);

/**
 * POST /api/group/join-with-link
 * Join group with link
 */
router.post('/join-with-link', [resolveInstance, resolveInstance.ensureActive], proxyToContainer);

/**
 * GET /api/group/info-from-link
 * Get group information from invitation link
 */
router.get('/info-from-link', [resolveInstance, resolveInstance.ensureActive], proxyToContainer);

/**
 * GET /api/group/participant-requests
 * Get list of participant requests to join group
 */
router.get('/participant-requests', [resolveInstance, resolveInstance.ensureActive], proxyToContainer);

/**
 * POST /api/group/participant-requests/approve
 * Approve participant request to join group
 */
router.post('/participant-requests/approve', [resolveInstance, resolveInstance.ensureActive], proxyToContainer);

/**
 * POST /api/group/participant-requests/reject
 * Reject participant request to join group
 */
router.post('/participant-requests/reject', [resolveInstance, resolveInstance.ensureActive], proxyToContainer);

/**
 * POST /api/group/leave
 * Leave group
 */
router.post('/leave', [resolveInstance, resolveInstance.ensureActive], proxyToContainer);

/**
 * POST /api/group/photo
 * Set group photo
 */
router.post('/photo', [resolveInstance, resolveInstance.ensureActive], proxyToContainer);

/**
 * POST /api/group/name
 * Set group name
 */
router.post('/name', [resolveInstance, resolveInstance.ensureActive], proxyToContainer);

/**
 * POST /api/group/locked
 * Set group locked status
 */
router.post('/locked', [resolveInstance, resolveInstance.ensureActive], proxyToContainer);

/**
 * POST /api/group/announce
 * Set group announce mode
 */
router.post('/announce', [resolveInstance, resolveInstance.ensureActive], proxyToContainer);

/**
 * POST /api/group/topic
 * Set group topic
 */
router.post('/topic', [resolveInstance, resolveInstance.ensureActive], proxyToContainer);

module.exports = router;