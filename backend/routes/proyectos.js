const express = require("express");
const router = express.Router();
const { crear, listar, listarPorCliente, actualizarEstado, agregarArchivo, eliminar } = require("../controllers/proyectoController");

router.post("/", crear);
router.get("/", listar);
router.get("/cliente/:clienteId", listarPorCliente);
router.patch("/:id/estado", actualizarEstado);
router.post("/:id/archivos", agregarArchivo);
router.delete("/:id", eliminar);

module.exports = router;
