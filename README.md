# Kourti AI – Next-Gen Legal Operations Platform

Unlock the power of AI and automation in your legal workflows. Kourti AI delivers advanced case, contract, and document management for legal professionals — now with seamless AI document analysis, smart contract generation, and one-click document export.

---

## Key Features

- **AI-Powered Contract Generation**: Instantly draft new contracts based on user prompts utilizing embedded OpenAI models (via Node backend).
- **AI Document & Contract Analysis**: Summarize, extract clauses, surface risks, or generate redlines using the latest LLMs.
- **AI Document Comparison**: Compare two legal documents/contracts side-by-side with clause-level highlights, similarity scoring, and AI change detection.
- **Smart Document Export**: Export contracts, cases, and documents to PDF or Word (DOCX) with a single click — all versions supported.
- **Case & Client Management**: Organize, search, and manage all legal case data, clients, and client interactions securely.
- **Role-Based Dashboards**: Customized dashboards and widgets per user role (admin, lawyer, staff, client).
- **Weekly Insights Digest**: Automated weekly email summarizing key metrics — cases, tasks, clients, documents, contracts, and revenue — delivered every Monday.
- **Smart Notifications & Reminders**: Automated reminders, due dates, and case activity notifications.
- **Dark Mode Support**: Full dark mode with light, dark, and system theme options for comfortable viewing in any environment.
- **Modern UI/UX**: Built with React, shadcn-ui, TypeScript, and Tailwind CSS.
- **Seamless Integrations**: Native OpenAI, embeddable API for e-signature, and more.
- **Enterprise SSO**: Per-organization OAuth (Google Workspace / Microsoft Entra ID) with secure Node backend endpoints.

---

## Project Info

**URL**: [https://lovable.dev/projects/005e5c79-c166-4469-87c6-4b3e0766de12](https://lovable.dev/projects/005e5c79-c166-4469-87c6-4b3e0766de12)

---

## How to Edit the Code

You can edit your application in a few ways:

### Use Lovable

To get started quickly, simply visit your [Lovable Project](https://lovable.dev/projects/005e5c79-c166-4469-87c6-4b3e0766de12) and begin prompting. Any changes you make in Lovable will be committed automatically to this repository.

### Use Your Preferred IDE

To work on the project locally, you can clone the repository and push your changes. Any changes you push will also be reflected in Lovable.

This project requires **Node.js 18 or newer** and uses npm for package management. You can [install Node.js and npm with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

Follow these steps to get started:

1.  **Clone the repository:**

    ```sh
    git clone <YOUR_GIT_URL>
    ```

2.  **Navigate to the project directory:**

    ```sh
    cd <YOUR_PROJECT_NAME>
    ```

3.  **Install dependencies:**

    ```sh
    npm i
    ```

4.  **(Optional) Start the Node backend for local development:**

    The backend lives in the `backend-node/` folder. To run it locally with Docker:

    ```sh
    docker compose up --build         # starts Postgres, Node backend, and frontend
    ```

    Or run the backend standalone:

    ```sh
    cd backend-node && npm install && npm run dev
    ```

5.  **Start the development server:**

    ```sh
    npm run dev
    ```

### Edit Directly on GitHub

You can also make quick changes by editing files directly on GitHub.

1.  Navigate to the file you want to edit.
2.  Click the "Edit" (pencil) icon.
3.  Make your changes and commit them.

### Use GitHub Codespaces

If you prefer an online IDE, you can use GitHub Codespaces.

1.  On the main repository page, click the **Code** button.
2.  Select the **Codespaces** tab.
3.  Click **New codespace** to launch a new environment.
4.  Edit files directly in Codespaces and then commit and push your changes.

---

## What Technologies Are Used?

- **Vite**
- **TypeScript**
- **React**
- **shadcn-ui**
- **Tailwind CSS**
- **Node.js / Express** (backend API)
- **PostgreSQL** (database)
- **OpenAI API / LLMs** (for all contract/document AI and NLP tasks)
- **Resend** (transactional & digest emails)
- **pg-boss** (job queue & scheduled tasks)

---

## AI-Enabled Workflows in Kourti AI

### AI Contract Generation

Draft standard or custom legal agreements powered by OpenAI. Input your requirements; the app outputs a ready-to-edit contract draft, which you can further analyze, review, and export.

### AI Document & Clause Analysis

Run a risk review, summary, or automate due diligence on any uploaded document or contract. AI surfaces missing clauses, renewal deadlines, or non-standard terms.

### AI Document Comparison

Select two documents (or versions) to see highlighted clause changes, AI similarity scores, and a list of key differences (redlines or summaries).

### Document Export

Export any document, contract, or generated content in PDF or DOCX. All export jobs preserve original structure and versioning information.

---

---

## Searching and Filtering Your Data

The app has a global search bar in the header of every page, so you can quickly find matters, documents, contracts, clients, calendar events, and voice/transcription records from anywhere.

Additionally, each major page has its own filters:

- **Cases**: Search by name, client, or ID, and filter by status.
- **Documents**: Search by document or case name, and filter by file type.
- **Contracts**: Search across contracts and filter by status.

You can also use the keyboard shortcut **Ctrl + B** (or **⌘ + B** on macOS) to toggle the sidebar.

---

## How to Deploy Your Project

To deploy your project, open [Lovable](https://lovable.dev/projects/005e5c79-c166-4469-87c6-4b3e0766de12) and click on **Share -\> Publish**.

---

## Connecting a Custom Domain

Yes, you can\! To connect a custom domain, go to **Project \> Settings \> Domains** and click **Connect Domain**.

For a detailed guide, check out [Setting up a custom domain](https://docs.lovable.dev/tips-tricks/custom-domain#step-by-step-guide).

---

## Viewing Logs

This project includes a simple in-browser logging utility located in `src/lib/logger.ts`.

1. Start the development server with `npm run dev` and open the app in your browser.
2. Open your browser's developer tools and check the **Console** for log messages.
3. All log entries are also stored in memory and exposed on `window.__APP_LOGS__`.
4. In the console, run `window.__APP_LOGS__` to view the full log history. Each entry includes a timestamp, log level, message and any captured error details from the error boundary.
