import jwt from "jsonwebtoken";

export const verifyToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const queryToken = req.query.token;

  if (!authHeader && !queryToken)
    return res.status(401).json({ error: "No token provided" });

  const token = authHeader ? authHeader.split(" ")[1] : queryToken;

  try {
    req.user = jwt.verify(
      token,
      process.env.JWT_SECRET || "fallback_secret_key_123",
    );
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
};

export const verifySuperAdmin = (req, res, next) => {
  verifyToken(req, res, () => {
    if (req.user.role !== "superadmin") {
      return res.status(403).json({ error: "Superadmin privileges required" });
    }
    next();
  });
};

export const verifyAdmin = (req, res, next) => {
  verifyToken(req, res, () => {
    if (req.user.role !== "admin" && req.user.role !== "superadmin") {
      return res.status(403).json({ error: "Administrator privileges required" });
    }
    next();
  });
};

export const optionalToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const queryToken = req.query.token;
  const token = authHeader ? authHeader.split(" ")[1] : queryToken;

  if (!token) return next();

  try {
    req.user = jwt.verify(
      token,
      process.env.JWT_SECRET || "fallback_secret_key_123",
    );
  } catch {
    // invalid token — treat as unauthenticated
  }
  next();
};
