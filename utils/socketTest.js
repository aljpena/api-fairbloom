const { io } = require("socket.io-client");

const URL = "http://localhost:5000";
const TOKEN = process.argv[2]; // a valid JWT
const CONVERSATION_ID = process.argv[3]; // a conversation id

const socket = io(URL, { auth: { token: TOKEN } });

socket.on("connect_error", (err) => {
  console.log("connect_error:", err.message);
  process.exit(0);
});

socket.on("connect", () => {
  console.log("connected");
  socket.emit("join_room", CONVERSATION_ID, (res) => {
    console.log("join_room result:", res);
    socket.on("receive_message", (m) => console.log("received:", m.content));
    console.log("listening, send a message via the REST endpoint now...");
  });
});
