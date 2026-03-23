const User = require("../models/User");

exports.register = async (req, res) => {
  try {
    const { nombre, correo, contraseña, telefono } = req.body;

    const existe = await User.findOne({ correo });
    if (existe) return res.status(400).json({ message: "El correo ya está registrado" });

    const user = new User({ nombre, correo, contraseña, telefono });
    await user.save();

    res.status(201).json({ message: "Usuario creado correctamente" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { correo, contraseña } = req.body;

    const user = await User.findOne({ correo, contraseña });
    if (!user) return res.status(401).json({ message: "Credenciales incorrectas" });

    res.json({ userId: user._id, nombre: user.nombre, rol: user.rol });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
};
