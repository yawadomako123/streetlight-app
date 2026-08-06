# Deployment Guide

Follow these steps to deploy the **PostgreSQL Database**, **Express Backend API**, and **React Web Dashboard** to the cloud so they are accessible anywhere in the world.

---

## Step 1: Deploy a Free PostgreSQL Database (Neon.tech)

1. Go to [Neon.tech](https://neon.tech/) and sign up for a free account.
2. Create a new project and select **PostgreSQL** as the database.
3. Once created, copy the **Connection String** (it starts with `postgres://...` and is called `DATABASE_URL`).

### Migrate & Seed the Database Tables:
We need to initialize the tables and seed data in your new cloud database:
1. Open your local `backend/.env` file.
2. Replace your local database credentials or append:
   ```env
   DATABASE_URL=your_copied_neon_connection_string
   ```
3. Run the migration and seeding scripts from your project root:
   ```bash
   npm run migrate --prefix backend
   npm run seed --prefix backend
   ```
4. Verification: Your Neon cloud database is now populated with all street light tables and the default admin accounts.

---

## Step 2: Deploy the Backend API (Render.com)

1. Create a free account at [Render](https://render.com/).
2. Click **New +** $\rightarrow$ **Web Service**.
3. Connect your GitHub repository.
4. Configure the Web Service settings:
   * **Name**: `islc-backend`
   * **Root Directory**: `backend` (Important: must point to the backend folder)
   * **Runtime**: `Node`
   * **Build Command**: `npm install`
   * **Start Command**: `npm start`
5. Click **Advanced** and add the following **Environment Variables**:
   * `DATABASE_URL` = `your_neon_connection_string`
   * `JWT_SECRET` = `a_long_random_secret_string`
   * `CLIENT_ORIGIN` = `https://your-frontend-app.vercel.app` (You can update this after deploying the frontend)
6. Click **Deploy Web Service**. Once deployed, copy your backend URL (e.g., `https://islc-backend.onrender.com`).

---

## Step 3: Deploy the Frontend Web Dashboard (Vercel)

1. Create a free account at [Vercel](https://vercel.com/).
2. Click **Add New** $\rightarrow$ **Project**.
3. Import your GitHub repository.
4. Configure the Project settings:
   * **Framework Preset**: `Vite`
   * **Root Directory**: `frontend` (Important: must point to the frontend folder)
   * **Build Command**: `npm run build`
   * **Output Directory**: `dist`
5. Add the following **Environment Variable**:
   * **Name**: `VITE_API_URL`
   * **Value**: `https://your-backend-app.onrender.com` (Your copied Render backend URL)
6. Click **Deploy**. Your web app is now live (e.g., `https://your-frontend-app.vercel.app`).
7. *(Optional)* Go back to Render settings and update `CLIENT_ORIGIN` to match your Vercel URL.

---

## Step 4: Update the Mobile App Configuration

To test the mobile app with your new cloud server, update your `mobile/.env` file:

```env
# Point to your live Render backend
EXPO_PUBLIC_API_URL=https://your-backend-app.onrender.com
EXPO_PUBLIC_DEVICE_ID=arduino-uno
EXPO_PUBLIC_USE_MOCK_BT=true
EXPO_PUBLIC_RELAY_TO_BACKEND=true
```

Reload the app (press **`r`** in your Metro terminal) or rebuild your standalone APK. Now, any data generated on the phone will be sent over the cellular network to your live Render backend and displayed on your Vercel web app instantly!
