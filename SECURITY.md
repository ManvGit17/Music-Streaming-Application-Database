# Security Policy

## Supported versions

Only the latest code on `master` receives fixes. The `legacy/` folder is the original 2025
course project, kept for reference; it is not intended for deployment.

## Reporting a vulnerability

Please **don't open a public issue**. Use GitHub's private reporting instead:
**Security → Report a vulnerability** on this repository. Include what you found, how to
reproduce it, and the impact you expect.

You can expect an acknowledgement within a week. Once a fix is ready, the advisory will be
published with credit to you, unless you prefer to stay anonymous.

## What's in scope

Of particular interest:

- ways around row-level security (reading or changing another listener's data);
- privilege escalation between the `vamusic_anon`, `vamusic_listener`, `vamusic_admin` and
  `vamusic_app` roles;
- SQL injection anywhere in the API;
- token forgery or session problems;
- secrets leaking into the audit log, logs or the SQL Lens output.

## Deployment notes

The defaults in `docker-compose.yml` and `.env.example` are for local development. Before
exposing VaMusic anywhere else:

- set strong values for `POSTGRES_PASSWORD`, `VAMUSIC_APP_PASSWORD` and `VAMUSIC_JWT_SECRET`;
- set `VAMUSIC_LENS_ENABLED=false`, because SQL Lens traces reveal query text and plans;
- don't publish the database port;
- don't load the demo dataset: every demo account shares the password `vamusic`.
