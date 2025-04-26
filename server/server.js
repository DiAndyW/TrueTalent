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
      initialCode: rooms[roomId].code,
      language: 'javascript',
      role: data.role
    });
    
    console.log(`Room created: ${roomId} by ${data.username}`);
  });

  // Join an existing room
  socket.on('join-room', (data) => {
    const { roomId, username, role } = data;
    
    if (!rooms[roomId]) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }
    
    // Add user to room
    rooms[roomId].users[socket.id] = {
      username: username,
      role: role
    };
    socket.join(roomId);
    
    // Notify user they've joined
    socket.emit('room-joined', {
      roomId,
      initialCode: rooms[roomId].code,
      language: rooms[roomId].language,
      role: role
    });
    
    // Send the new user information about all existing users in the room
    const existingUsers = [];
    for (const userId in rooms[roomId].users) {
      if (userId !== socket.id) { // Don't include the current user
        existingUsers.push({
          userId,
          username: rooms[roomId].users[userId].username,
          role: rooms[roomId].users[userId].role
        });
      }
    }
    
    // Send the list of existing users to the new user
    if (existingUsers.length > 0) {
      socket.emit('existing-users', { users: existingUsers });
    }
    
    // Notify others in the room about the new user
    socket.to(roomId).emit('user-joined', {
      username,
      userId: socket.id,
      role: role
    });
    
    console.log(`${username} joined room: ${roomId} as ${role}`);
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
        const userData = rooms[roomId].users[socket.id];
        
        // Notify others in the room
        socket.to(roomId).emit('user-left', {
          username: userData.username,
          userId: socket.id,
          role: userData.role
        });
        
        console.log(`${userData.username} left room: ${roomId}`);
        
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