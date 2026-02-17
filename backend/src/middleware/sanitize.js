const sanitizeString = (value) => value.replace(/[<>]/g, "").trim();

const sanitizeNode = (node) => {
  if (typeof node === "string") return sanitizeString(node);
  if (Array.isArray(node)) return node.map((item) => sanitizeNode(item));
  if (node && typeof node === "object") {
    return Object.entries(node).reduce((acc, [key, value]) => {
      acc[key] = sanitizeNode(value);
      return acc;
    }, {});
  }
  return node;
};

export const sanitizeInput = (req, _res, next) => {
  if (req.body) req.body = sanitizeNode(req.body);
  if (req.query) req.query = sanitizeNode(req.query);
  if (req.params) req.params = sanitizeNode(req.params);
  next();
};