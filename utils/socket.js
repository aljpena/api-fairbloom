let io = null;

const setIO = (ioInstance) => {
  io = ioInstance;
};

const getIO = () => io;

// Forcibly closes every live socket belonging to a user.
const disconnectUser = (userId) => {
  if (!io) return;
  for (const [, socket] of io.sockets.sockets) {
    if (socket.user && String(socket.user._id) === String(userId)) {
      socket.disconnect(true);
    }
  }
};

module.exports = { setIO, getIO, disconnectUser };