# Academic Task Management System - VSBEC 📚🏫🏆

A comprehensive platform designed to streamline task assignments, submissions, and verifications for an academic institution. It caters to multiple roles from Supreme Admins allocating resources down to Students managing their submissions for various activities ranging from College Work to External Competitions.

## Key Features ✨

*   **Role-Based Access Control (RBAC):**
    *   **Supreme Admin:** Manages global resources, creates departments, and oversees system performance.
    *   **HOD (Head of Department):** Manages classes within their department, sets up Class Advisors, and assigns department-wide tasks.
    *   **Class Advisor:** Directly oversees a class, creates student accounts (bulk import supported), assigns class-specific tasks, and monitors student progress.
    *   **Coordinator (Student):** A student designated by the Advisor to help verify submissions for their class.
    *   **Student:** Views assigned tasks (Global, Department, or Class level), submits proof (screenshots/documents), and tracks their verification status.
*   **Intuitive Student Dashboard:** Live counts of active tasks, clear deadlines (with 24h warnings), category badges, and personal task statuses.
*   **Structured Submission Flow:**
    *   Students upload screenshots (max 2MB, enforced on the client and server).
    *   Tasks can enforce Custom Fields (e.g., "Team ID", "Registration Link") which are verified alongside the screenshot.
    *   Submissions feature a **Max 2 Resubmissions** limit. If rejected twice, the entry locks to prevent spamming.
    *   System handles hard deadlines natively—blocking uploads instantly after the due date.
*   **Verification Workflow:** Coordinators or Staff can accept/reject items, attaching specific rejection reasons for the student to fix on their resubmission.
*   **In-App Notifications:** Real-time push alerts populating a bell icon when the status of a task changes (e.g., Verified, Rejected with reason).
*   **Data Visualization & Reporting:** Rich stats on participation rates, progress bars grouping students by success/pending metrics.

## Tech Stack 🛠️

*   **Frontend:** React (Vite), TypeScript, Tailwind CSS, Framer Motion, Lucide Icons.
*   **Backend:** Node.js, Express, MongoDB (Atlas), JWT (Authentication), Bcrypt (Security).
*   **Storage:** Cloudinary (Screenshot/PDF Image storage integration via Multer).

## Setup & Installation 🚀

### Prerequisites
*   Node.js (v18+)
*   npm or yarn
*   A Cloudinary Account (for image uploads)

### Installation

1.  **Clone the repository and install dependencies:**
    ```bash
    npm install
    # or
    yarn install
    ```

2.  **Environment Variables:**
    Create a `.env` file in the root directory based on `.env.example`:
    ```env
    PORT=3000
    JWT_SECRET=your_super_secret_jwt_key
    CLOUDINARY_CLOUD_NAME=your_cloud_name
    CLOUDINARY_API_KEY=your_api_key
    CLOUDINARY_API_SECRET=your_api_secret
    ```

3.  **Start the Development Server:**
    ```bash
    npm run dev
    ```
    This command concurrently spins up the Vite frontend and the Express backend (`server.ts` using `tsx`). Connection to MongoDB is established using the `MONGODB_URI` from your `.env` file.

    If the database is empty, a **seeder script will run** generating sample data: departments, classes, users, and tasks, alongside a dummy Supreme Admin (`admin` / `admin123`).

## System Architecture & Intuition 🧠

### Design Philosophy
The core intuition behind the system is **decentralized delegation**. Rather than a single admin managing the entire college, power flows down:
`Admin -> HOD -> Class Advisor -> Coordinator -> Student`. 
Every level has visibility into the layer directly below it and can roll up statistics to higher tiers.

### Data Model Logic
*   **Users:** Every actor is an entry in the `users` table, distinguished by the `role` enum. This simplifies authentication and authorization middleware.
*   **Tasks & Scopes:** Tasks contain nullable `department_id` and `class_id` columns. 
    *   If both are null = **Global** (All students see it).
    *   If `department_id` is set, only students in that department see it.
    *   If `class_id` is set, only that specific class sees it.
*   **Submissions:** We track `resubmission_count` natively in the DB. This satisfies the business logic that a rejected submission isn't deleted, but updated. If the constraint hits `2`, the UI renders a "Locked" block.
*   **Bulk Onboarding:** Class Advisors can import `.xlsx` files. The backend seamlessly hashes incoming register numbers into passwords while validating duplicates.

---

## Deployment & Hosting Guide 🌍

This project uses a single-server architecture where the Express backend serves the Vite frontend. It is pre-configured to be deployed natively on **Render**, or serverlessly on **Vercel**.

### Step 1: Environment Variables Configuration
Regardless of where you host, you **MUST** configure these Environment Variables in your hosting dashboard prior to deploying. Do not skip this:

| Key | Example Value | Description |
| :--- | :--- | :--- |
| **`NODE_ENV`** | `production` | Tells Express to serve the built frontend from `/dist`. |
| **`MONGODB_URI`** | `mongodb+srv://...` | Your production MongoDB connection string. |
| **`JWT_SECRET`** | `your_secure_random_string` | Used to sign login tokens. Make it long and random. |
| **`CLOUDINARY_CLOUD_NAME`** | `xxx` | From your Cloudinary dashboard. |
| **`CLOUDINARY_API_KEY`** | `123...` | From your Cloudinary dashboard. |
| **`CLOUDINARY_API_SECRET`** | `xyz...` | From your Cloudinary dashboard. |

> **MongoDB Note:** Ensure your MongoDB Atlas cluster has **Network Access** set to `0.0.0.0/0` (Allow Access from Anywhere) so your hosting platform can connect.

---

### Option A: Hosting on Vercel (Fastest Serverless Hosting)

Vercel is optimized for frontend frameworks but supports our Express backend via Serverless Functions configured in `vercel.json`.

1. **Push to GitHub**: Make sure this codebase (including `vercel.json`) is pushed to a GitHub repository.
2. **Import Project**: Go to [Vercel](https://vercel.com/), click **Add New -> Project**, and import your repository.
3. **Configure Project**:
   - **Framework Preset**: Leave as `Other` or `Vite`.
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Environment Variables**: Add all the variables listed in Step 1.
4. **Deploy**: Click Deploy. Vercel will build the frontend into `dist` and deploy `server.ts` as a serverless function that handles your `/api` routes and serves the frontend.

---

### Option B: Hosting on Render (Standard Node Environment)

Render works like a traditional server. It will run the Node process continuously.

1. **Create a Render Account**: Go to [Render.com](https://render.com/) and sign up.
2. **Create a Web Service**: Click **New +** > **Web Service**. Connect your GitHub and select the repository.
3. **Configure the Service**:
   - **Name**: Choose a name (e.g., `vsbec-task-manager`).
   - **Environment**: `Node`
   - **Branch**: `main`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
4. **Environment Variables**: Click "Environment" and add all the variables from Step 1.
5. **Deploy**: Click Save. Render will run the build command and start the server using the `start` script defined in `package.json`.

---

### First Production Login
When the server spins up for the first time on a fresh database, it will automatically run the seeder script. You can log in with the default admin:
- **Username**: `admin`
- **Password**: `admin123`

*⚠️ It is highly recommended to change this password immediately after logging into your production system!*

---
*Built for VSBEC Academic Management.*
