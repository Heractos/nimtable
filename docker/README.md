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

**Backend config:** The backend uses your `backend/config.yaml` (mounted into the container). Put your catalog definitions (e.g. `polaris` with `type: rest`, `uri`, etc.) there; they will be used for REST and Spark. The database URL is overridden in Docker via `DATABASE_URL` so the same file works locally (e.g. `localhost:5432`) and in Docker (`database:5432`).

**If the backend (nimtable) is unhealthy and the web never starts**, check why it’s failing:
```bash
docker compose logs nimtable
```
Fix any config, DB, or JVM errors; then run `docker compose up -d` again.
