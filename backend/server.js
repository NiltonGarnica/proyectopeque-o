const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

console.log("Iniciando servidor...");

// 🔗 CONEXIÓN MONGODB ATLAS
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB conectado"))
.catch(err => console.log("Error Mongo:", err));

// 📦 MODELO USUARIO (ADAPTADO A TU DB)
const User = mongoose.model("User", {
  nombre: String,
  correo: String,
  contraseña: String,
  rol: String
});

// 📦 MODELO ACTIVIDAD
const Activity = mongoose.model("Activity", {
  texto: String,
  fecha: { type: Date, default: Date.now },
  userId: String
});

// 🧑‍💻 REGISTRO
app.post("/register", async (req, res) => {
  try {
    const { correo, contraseña } = req.body;

    const user = new User({
      nombre: "usuario",
      correo,
      contraseña,
      rol: "usuario"
    });

    await user.save();

    res.json({ message: "Usuario creado" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
});

// 🔐 LOGIN
app.post("/login", async (req, res) => {
  try {
    const { correo, contraseña } = req.body;

    const user = await User.findOne({ correo, contraseña });

    if (!user) {
      return res.status(401).json({ message: "Credenciales incorrectas" });
    }

    res.json({ userId: user._id });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
});

// ➕ CREAR ACTIVIDAD
app.post("/actividad", async (req, res) => {
  try {
    const { texto, userId } = req.body;

    const actividad = new Activity({
      texto,
      userId
    });

    await actividad.save();

    res.json({ message: "Actividad guardada" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
});

// 📄 OBTENER ACTIVIDADES
app.get("/actividades/:userId", async (req, res) => {
  try {
    const actividades = await Activity.find({
      userId: req.params.userId
    });

    res.json(actividades);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
});

// 🚀 SERVIDOR
app.listen(3000, () => {
  console.log("Servidor corriendo en http://localhost:3000");
});