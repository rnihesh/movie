# Movie Sync App 🍿

A real-time synchronized movie watching application using WebSockets.

## Features

- **Upload Movies**: Upload a video file to the server.
- **Real-time Sync**: Play, pause, and seek events are synchronized across all connected clients.
- **Shared Control**: Anyone connected can control the playback.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the server:

   ```bash
   npm start
   ```

3. Open your browser and navigate to:

   - Local: `http://localhost:3000`
   - Network: `http://<YOUR_IP_ADDRESS>:3000` (The server will print the exact URL when it starts)

4. Open the same URL in another tab or device to test the synchronization.

## Usage

1. Click "Upload Movie" to select a video file from your computer.
2. Once uploaded, the video will appear for all connected users.
3. Press Play/Pause or seek the timeline - everyone watches together!
