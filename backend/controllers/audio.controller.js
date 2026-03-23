const Mezcla = require("../models/Mezcla");

exports.uploadAudio = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No se recibió ningún archivo de audio" });

    const userId = req.usuario.userId || req.usuario.id || req.usuario._id;
    console.log("uploadAudio - req.usuario:", JSON.stringify(req.usuario), "userId:", userId);

    const mezcla = await Mezcla.create({
      usuario: userId,
      url: req.file.path,
      public_id: req.file.filename,
      nombre: req.body.nombre || "Mezcla"
    });

    res.json({
      message: "Audio subido correctamente",
      url: mezcla.url,
      public_id: mezcla.public_id,
      id: mezcla._id
    });
  } catch (error) {
    console.log("Error en uploadAudio:", error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
};

exports.getMezclas = async (req, res) => {
  try {
    const userId = req.usuario.userId || req.usuario.id || req.usuario._id;
    const mezclas = await Mezcla.find({ usuario: userId }).sort({ fecha: -1 });
    res.json(mezclas);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteMezcla = async (req, res) => {
  try {
    const userId = req.usuario.userId || req.usuario.id || req.usuario._id;
    const mezcla = await Mezcla.findOneAndDelete({ _id: req.params.id, usuario: userId });
    if (!mezcla) return res.status(404).json({ message: "No encontrada" });
    res.json({ message: "Eliminada" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
