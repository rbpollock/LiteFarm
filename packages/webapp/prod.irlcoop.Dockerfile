FROM node:22.21 as build

WORKDIR /usr/src/app

COPY ./webapp/package.json ./webapp/.npmrc ./webapp/pnpm-lock.yaml /usr/src/app/

COPY ./webapp/patches/ /usr/src/app/patches/

RUN npm install pnpm@10.6.5 -g && pnpm install

COPY ./webapp/ /usr/src/app/

COPY ./shared/ /usr/src/shared/

# irl.coop: the API base URL is baked into the vite build. Default = the
# coop API subdomain (farmapi.irl.coop); override with --build-arg.
ARG VITE_API_URL=https://farmapi.irl.coop
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_ENV=production

RUN pnpm run build

FROM nginx:1.25.1

COPY --from=build /usr/src/app/dist /var/www/litefarm

COPY --from=build /usr/src/app/nginx.irlcoop.conf /etc/nginx/nginx.conf

EXPOSE 80
