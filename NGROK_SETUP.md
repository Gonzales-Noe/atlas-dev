# ngrok Setup Guide for ATLAS Project

This guide will help you create public ngrok links to expose your local ATLAS services.

## Prerequisites

1. **Install ngrok**
   - Download from: https://ngrok.com/download
   - Extract the zip file
   - Add `ngrok.exe` to your PATH, or place it in the project root directory

2. **(Optional but Recommended) Create an ngrok account**
   - Sign up at: https://ngrok.com
   - Get your authtoken from the dashboard
   - Configure it: `ngrok config add-authtoken YOUR_AUTHTOKEN`
   - This gives you fixed URLs and more features

## Current Project Services

Your ATLAS project has the following services:

- **Backend (Django API)**: Port 8000
- **Frontend (Vite)**: Port 5173
- **Database (PostgreSQL)**: Port 5432 (not typically exposed via ngrok)
- **Redis**: Port 6379 (not typically exposed via ngrok)

## Quick Start - Using the Helper Script

I've created a helper script `setup-ngrok.bat` that automates the process:

1. Make sure at least one service is running:
   ```bash
   # Backend (if using Docker)
   docker-compose up backend
   
   # OR start backend directly
   cd backend
   python manage.py runserver 0.0.0.0:8000
   
   # Frontend (in a separate terminal)
   cd frontend
   npm run dev
   ```

2. Run the helper script:
   ```bash
   setup-ngrok.bat
   ```

3. Select the service you want to expose (1 for backend, 2 for frontend)

4. The ngrok link will appear in the terminal

## Manual Setup

If you prefer to run ngrok manually:

### Expose Backend (Port 8000)
```bash
ngrok http 8000
```

### Expose Frontend (Port 5173)
```bash
ngrok http 5173
```

### Expose Both Services
Open two separate terminals:

**Terminal 1:**
```bash
ngrok http 8000
```

**Terminal 2:**
```bash
ngrok http 5173
```

## Using the ngrok Link

Once ngrok is running, you'll see output like this:

```
Session Status                online
Account                       Your Name (Plan: Free)
Version                       3.x.x
Region                        United States (us)
Latency                       -
Web Interface                 http://127.0.0.1:4040
Forwarding                    https://abc1-23-45-67-89.ngrok-free.app -> http://localhost:8000
```

The **Forwarding** URL (e.g., `https://abc1-23-45-67-89.ngrok-free.app`) is your public link that you can share or use to access your service from anywhere.

### Important Notes:

1. **Free Tier Limitations:**
   - URLs are random and change each time you restart ngrok
   - 8-hour session limit
   - Rate limits apply

2. **For Frontend Development:**
   - If exposing the frontend, you may need to update the API base URL in your frontend code to point to the ngrok backend URL
   - Check `frontend/.env.local` or API configuration files

3. **For Backend API:**
   - Update your frontend's API configuration to use the ngrok URL instead of `localhost:8000`
   - Example: Change `http://localhost:8000/api/` to `https://your-ngrok-url.ngrok-free.app/api/`

4. **CORS Configuration:**
   - Your Django backend may need CORS configured to accept requests from the ngrok URL
   - Check `backend/atlas/settings/` for CORS settings

## Monitoring ngrok

You can monitor your ngrok tunnels at: http://127.0.0.1:4040

This web interface shows:
- All requests passing through ngrok
- Request/response details
- Replay requests

## Stopping ngrok

Press `Ctrl+C` in the terminal where ngrok is running to stop the tunnel.

## Troubleshooting

**ngrok not found:**
- Make sure ngrok.exe is in your PATH
- Or place ngrok.exe in the project root directory

**Port already in use:**
- Check if the service is already running: `netstat -ano | findstr :PORT_NUMBER`
- Stop the conflicting service or use a different port

**Connection refused:**
- Make sure the service you're trying to expose is actually running
- Verify the port number is correct

**CORS errors:**
- Update Django CORS settings to include your ngrok URL
- Add the ngrok domain to `CORS_ALLOWED_ORIGINS` in settings

## Additional Resources

- ngrok Documentation: https://ngrok.com/docs
- ngrok Dashboard: https://dashboard.ngrok.com
- ngrok Status: https://status.ngrok.com