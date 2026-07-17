# Multi-stage/lightweight Dockerfile to serve static assets on Google Cloud Run
FROM nginx:alpine

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy local workspace files to nginx container HTML directory
COPY . /usr/share/nginx/html

# Expose port 80 (Cloud Run listens on PORT env, Nginx default port 80 works seamlessly)
EXPOSE 80

# Start Nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
