const mongoose = require("mongoose");

const pagoSchema = new mongoose.Schema({
  clienteId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  reservaId: { type: mongoose.Schema.Types.ObjectId, ref: "Reserva" },
  proyectoId: { type: mongoose.Schema.Types.ObjectId, ref: "Proyecto" },
  monto: { type: Number, required: true },
  metodo: {
    type: String,
    enum: ["efectivo", "transferencia", "tarjeta"],
    required: true
  },
  estado: {
    type: String,
    enum: ["pendiente", "completado", "rechazado"],
    default: "pendiente"
  },
  referencia: { type: String }
}, { timestamps: true });

module.exports = mongoose.model("Pago", pagoSchema);
