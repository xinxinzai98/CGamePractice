FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY client ./client
COPY packages ./packages
COPY web/assets ./web/assets
COPY web/portrait-motion.js ./web/portrait-motion.js
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY server ./server
COPY --from=build /app/packages/simulation/dist ./packages/simulation/dist
COPY --from=build /app/packages/simulation/package.json ./packages/simulation/package.json
COPY --from=build /app/client/dist ./client/dist
RUN mkdir /app/data && chown node:node /app/data
ENV HOST=0.0.0.0 PORT=8178 NODE_ENV=production
USER node
EXPOSE 8178
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8178)+'/ready',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/server.cjs"]
