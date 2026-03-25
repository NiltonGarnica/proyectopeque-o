const router = require('express').Router();
const { verificarToken } = require('../middleware/auth');
const PianoRoll = require('../models/PianoRoll');

// Guardar nuevo proyecto
router.post('/', verificarToken, async (req, res) => {
  try {
    const { nombre, bpm, notes } = req.body;
    const roll = await PianoRoll.create({ userId: req.usuario.userId, nombre, bpm, notes });
    res.json(roll);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Listar proyectos del usuario
router.get('/', verificarToken, async (req, res) => {
  try {
    const rolls = await PianoRoll.find({ userId: req.usuario.userId })
      .select('_id nombre bpm notes createdAt')
      .sort('-createdAt');
    res.json(rolls);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Eliminar
router.delete('/:id', verificarToken, async (req, res) => {
  try {
    await PianoRoll.deleteOne({ _id: req.params.id, userId: req.usuario.userId });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
