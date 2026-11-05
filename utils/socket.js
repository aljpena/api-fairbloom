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

// True if any live socket of this user is currently inside the given room.
const isUserInRoom = (userId, room) => {
  if (!io) return false;
  const socketIds = io.sockets.adapter.rooms.get(String(room));
  if (!socketIds) return false;
  for (const sid of socketIds) {
    const s = io.sockets.sockets.get(sid);
    if (s && s.user && String(s.user._id) === String(userId)) return true;
  }
  return false;
};

module.exports = { setIO, getIO, disconnectUser, isUserInRoom };