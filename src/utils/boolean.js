const boolean = (value) =>
  value === true || value === "true"
    ? true
    : value === false || value === "false"
    ? false
    : undefined;

module.exports = { boolean };
