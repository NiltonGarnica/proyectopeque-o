const express = require("express");
const router = express.Router();
const { crear, listar, listarPorCliente, actualizarEstado, agregarArchivo, eliminar } = require("../controllers/proyectoController");
const { verificarToken, soloAdmin } = require("../middleware/auth");
const upload = require("../middleware/upload");

router.post("/", verificarToken, crear);
router.get("/", verificarToken, soloAdmin, listar);
router.get("/cliente/:clienteId", verificarToken, listarPorCliente);
router.patch("/:id/estado", verificarToken, soloAdmin, actualizarEstado);
router.post("/:id/archivos", verificarToken, upload.single("archivo"), agregarArchivo);
router.delete("/:id", verificarToken, soloAdmin, eliminar);

module.exports = router;
