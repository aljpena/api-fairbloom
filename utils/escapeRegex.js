// Stops user input from being interpreted as a regex pattern.
module.exports = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");