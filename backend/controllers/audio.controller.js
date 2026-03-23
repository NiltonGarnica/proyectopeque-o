const Mezcla = require("../models/Mezcla");

exports.uploadAudio = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No se recibió ningún archivo de audio" });

    const mezcla = await Mezcla.create({
      usuario: req.usuario.id,
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
    res.status(500).json({ error: error.message });
  }
};

exports.getMezclas = async (req, res) => {
  try {
    const mezclas = await Mezcla.find({ usuario: req.usuario.id }).sort({ fecha: -1 });
    res.json(mezclas);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteMezcla = async (req, res) => {
  try {
    const mezcla = await Mezcla.findOneAndDelete({ _id: req.params.id, usuario: req.usuario.id });
    if (!mezcla) return res.status(404).json({ message: "No encontrada" });
    res.json({ message: "Eliminada" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
