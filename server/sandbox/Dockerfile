FROM alpine:3.19

# Install iproute2 for `ip` command, iputils for `ping`
RUN apk add --no-cache iproute2 iputils

# Create non-root user
RUN adduser -D -s /bin/sh labuser
USER labuser
WORKDIR /home/labuser
