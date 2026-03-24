const https = require('https');
const ActivityRealtime = require('../models/ActivityRealtime');

// Geolocalización via ip-api.com usando https nativo (sin fetch)
function getCityFromIp(ip) {
  return new Promise((resolve) => {
    if (!ip || ip === '::1' || ip.startsWith('127.') || ip.startsWith('::ffff:127.')) {
      return resolve({ city: 'Local', country: 'DEV' });
    }
    const cleanIp = ip.replace('::ffff:', '').split(',')[0].trim();
    const url = `http://ip-api.com/json/${cleanIp}?fields=city,country`;

    // ip-api es HTTP, usamos http module
    const http = require('http');
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ city: parsed.city || '?', country: parsed.country || '?' });
        } catch {
          resolve({ city: '?', country: '?' });
        }
      });
    });
    req.on('error', () => resolve({ city: '?', country: '?' }));
    req.setTimeout(3000, () => { req.destroy(); resolve({ city: '?', country: '?' }); });
  });
}

// POST /api/activity/ping
exports.ping = async (req, res) => {
  try {
    const { page } = req.body;
    const userId = String(req.usuario.userId);
    const email  = req.usuario.email || '';

    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const ip = rawIp.split(',')[0].trim();

    const now = new Date();
    const existing = await ActivityRealtime.findOne({ userId });

    if (existing) {
      existing.page       = page || existing.page;
      existing.lastActive = now;
      if (ip) existing.ip = ip;
      await existing.save();
    } else {
      const { city, country } = await getCityFromIp(ip);
      await ActivityRealtime.create({
        userId, email, ip, city, country,
        page: page || '/',
        firstVisit: now,
        lastActive: now,
      });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Ping error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// GET /api/activity/realtime-users
exports.getRealtimeUsers = async (req, res) => {
  try {
    const cutoff = new Date(Date.now() - 30000); // activos en últimos 30s
    const users  = await ActivityRealtime.find({ lastActive: { $gte: cutoff } });

    const result = users.map(u => ({
      email:      u.email || '(sin email)',
      ip:         u.ip    || '?',
      city:       u.city  || '?',
      country:    u.country || '?',
      page:       u.page  || '/',
      timeOnSite: u.lastActive - u.firstVisit,
    }));

    res.json(result);
  } catch (err) {
    console.error('Realtime users error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
