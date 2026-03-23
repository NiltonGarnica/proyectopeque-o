const mongoose = require("mongoose");

const reservaSchema = new mongoose.Schema({
  clienteId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  servicio: {
    type: String,
    enum: ["grabacion", "mezcla", "masterizacion", "produccion"],
    required: true
  },
  fecha: { type: Date, required: true },
  duracionHoras: { type: Number, required: true },
  estado: {
    type: String,
    enum: ["pendiente", "confirmada", "cancelada", "completada"],
    default: "pendiente"
  },
  notas: { type: String }
}, { timestamps: true });

module.exports = mongoose.model("Reserva", reservaSchema);
