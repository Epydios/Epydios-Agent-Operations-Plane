FROM nginxinc/nginx-unprivileged:1.29-alpine

COPY deploy/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY web/ /usr/share/nginx/html/

EXPOSE 8080
