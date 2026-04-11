const Pago = require("../models/Pago");
const mongoose = require("mongoose");

const METODOS_VALIDOS = ["efectivo", "transferencia", "tarjeta"];
const ESTADOS_VALIDOS = ["pendiente", "completado", "rechazado"];

exports.registrar = async (req, res) => {
  try {
    const { clienteId, reservaId, proyectoId, monto, metodo, referencia } = req.body;

    if (!clienteId || !mongoose.isValidObjectId(clienteId))
      return res.status(400).json({ message: "clienteId inválido o faltante" });
    if (monto === undefined || monto === null || isNaN(monto) || Number(monto) <= 0)
      return res.status(400).json({ message: "El monto debe ser mayor a 0" });
    if (!metodo || !METODOS_VALIDOS.includes(metodo))
      return res.status(400).json({ message: `El método debe ser uno de: ${METODOS_VALIDOS.join(", ")}` });
    if (reservaId && !mongoose.isValidObjectId(reservaId))
      return res.status(400).json({ message: "reservaId inválido" });
    if (proyectoId && !mongoose.isValidObjectId(proyectoId))
      return res.status(400).json({ message: "proyectoId inválido" });

    const body = {
      clienteId,
      monto: Number(monto),
      metodo,
      referencia: referencia?.trim() || undefined
    };
    if (reservaId) body.reservaId = reservaId;
    if (proyectoId) body.proyectoId = proyectoId;

    const pago = new Pago(body);
    await pago.save();

    res.status(201).json({ message: "Pago registrado", pago });
  } catch (error) {
    console.error("[pago.registrar]", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};

exports.listar = async (req, res) => {
  try {
    const pagos = await Pago.find()
      .populate("clienteId", "nombre correo")
      .populate("reservaId", "servicio fecha")
      .populate("proyectoId", "titulo");
    res.json(pagos);
  } catch (error) {
    console.error("[pago.listar]", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};

exports.listarPorCliente = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.clienteId))
      return res.status(400).json({ message: "ID de cliente inválido" });

    const pagos = await Pago.find({ clienteId: req.params.clienteId })
      .populate("reservaId", "servicio fecha")
      .populate("proyectoId", "titulo");
    res.json(pagos);
  } catch (error) {
    console.error("[pago.listarPorCliente]", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};

exports.actualizarEstado = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(400).json({ message: "ID de pago inválido" });

    const { estado } = req.body;
    if (!estado || !ESTADOS_VALIDOS.includes(estado))
      return res.status(400).json({ message: `El estado debe ser uno de: ${ESTADOS_VALIDOS.join(", ")}` });

    const pago = await Pago.findByIdAndUpdate(
      req.params.id,
      { estado },
      { new: true }
    );
    if (!pago) return res.status(404).json({ message: "Pago no encontrado" });

    res.json({ message: "Estado actualizado", pago });
  } catch (error) {
    console.error("[pago.actualizarEstado]", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};
