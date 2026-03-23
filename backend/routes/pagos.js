const express = require("express");
const router = express.Router();
const { registrar, listar, listarPorCliente, actualizarEstado } = require("../controllers/pagoController");
const { verificarToken, soloAdmin } = require("../middleware/auth");

router.post("/", verificarToken, registrar);
router.get("/", verificarToken, soloAdmin, listar);
router.get("/cliente/:clienteId", verificarToken, listarPorCliente);
router.patch("/:id/estado", verificarToken, soloAdmin, actualizarEstado);

module.exports = router;
