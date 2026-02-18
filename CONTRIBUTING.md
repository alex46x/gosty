# GhostProtocol Setup Guide

This project consists of a React frontend and a Node.js/Express backend with MongoDB.

## Prerequisites
- Node.js (v18+)
- MongoDB (running locally or Atlas URI)

## 1. Backend Setup
The backend handles all data persistence and business logic.

1.  Navigate to the server directory:
    ```bash
    cd server
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Configure environment:
    - Edit `.env` if needed (default port ::5000, mongo ::localhost:27017).
4.  Start the server:
    ```bash
    npm run dev
    ```
    - Server will run on `http://localhost:5000`.

## 2. Frontend Setup
The frontend is built with Vite + React.

1.  Navigate to the root directory (ghostprotocol):
    ```bash
    cd ..
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Start the development server:
    ```bash
    npm run dev
    ```
    - Frontend will run on `http://localhost:5173`.

## 3. Data Persistence
-   **MongoDB**: All data (users, posts, messages) is stored in the MongoDB database defined in `server/.env` (default: `ghostprotocol`).
-   **Users**: Passwords are hashed. Public keys are stored for E2EE.
-   **JWT**: Authentication tokens are stored in `localStorage` ('ghost_token') to keep you logged in on refresh.

## 4. Troubleshooting
-   **Registration Fails?** Check if MongoDB is running (`mongod`).
-   **API Errors?** Ensure backend is running on port 5000 and CORS is enabled (checked).
-   **Infinite Loading?** Check browser console for network errors. If `fetch` fails, backend might be down.

## 5. Production
To deploy:
-   **Backend**: Deploy `server/` to a Node.js host (Heroku, Railway, Render). Set `MONGO_URI` env var.
-   **Frontend**: Run `npm run build` to generate `dist/` folder. Deploy to static host (Vercel, Netlify).
-   **CORS**: Update `server/server.js` CORS settings to allow only your production frontend domain.
