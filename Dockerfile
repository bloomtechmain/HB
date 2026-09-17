# Deploys the web backend + frontend as one Railway service. The backend
# serves the built frontend statically in production (see app.ts) — no
# separate web server needed. Only apps/pos is built here; apps/electron
# and apps/print-agent are desktop-only and never run on Railway.
FROM node:20-alpine AS build
WORKDIR /app

COPY apps/pos/backend/package.json apps/pos/backend/package-lock.json apps/pos/backend/
RUN npm ci --prefix apps/pos/backend

COPY apps/pos/frontend/package.json apps/pos/frontend/package-lock.json apps/pos/frontend/
RUN npm ci --prefix apps/pos/frontend

COPY apps/pos/backend apps/pos/backend
COPY apps/pos/frontend apps/pos/frontend
COPY database database

RUN npm run build --prefix apps/pos/backend
RUN npm run build --prefix apps/pos/frontend

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/apps/pos/backend/dist apps/pos/backend/dist
COPY --from=build /app/apps/pos/backend/node_modules apps/pos/backend/node_modules
COPY --from=build /app/apps/pos/backend/package.json apps/pos/backend/package.json
COPY --from=build /app/apps/pos/frontend/dist apps/pos/frontend/dist
COPY --from=build /app/database database

EXPOSE 5000
CMD ["node", "apps/pos/backend/dist/app.js"]
