const express = require("express");
const router = express.Router();
const { crear, listar, listarPorCliente, actualizarEstado, eliminar } = require("../controllers/reservaController");

router.post("/", crear);
router.get("/", listar);
router.get("/cliente/:clienteId", listarPorCliente);
router.patch("/:id/estado", actualizarEstado);
router.delete("/:id", eliminar);

module.exports = router;
