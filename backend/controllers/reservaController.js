const Reserva = require("../models/Reserva");
const mongoose = require("mongoose");

const SERVICIOS_VALIDOS = ["grabacion", "mezcla", "masterizacion", "produccion"];
const ESTADOS_VALIDOS = ["pendiente", "confirmada", "cancelada", "completada"];

exports.crear = async (req, res) => {
  try {
    const { clienteId, servicio, fecha, duracionHoras, notas } = req.body;

    if (!clienteId || !mongoose.isValidObjectId(clienteId))
      return res.status(400).json({ message: "clienteId inválido o faltante" });
    if (!servicio || !SERVICIOS_VALIDOS.includes(servicio))
      return res.status(400).json({ message: `El servicio debe ser uno de: ${SERVICIOS_VALIDOS.join(", ")}` });
    if (!fecha)
      return res.status(400).json({ message: "La fecha es obligatoria" });
    if (!duracionHoras || isNaN(duracionHoras) || Number(duracionHoras) < 1)
      return res.status(400).json({ message: "La duración debe ser al menos 1 hora" });

    const reserva = new Reserva({
      clienteId,
      servicio,
      fecha,
      duracionHoras: Number(duracionHoras),
      notas
    });
    await reserva.save();

    res.status(201).json({ message: "Reserva creada", reserva });
  } catch (error) {
    console.error("[reserva.crear]", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};

exports.listar = async (req, res) => {
  try {
    const reservas = await Reserva.find().populate("clienteId", "nombre correo");
    res.json(reservas);
  } catch (error) {
    console.error("[reserva.listar]", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};

exports.listarPorCliente = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.clienteId))
      return res.status(400).json({ message: "ID de cliente inválido" });

    const reservas = await Reserva.find({ clienteId: req.params.clienteId });
    res.json(reservas);
  } catch (error) {
    console.error("[reserva.listarPorCliente]", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};

exports.actualizarEstado = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(400).json({ message: "ID de reserva inválido" });

    const { estado } = req.body;
    if (!estado || !ESTADOS_VALIDOS.includes(estado))
      return res.status(400).json({ message: `El estado debe ser uno de: ${ESTADOS_VALIDOS.join(", ")}` });

    const reserva = await Reserva.findByIdAndUpdate(
      req.params.id,
      { estado },
      { new: true }
    );
    if (!reserva) return res.status(404).json({ message: "Reserva no encontrada" });

    res.json({ message: "Estado actualizado", reserva });
  } catch (error) {
    console.error("[reserva.actualizarEstado]", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};

exports.eliminar = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(400).json({ message: "ID de reserva inválido" });

    const reserva = await Reserva.findByIdAndDelete(req.params.id);
    if (!reserva) return res.status(404).json({ message: "Reserva no encontrada" });

    res.json({ message: "Reserva eliminada" });
  } catch (error) {
    console.error("[reserva.eliminar]", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};
