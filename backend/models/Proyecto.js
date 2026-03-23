const mongoose = require("mongoose");

const archivoSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  url: { type: String, required: true },
  tipo: { type: String, enum: ["wav", "mp3", "otro"] }
}, { _id: false });

const proyectoSchema = new mongoose.Schema({
  clienteId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  titulo: { type: String, required: true },
  descripcion: { type: String },
  genero: { type: String },
  estado: {
    type: String,
    enum: ["en_progreso", "revision", "completado", "entregado"],
    default: "en_progreso"
  },
  archivos: [archivoSchema]
}, { timestamps: true });

module.exports = mongoose.model("Proyecto", proyectoSchema);
