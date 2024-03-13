# Use Node LTS alpine distribution
FROM node:lts-alpine3.18

# Installation of packages for purple-a11y and chromium
RUN apk add build-base gcompat g++ make python3 zip bash git chromium openjdk11-jre

# Installation of VeraPDF
RUN echo $'<?xml version="1.0" encoding="UTF-8" standalone="no"?> \n\
<AutomatedInstallation langpack="eng"> \n\
    <com.izforge.izpack.panels.htmlhello.HTMLHelloPanel id="welcome"/> \n\
    <com.izforge.izpack.panels.target.TargetPanel id="install_dir"> \n\
        <installpath>/opt/verapdf</installpath> \n\
    </com.izforge.izpack.panels.target.TargetPanel> \n\
    <com.izforge.izpack.panels.packs.PacksPanel id="sdk_pack_select"> \n\
        <pack index="0" name="veraPDF GUI" selected="true"/> \n\
        <pack index="1" name="veraPDF Batch files" selected="true"/> \n\
        <pack index="2" name="veraPDF Validation model" selected="false"/> \n\
        <pack index="3" name="veraPDF Documentation" selected="false"/> \n\
        <pack index="4" name="veraPDF Sample Plugins" selected="false"/> \n\
    </com.izforge.izpack.panels.packs.PacksPanel> \n\
    <com.izforge.izpack.panels.install.InstallPanel id="install"/> \n\
    <com.izforge.izpack.panels.finish.FinishPanel id="finish"/> \n\
</AutomatedInstallation> ' >> /opt/verapdf-auto-install-docker.xml

RUN wget "https://downloads.verapdf.org/rel/verapdf-installer.zip" -P /opt
RUN unzip /opt/verapdf-installer.zip -d /opt
RUN latest_version=$(ls -d /opt/verapdf-greenfield-* | sort -V | tail -n 1) && [ -n "$latest_version" ] && \
    "$latest_version/verapdf-install" "/opt/verapdf-auto-install-docker.xml"
RUN rm -rf /opt/verapdf-installer.zip /opt/verapdf-greenfield-*

# Set purple-a11y-runner directory
WORKDIR /app/purple-a11y-runner

# Copy package.json to working directory, perform npm install before copying the remaining files
COPY . .

# Add inputUrls.csv
RUN echo "Crawl Concurrency,Url,Max Pages,Max Concurrency,Scan Type" > inputUrls.csv

RUN echo "3,https://tech.gov.sg,3,3,website" >> inputUrls.csv

RUN npm install

# Add non-privileged user
RUN addgroup -S purple && adduser -S -G purple purple
RUN chown -R purple:purple /app

RUN npm install

# Run everything after as non-privileged user.
USER purple

RUN mkdir -p /app/chromium_support_folder

# Copy application and support files
COPY . .

WORKDIR /app

# Clone purple-a11y repository
RUN git clone https://github.com/GovTechSG/purple-a11y.git

# Change directory into the purple-a11y folder
WORKDIR /app/purple-a11y

# Copy package.json to working directory, perform npm install before copying the remaining files
COPY package*.json ./

# Environment variables for node and Playwright
ENV NODE_ENV=production
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD="true"
ENV PLAYWRIGHT_BROWSERS_PATH="/opt/ms-playwright"
ENV PATH="/opt/verapdf:${PATH}"

# Install Playwright browsers
RUN npx playwright install chromium webkit

# Install dependencies
RUN npm ci --omit=dev

# Run everything after as non-privileged user.
USER purple


# Change directory into the purple-a11y folder
WORKDIR /app/purple-a11y-runner



#RUN node cli -f inputUrls.csv -k ay:accessibility@tech.gov.sg
