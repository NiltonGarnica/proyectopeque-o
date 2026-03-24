const ActivityRealtime = require('../models/ActivityRealtime');

// Obtener ciudad desde IP via ip-api.com (gratis, sin clave)
async function getCityFromIp(ip) {
  // Ignorar IPs locales
  if (!ip || ip === '::1' || ip.startsWith('127.') || ip.startsWith('::ffff:127.')) {
    return { city: 'Local', country: 'DEV' };
  }
  try {
    const cleanIp = ip.replace('::ffff:', '');
    const res = await fetch(`http://ip-api.com/json/${cleanIp}?fields=city,country`);
    const data = await res.json();
    return { city: data.city || '?', country: data.country || '?' };
  } catch {
    return { city: '?', country: '?' };
  }
}

// POST /api/activity/ping
exports.ping = async (req, res) => {
  try {
    const { page } = req.body;
    const userId = req.usuario.userId;
    const email  = req.usuario.email || '';

    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const ip = rawIp.split(',')[0].trim();

    const now = new Date();

    const existing = await ActivityRealtime.findOne({ userId });

    if (existing) {
      existing.page       = page || existing.page;
      existing.lastActive = now;
      existing.ip         = ip || existing.ip;
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
    res.status(500).json({ error: err.message });
  }
};

// GET /api/admin/realtime-users
exports.getRealtimeUsers = async (req, res) => {
  try {
    const cutoff = new Date(Date.now() - 15000); // activos en últimos 15s
    const users = await ActivityRealtime.find({ lastActive: { $gte: cutoff } });

    const result = users.map(u => ({
      email:       u.email,
      ip:          u.ip,
      city:        u.city,
      country:     u.country,
      page:        u.page,
      timeOnSite:  u.lastActive - u.firstVisit, // ms
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
