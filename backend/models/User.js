const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  correo: { type: String, required: true, unique: true },
  contraseña: { type: String, required: true },
  telefono: { type: String },
  rol: { type: String, enum: ["cliente", "admin"], default: "cliente" }
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
