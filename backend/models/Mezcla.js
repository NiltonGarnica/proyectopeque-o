const mongoose = require("mongoose");

const mezclaSchema = new mongoose.Schema({
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  url: { type: String, required: true },
  public_id: { type: String },
  nombre: { type: String, default: "Mezcla" },
  fecha: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Mezcla", mezclaSchema);
