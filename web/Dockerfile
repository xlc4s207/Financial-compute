FROM nginx:alpine

COPY index.html /usr/share/nginx/html/index.html
COPY styles.css /usr/share/nginx/html/styles.css
COPY app.js /usr/share/nginx/html/app.js
COPY reimbursements.js /usr/share/nginx/html/reimbursements.js
COPY server-sync.js /usr/share/nginx/html/server-sync.js
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf