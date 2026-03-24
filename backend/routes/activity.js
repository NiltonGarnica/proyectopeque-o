const express = require('express');
const router  = express.Router();
const { ping, getRealtimeUsers } = require('../controllers/activityController');
const { verificarToken, soloAdmin } = require('../middleware/auth');

// Cualquier usuario autenticado envía ping
router.post('/ping', verificarToken, ping);

// Solo admin ve la lista
router.get('/realtime-users', verificarToken, soloAdmin, getRealtimeUsers);

module.exports = router;
