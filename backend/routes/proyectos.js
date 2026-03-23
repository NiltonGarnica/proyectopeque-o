const express = require("express");
const router = express.Router();
const { crear, listar, listarPorCliente, actualizarEstado, agregarArchivo, eliminar } = require("../controllers/proyectoController");
const upload = require("../middleware/upload");

router.post("/", crear);
router.get("/", listar);
router.get("/cliente/:clienteId", listarPorCliente);
router.patch("/:id/estado", actualizarEstado);
router.post("/:id/archivos", upload.single("archivo"), agregarArchivo);
router.delete("/:id", eliminar);

module.exports = router;
