FROM node:22-bookworm-slim AS deps

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY agent.ts tsconfig.json ./
COPY src ./src

CMD ["npm", "start"]
