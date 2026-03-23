const upload = require("../middleware/upload");

exports.uploadAudio = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No se recibió ningún archivo de audio" });

    res.json({
      message: "Audio subido correctamente",
      url: req.file.path,
      public_id: req.file.filename
    });
  } catch (error) {
    console.log("Error en uploadAudio:", error);
    res.status(500).json({ error: error.message });
  }
};
