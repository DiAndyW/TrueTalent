// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // In production, specify your frontend domain
    methods: ["GET", "POST"]
  }
});

// Store active rooms
const rooms = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Create a new room
  socket.on('create-room', (data) => {
    const roomId = uuidv4().substring(0, 8);
    rooms[roomId] = {
      code: '// Start coding here...',
      language: 'javascript',
      users: {}
    };
    rooms[roomId].users[socket.id] = data.username;
    
    socket.join(roomId);
    socket.emit('room-joined', {
      roomId,
      initialCode: rooms[roomId].code
    });
    
    console.log(`Room created: ${roomId} by ${data.username}`);
  });

  // Join an existing room
  socket.on('join-room', (data) => {
    const { roomId, username } = data;
    
    if (!rooms[roomId]) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }
    
    // Add user to room
    rooms[roomId].users[socket.id] = username;
    socket.join(roomId);
    
    // Notify user they've joined
    socket.emit('room-joined', {
      roomId,
      initialCode: rooms[roomId].code,
      language: rooms[roomId].language
    });
    
    // Notify others in the room
    socket.to(roomId).emit('user-joined', {
      username,
      userId: socket.id
    });
    
    console.log(`${username} joined room: ${roomId}`);
  });

  // Handle code updates
  socket.on('code-update', (data) => {
    const { roomId, code } = data;
    
    if (rooms[roomId]) {
      rooms[roomId].code = code;
      socket.to(roomId).emit('code-update', { code });
    }
  });
  
  // Handle language changes
  socket.on('language-change', (data) => {
    const { roomId, language } = data;
    
    if (rooms[roomId]) {
      rooms[roomId].language = language;
      socket.to(roomId).emit('language-change', { language });
    }
  });

  // Handle chat messages
  socket.on('chat-message', (data) => {
    const { roomId, username, message } = data;
    
    socket.to(roomId).emit('chat-message', {
      username,
      message
    });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Find which room this user was in
    for (const roomId in rooms) {
      if (rooms[roomId].users[socket.id]) {
        const username = rooms[roomId].users[socket.id];
        
        // Notify others in the room
        socket.to(roomId).emit('user-left', {
          username,
          userId: socket.id
        });
        
        // Remove user from room
        delete rooms[roomId].users[socket.id];
        
        // If room is empty, delete it
        if (Object.keys(rooms[roomId].users).length === 0) {
          delete rooms[roomId];
          console.log(`Room ${roomId} deleted (empty)`);
        }
        
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});