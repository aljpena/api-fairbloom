/**
 * server.js creates the Socket.IO `io` instance and calls setIO(io) once,
 * right after creating it. Controllers that need to broadcast a message
 * call getIO() at request-time (not at load-time), which sidesteps the
 * circular-require problem you'd get from a controller doing
 * `require("../server")` directly.
 */
let io = null;

const setIO = (ioInstance) => {
  io = ioInstance;
};

const getIO = () => io;

module.exports = { setIO, getIO };