const Pago = require("../models/Pago");

exports.registrar = async (req, res) => {
  try {
    const { clienteId, reservaId, proyectoId, monto, metodo, referencia } = req.body;
    const pago = new Pago({ clienteId, reservaId, proyectoId, monto, metodo, referencia });
    await pago.save();
    res.status(201).json({ message: "Pago registrado", pago });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
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
    console.log(error);
    res.status(500).json({ error: error.message });
  }
};

exports.listarPorCliente = async (req, res) => {
  try {
    const pagos = await Pago.find({ clienteId: req.params.clienteId })
      .populate("reservaId", "servicio fecha")
      .populate("proyectoId", "titulo");
    res.json(pagos);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
};

exports.actualizarEstado = async (req, res) => {
  try {
    const { estado } = req.body;
    const pago = await Pago.findByIdAndUpdate(
      req.params.id,
      { estado },
      { new: true }
    );
    if (!pago) return res.status(404).json({ message: "Pago no encontrado" });
    res.json({ message: "Estado actualizado", pago });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
};
