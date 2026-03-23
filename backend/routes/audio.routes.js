const express = require("express");
const router = express.Router();
const { uploadAudio } = require("../controllers/audio.controller");
const { verificarToken } = require("../middleware/auth");
const upload = require("../middleware/upload");

router.post("/upload-audio", verificarToken, (req, res, next) => {
  upload.single("audio")(req, res, (err) => {
    if (err) {
      console.log("Error en upload de audio:", err);
      return res.status(500).json({ error: err.message || String(err) });
    }
    next();
  });
}, uploadAudio);

module.exports = router;
