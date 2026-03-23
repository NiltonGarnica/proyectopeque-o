const Proyecto = require("../models/Proyecto");

exports.crear = async (req, res) => {
  try {
    const { clienteId, titulo, descripcion, genero } = req.body;
    const proyecto = new Proyecto({ clienteId, titulo, descripcion, genero });
    await proyecto.save();
    res.status(201).json({ message: "Proyecto creado", proyecto });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
};

exports.listar = async (req, res) => {
  try {
    const proyectos = await Proyecto.find().populate("clienteId", "nombre correo");
    res.json(proyectos);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
};

exports.listarPorCliente = async (req, res) => {
  try {
    const proyectos = await Proyecto.find({ clienteId: req.params.clienteId });
    res.json(proyectos);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
};

exports.actualizarEstado = async (req, res) => {
  try {
    const { estado } = req.body;
    const proyecto = await Proyecto.findByIdAndUpdate(
      req.params.id,
      { estado },
      { new: true }
    );
    if (!proyecto) return res.status(404).json({ message: "Proyecto no encontrado" });
    res.json({ message: "Estado actualizado", proyecto });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
};

exports.agregarArchivo = async (req, res) => {
  try {
    const { nombre, url, tipo } = req.body;
    const proyecto = await Proyecto.findByIdAndUpdate(
      req.params.id,
      { $push: { archivos: { nombre, url, tipo } } },
      { new: true }
    );
    if (!proyecto) return res.status(404).json({ message: "Proyecto no encontrado" });
    res.json({ message: "Archivo agregado", proyecto });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
};

exports.eliminar = async (req, res) => {
  try {
    await Proyecto.findByIdAndDelete(req.params.id);
    res.json({ message: "Proyecto eliminado" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
};
