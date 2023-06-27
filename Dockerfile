FROM node:18

RUN apt-get update -y && \
    apt-get install --no-install-recommends -y gcc build-essential curl ffmpeg && \
    apt-get clean && rm -rf /var/lib/apt/lists/*


WORKDIR /app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

# RUN npm install
# If you are building your code for production
RUN npm ci --omit=dev


COPY . .

CMD [ "npm", "start" ]
