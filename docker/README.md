# Docker (build from source)

Three containers, built from current code:

- **database** — PostgreSQL 17
- **nimtable** — Java backend (Dockerfile.backend)
- **nimtable-web** — Next.js frontend (Dockerfile.frontend)

## Run

From repo root:

```bash
docker compose -f docker/docker-compose.yml up --build
```

Or from this directory:

```bash
cd docker
docker compose up --build
```

Then open http://localhost:3000 (login: admin / admin).

**If the backend (nimtable) is unhealthy and the web never starts**, check why it’s failing:
```bash
docker compose logs nimtable
```
Fix any config, DB, or JVM errors; then run `docker compose up -d` again.
