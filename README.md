# Fitora — Frontend

**Fitora** is a gym-management SaaS: scheduling, memberships, payments, staff and payroll
for gyms and fitness studios. This repository is the **Fitora frontend**, built with
**Angular** and talking to the Fitora backend API (a separate repository).

---

## 🚀 Tech Stack

* **Angular 17**
* **TypeScript**
* **RxJS**
* **SCSS / CSS**
* **Angular Router**
* **REST API**
* **Responsive Web Design**

---

## 📋 Requirements

Before running the project locally, make sure you have:

* **Node.js** 18+
* **npm** 9+
* **Angular CLI** 17+

Check your versions:

```bash
node -v
npm -v
ng version
```

---

## ⚙️ Installation

Clone the repository:

```bash
git clone <repository-url>
cd frontend
```

Install dependencies:

```bash
npm install
```

---

## 💻 Development

Start the development server:

```bash
ng serve
```

Then open:

```text
http://localhost:4200
```

The application will automatically reload when source files are modified.

---

## 🏗️ Production Build

Create a production build:

```bash
ng build --configuration production
```

The generated files will be available in:

```text
dist/
```

The production build can then be deployed to your web server or hosting provider.

---

## 🌍 Environment Configuration

Environment-specific configuration is managed through Angular environments.

Typical configuration includes:

* API URL
* Application URL
* Environment name
* Authentication configuration
* Third-party services

Example:

```text
src/environments/
├── environment.ts
└── environment.prod.ts
```

**Never commit sensitive credentials or secrets to the repository.**

---

## 🧪 Testing

Run unit tests (Karma/Jasmine), watch mode:

```bash
ng test
```

Run them headless with coverage, exactly as CI does:

```bash
npm run spec
```

End-to-end smoke suite (Playwright, `e2e/`) — the journeys that must work
for the product to be usable at all: an admin signs in, adds a member; a
member accepts their invitation, signs in and books; an admin changes their
password. It needs the backend checked out next to this repo (`../backend`),
PostgreSQL and Redis running:

```bash
npx playwright install chromium   # once
npm run e2e
```

It starts its own Rails server on port 3100 against a separate database
(`backend_e2e`, reset and seeded on every run) and `ng serve --configuration
e2e` on 4300, so it never touches the servers or the data you develop with.

---

## 🧩 Code Scaffolding

Generate Angular components, services, guards, pipes, etc. using the Angular CLI.

Examples:

```bash
ng generate component components/example
```

```bash
ng generate service services/example
```

```bash
ng generate guard guards/auth
```

You can also use the shorter syntax:

```bash
ng g c components/example
ng g s services/example
ng g g guards/auth
```

---

## 📁 Project Structure

A simplified project structure:

```text
src/
├── app/
│   ├── core/          # services, guards, interceptors, models, auth
│   ├── features/       # routed feature areas (admin, coach, superadmin, auth…)
│   ├── layout/          # shells (admin/coach/superadmin) + navbar
│   ├── shared/           # reusable UI components, pipes, utils
│   └── app.routes.ts
│
├── assets/
├── environments/
├── styles.scss
└── main.ts
```

The exact structure may evolve as the application grows.

---

## 🔐 Authentication

Fitora uses an authenticated API architecture.

Frontend responsibilities include:

* User authentication
* Session/token handling
* Protected routes
* API authentication
* Role-based UI access
* Error handling

Authentication logic is centralized in `core/auth`, `core/guards`, and `core/interceptors`.

---

## 🔌 Backend

The frontend communicates with the **Fitora backend API**, a separate repository
(its own git history, deployed independently).

The backend is responsible for:

* Authentication and authorization
* Companies, staff, roles & permissions
* Clients, coaches, scheduling
* Contracts, payments
* Business logic
* Data persistence

Frontend and backend are configured and deployed independently through environment
variables — there is no shared monorepo between them.

---

## 🚀 Deployment

For a production deployment:

```bash
npm ci
ng build --configuration production
```

Deploy the generated contents from:

```text
dist/
```

### SPA Routing

Because Fitora is an Angular Single Page Application, the web server must redirect unknown
routes to:

```text
index.html
```

For example:

```text
/login
/admin/dashboard
/admin/clients/...
```

should all be handled by Angular's router.

---

## 🛠️ Useful Commands

| Command                               | Description               |
| -------------------------------------- | ------------------------- |
| `npm install`                          | Install dependencies      |
| `ng serve`                             | Start development server  |
| `ng build`                             | Build the application     |
| `ng build --configuration production`  | Production build          |
| `ng test`                              | Run unit tests (watch)     |
| `npm run spec`                         | Run unit tests headless, as CI does |
| `ng lint`                              | Run linting               |
| `ng generate`                          | Generate Angular code     |

---

## 📌 Development Guidelines

Before opening a pull request:

1. Keep components focused and reusable.
2. Keep API communication inside services.
3. Avoid duplicating business logic.
4. Protect authenticated routes with guards.
5. Use environment configuration for environment-specific values.
6. Do not commit secrets or credentials.
7. Test production builds before deployment.
8. Keep UI responsive across desktop and mobile.
9. CI (`.github/workflows/ci.yml`) must pass — type check, unit tests, and a
   production build — before merging.

---

## 📄 License

This project is proprietary software.

© Fitora. All rights reserved.
