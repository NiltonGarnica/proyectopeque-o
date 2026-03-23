const express = require("express");
const router = express.Router();
const { crear, listar, listarPorCliente, actualizarEstado, eliminar } = require("../controllers/reservaController");
const { verificarToken, soloAdmin } = require("../middleware/auth");

router.post("/", verificarToken, crear);
router.get("/", verificarToken, soloAdmin, listar);
router.get("/cliente/:clienteId", verificarToken, listarPorCliente);
router.patch("/:id/estado", verificarToken, soloAdmin, actualizarEstado);
router.delete("/:id", verificarToken, soloAdmin, eliminar);

module.exports = router;
