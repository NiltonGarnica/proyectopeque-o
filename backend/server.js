require('dotenv').config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
app.use(cors({
  origin: process.env.FRONTEND_URL || '*'
}));
app.use(express.json());

console.log("Iniciando servidor Powersound...");

// Conexión MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB conectado"))
  .catch(err => console.log("Error Mongo:", err));

// Rutas
app.use("/auth", require("./routes/auth"));
app.use("/reservas", require("./routes/reservas"));
app.use("/proyectos", require("./routes/proyectos"));
app.use("/pagos", require("./routes/pagos"));
app.use("/api", require("./routes/audio.routes"));
app.use("/api/activity", require("./routes/activity"));
app.use("/api/piano-roll", require("./routes/pianoRoll"));

// Health check
app.get("/", (req, res) => res.json({ status: "Powersound API funcionando" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Servidor corriendo en puerto " + PORT));
