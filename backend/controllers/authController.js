const User = require("../models/User");
const jwt = require("jsonwebtoken");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const generarToken = (user) => {
  return jwt.sign(
    { userId: user._id, email: user.correo, rol: user.rol },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

exports.register = async (req, res) => {
  try {
    const { nombre, correo, contraseña, telefono } = req.body;

    if (!nombre || !nombre.trim())
      return res.status(400).json({ message: "El nombre es obligatorio" });
    if (!correo || !correo.trim())
      return res.status(400).json({ message: "El correo es obligatorio" });
    if (!EMAIL_REGEX.test(correo.trim()))
      return res.status(400).json({ message: "El correo no tiene un formato válido" });
    if (!contraseña)
      return res.status(400).json({ message: "La contraseña es obligatoria" });
    if (contraseña.length < 6)
      return res.status(400).json({ message: "La contraseña debe tener al menos 6 caracteres" });

    const existe = await User.findOne({ correo: correo.trim() });
    if (existe) return res.status(400).json({ message: "El correo ya está registrado" });

    const user = new User({
      nombre: nombre.trim(),
      correo: correo.trim(),
      contraseña,
      telefono: telefono?.trim() || undefined
    });
    await user.save();

    const token = generarToken(user);
    res.status(201).json({ message: "Usuario creado correctamente", token, userId: user._id, nombre: user.nombre, rol: user.rol });
  } catch (error) {
    console.error("[register]", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};

exports.login = async (req, res) => {
  try {
    const { correo, contraseña } = req.body;

    if (!correo || !correo.trim())
      return res.status(400).json({ message: "El correo es obligatorio" });
    if (!contraseña)
      return res.status(400).json({ message: "La contraseña es obligatoria" });

    const user = await User.findOne({ correo: correo.trim(), contraseña });
    if (!user) return res.status(401).json({ message: "Credenciales incorrectas" });

    const token = generarToken(user);
    res.json({ token, userId: user._id, nombre: user.nombre, rol: user.rol });
  } catch (error) {
    console.error("[login]", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};
