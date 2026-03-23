const Reserva = require("../models/Reserva");

exports.crear = async (req, res) => {
  try {
    const { clienteId, servicio, fecha, duracionHoras, notas } = req.body;

    const reserva = new Reserva({ clienteId, servicio, fecha, duracionHoras, notas });
    await reserva.save();

    res.status(201).json({ message: "Reserva creada", reserva });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
};

exports.listar = async (req, res) => {
  try {
    const reservas = await Reserva.find().populate("clienteId", "nombre correo");
    res.json(reservas);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
};

exports.listarPorCliente = async (req, res) => {
  try {
    const reservas = await Reserva.find({ clienteId: req.params.clienteId });
    res.json(reservas);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
};

exports.actualizarEstado = async (req, res) => {
  try {
    const { estado } = req.body;
    const reserva = await Reserva.findByIdAndUpdate(
      req.params.id,
      { estado },
      { new: true }
    );
    if (!reserva) return res.status(404).json({ message: "Reserva no encontrada" });
    res.json({ message: "Estado actualizado", reserva });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
};

exports.eliminar = async (req, res) => {
  try {
    await Reserva.findByIdAndDelete(req.params.id);
    res.json({ message: "Reserva eliminada" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
};
