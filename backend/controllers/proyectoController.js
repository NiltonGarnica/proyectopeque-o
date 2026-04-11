const Proyecto = require("../models/Proyecto");
const mongoose = require("mongoose");

const ESTADOS_VALIDOS = ["en_progreso", "revision", "completado", "entregado"];

exports.crear = async (req, res) => {
  try {
    const { clienteId, titulo, descripcion, genero } = req.body;

    if (!clienteId || !mongoose.isValidObjectId(clienteId))
      return res.status(400).json({ message: "clienteId inválido o faltante" });
    if (!titulo || !titulo.trim())
      return res.status(400).json({ message: "El título del proyecto es obligatorio" });

    const proyecto = new Proyecto({
      clienteId,
      titulo: titulo.trim(),
      descripcion: descripcion?.trim() || undefined,
      genero: genero?.trim() || undefined
    });
    await proyecto.save();

    res.status(201).json({ message: "Proyecto creado", proyecto });
  } catch (error) {
    console.error("[proyecto.crear]", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};

exports.listar = async (req, res) => {
  try {
    const proyectos = await Proyecto.find().populate("clienteId", "nombre correo");
    res.json(proyectos);
  } catch (error) {
    console.error("[proyecto.listar]", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};

exports.listarPorCliente = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.clienteId))
      return res.status(400).json({ message: "ID de cliente inválido" });

    const proyectos = await Proyecto.find({ clienteId: req.params.clienteId });
    res.json(proyectos);
  } catch (error) {
    console.error("[proyecto.listarPorCliente]", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};

exports.actualizarEstado = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(400).json({ message: "ID de proyecto inválido" });

    const { estado } = req.body;
    if (!estado || !ESTADOS_VALIDOS.includes(estado))
      return res.status(400).json({ message: `El estado debe ser uno de: ${ESTADOS_VALIDOS.join(", ")}` });

    const proyecto = await Proyecto.findByIdAndUpdate(
      req.params.id,
      { estado },
      { new: true }
    );
    if (!proyecto) return res.status(404).json({ message: "Proyecto no encontrado" });

    res.json({ message: "Estado actualizado", proyecto });
  } catch (error) {
    console.error("[proyecto.actualizarEstado]", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};

exports.agregarArchivo = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(400).json({ message: "ID de proyecto inválido" });
    if (!req.file)
      return res.status(400).json({ message: "No se subió ningún archivo" });

    const extension = req.file.originalname.split(".").pop().toLowerCase();
    const tipo = ["wav", "mp3"].includes(extension) ? extension : "otro";

    const proyecto = await Proyecto.findByIdAndUpdate(
      req.params.id,
      { $push: { archivos: { nombre: req.file.originalname, url: req.file.path, tipo } } },
      { new: true }
    );
    if (!proyecto) return res.status(404).json({ message: "Proyecto no encontrado" });

    res.json({ message: "Archivo subido", proyecto });
  } catch (error) {
    console.error("[proyecto.agregarArchivo]", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};

exports.eliminar = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(400).json({ message: "ID de proyecto inválido" });

    const proyecto = await Proyecto.findByIdAndDelete(req.params.id);
    if (!proyecto) return res.status(404).json({ message: "Proyecto no encontrado" });

    res.json({ message: "Proyecto eliminado" });
  } catch (error) {
    console.error("[proyecto.eliminar]", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};
