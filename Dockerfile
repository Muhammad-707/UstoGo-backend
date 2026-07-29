# syntax=docker/dockerfile:1

# ---------- build ----------
FROM node:22-alpine AS build
WORKDIR /app

# --ignore-scripts: the only lifecycle script this project has is `prepare`, which
# installs git hooks. There is no .git directory in the image and no use for hooks in
# a build; declining to run dependency install scripts is also one less supply-chain
# surface. Anything genuinely needed at build time is an explicit RUN below.
COPY package*.json ./
RUN npm ci --ignore-scripts

COPY prisma ./prisma
COPY tsconfig*.json nest-cli.json ./
COPY src ./src

# Explicit because install scripts are off: @prisma/client ships as a stub and its
# postinstall is what normally fills it in from schema.prisma.
RUN npx prisma generate && npm run build

# ---------- runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup -S app && adduser -S app -G app

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=build /app/dist ./dist
# The generated client, not the schema-driven generation step: the runtime image has no
# prisma CLI, and regenerating at start-up would make boot depend on a devDependency.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
# Migrations run as a separate deploy step (DEPLOYMENT.md §5) and need the schema.
COPY prisma ./prisma

USER app
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
