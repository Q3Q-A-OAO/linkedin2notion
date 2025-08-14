# Playwright + Node (includes browsers)
FROM mcr.microsoft.com/playwright:v1.54.2-jammy

WORKDIR /app
COPY package.json package-lock.json* pnpm-lock.yaml* ./
RUN npm i --silent || true
COPY . .

# Keep storage (LinkedIn login state) outside the image
VOLUME ["/app/storage"]

EXPOSE 8787
CMD ["npm","run","start"]