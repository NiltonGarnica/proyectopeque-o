const express = require("express");
const router = express.Router();
const { registrar, listar, listarPorCliente, actualizarEstado } = require("../controllers/pagoController");

router.post("/", registrar);
router.get("/", listar);
router.get("/cliente/:clienteId", listarPorCliente);
router.patch("/:id/estado", actualizarEstado);

module.exports = router;
