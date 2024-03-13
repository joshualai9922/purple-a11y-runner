import _yargs from 'yargs';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { globSync } from 'glob';
import { createLogger, format, transports } from 'winston';

const { combine, timestamp, printf } = format;

//AY
const isDocker = fs.existsSync('/.dockerenv');
const appDirName = "purple-a11y";
//

const browserTypes = {
    chrome: "chrome",
    edge: "msedge",
    chromium: "chromium",
  };

const appPath =  isDocker
  ? path.join('/app', appDirName) // Docker-specific path
  : os.platform() === "win32"
    ? path.join(process.env.PROGRAMFILES, "Purple A11y Desktop")
    : path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "Purple A11y"
    );
const backendPath = path.join(appPath, "Purple A11y Backend");

const enginePath = isDocker
  ? path.join('/app', appDirName) // Docker-specific path
  : path.join(backendPath, "purple-a11y"); // Local development path

const resultsPath = isDocker
  ? path.join('/app', '/purple-a11y') // Docker-specific path
  : os.platform() === "win32"
    ? path.join(process.env.APPDATA, "Purple A11y")
    : appPath;



const cliOptions = {
    f: {
        alias: 'csv file',
        describe: "name of csv file",
        type: "string",
        demandOption: true,
    },
    k: {
        alias: 'nameEmail',
        describe: `To personalise your experience, we will be collecting your name, email address and app usage data. Your information fully complies with GovTech’s Privacy Policy. Please provide your name and email address in this format "John Doe:john@domain.com".`,
        type: 'string',
        demandOption: true,
    }
}

const messageOptions = {
    border: false,
    marginTop: 2,
    marginBottom: 2,
  };
  

export const getPathVariable = () => {
    if (os.platform() === "win32") {
      const directories = [
        "nodejs-win",
        "purple-a11y\\node_modules\\.bin",
        "jre\\bin",
        "verapdf",
      ];
      return `${directories.map((d) => path.join(backendPath, d)).join(";")};${process.env.PATH
        }`;
    } else {
      const directories = [
        `${os.arch() === "arm64" ? "nodejs-mac-arm64" : "nodejs-mac-x64"}/bin`,
        "purple-a11y/node_modules/.bin",
        "jre/bin",
        "verapdf"
      ];
      return `${directories
        .map((d) => path.join(backendPath, d))
        .join(":")}:${process.env.PATH
        }`;
    }
  };

export const getDefaultEdgeDataDir = () => {
    try {
      let defaultEdgeDataDir = null;
      if (os.platform() === "win32") {
        defaultEdgeDataDir = path.join(
          os.homedir(),
          "AppData",
          "Local",
          "Microsoft",
          "Edge",
          "User Data"
        );
      } else if (os.platform() === "darwin") {
        defaultEdgeDataDir = path.join(
          os.homedir(),
          "Library",
          "Application Support",
          "Microsoft Edge"
        );
      }
  
      if (defaultEdgeDataDir && fs.existsSync(defaultEdgeDataDir)) {
        return defaultEdgeDataDir;
      } else {
        return null;
      }
    } catch (error) {
      console.log(`Error in getDefaultEdgeDataDir(): ${error}`);
    }
  };

  export const deleteClonedEdgeProfiles = () => {
    const baseDir = getDefaultEdgeDataDir();
    if (!baseDir) {
      console.log(`Unable to find Edge data directory in the system.`);
      return;
    }
  
    // Find all the Purple-A11y directories in the Chrome data directory
    const destDir = globSync('**/Purple-A11y*', {
      cwd: baseDir,
      recursive: true,
      absolute: true,
    });
  
    if (destDir.length > 0) {
      destDir.forEach(dir => {
        if (fs.existsSync(dir)) {
          try {
            fs.rmSync(dir, { recursive: true });
          } catch (err) {
            console.log(`EDGE Unable to delete ${dir} folder in the Chrome data directory. ${err}`);
            console.log(`EDGE Unable to delete ${dir} folder in the Chrome data directory. ${err}}`);
          }
        }
      });
    }
  };

  export const getScanOptions = (details) => {
    const {
      scanType,
      fileTypes,
      url,
      customDevice,
      viewportWidth,
      maxPages,
      headlessMode,
      browser,
      email,
      name,
      exportDir,
      maxConcurrency,
      includeScreenshots,
      includeSubdomains,
      followRobots,
      metadata,
    } = details;
    const options = ["-c", scanType, "-u", url, "-k", `${name}:${email}`, "-i", fileTypes];
  
    if (!includeScreenshots) {
      options.push('-a');
      options.push('none');
    }
  
    if (!includeSubdomains && scanType === 'website') {
      options.push('-s');
      options.push('same-hostname');
    }
  
    if (customDevice) {
      options.push("-d", customDevice);
    }
  
    if (viewportWidth) {
      options.push("-w", viewportWidth);
    }
  
    if (maxPages) {
      options.push("-p", maxPages);
    }
  
    if (!headlessMode) {
      options.push("-h", "no");
    }
  
    if (browser) {
      options.push("-b", browser);
    }
  
    if (exportDir) {
      options.push("-e", exportDir);
    }
  
    if (maxConcurrency) {
      options.push("-t", 1);
    }
  
    if (maxConcurrency) {
      options.push("-t", 1);
    }
  
    if (followRobots) {
      options.push("-r", "yes");
    }
  
    if (metadata) {
      options.push("-q", metadata);
    }
  
    return options;
  };

  const logFormat = printf(({ timestamp, level, message }) => {
    const log = {
      timestamp: `${timestamp}`,
      level: `${level}`,
      message: `${message}`,
    };
  
    return JSON.stringify(log);
  });

  export const silentLogger = createLogger({
    format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), logFormat),
    transports: [
    new transports.File({ filename: 'errors.txt', level: 'warn', handleExceptions: true })
    ].filter(Boolean),
  });

  export const getDefaultChromeDataDir = () => {
    try {
      let defaultChromeDataDir = null;
      if (os.platform() === 'win32') {
        defaultChromeDataDir = path.join(
          os.homedir(),
          'AppData',
          'Local',
          'Google',
          'Chrome',
          'User Data',
        );
      } else if (os.platform() === 'darwin') {
        defaultChromeDataDir = path.join(
          os.homedir(),
          'Library',
          'Application Support',
          'Google',
          'Chrome',
        );
      }
      if (defaultChromeDataDir && fs.existsSync(defaultChromeDataDir)) {
        return defaultChromeDataDir;
      } else {
        return null;
      }
    } catch (error) {
      console.log(`Error in getDefaultChromeDataDir(): ${error}`);
    }
  };


  export const deleteClonedChromeProfiles = () => {
    const baseDir = getDefaultChromeDataDir();
    if (!baseDir) {
      return;
    }
  
    // Find all the Purple-A11y directories in the Chrome data directory
    const destDir = globSync('**/Purple-A11y*', {
      cwd: baseDir,
      recursive: true,
      absolute: true,
    });
  
    if (destDir.length > 0) {
      destDir.forEach(dir => {
        if (fs.existsSync(dir)) {
          try {
            fs.rmSync(dir, { recursive: true });
          } catch (err) {
            silentLogger.error(`CHROME Unable to delete ${dir} folder in the Chrome data directory. ${err}`);
          }
        }
      });
      return;
    }
  
  
  };

  export const getDefaultChromiumDataDir = () => {
    try {
      let defaultChromiumDataDir = null;
      if (isDocker) {
        
        defaultChromiumDataDir = '/app/chromium_support_folder';
      } else if (os.platform() === 'win32') {
        defaultChromiumDataDir = path.join(
          os.homedir(),
          'AppData',
          'Local',
          'Chromium',
          'User Data',
        );
      } else if (os.platform() === 'darwin') {
        defaultChromiumDataDir = path.join(
          os.homedir(),
          'Library',
          'Application Support',
          'Chromium',
        );
      }
      if (defaultChromiumDataDir && fs.existsSync(defaultChromiumDataDir)) {
        return defaultChromiumDataDir;
      } else {
        return null;
      }
    } catch (error) {
      console.log(`Error in getDefaultChromiumDataDir(): ${error}`);
    }
  };


  export const deleteClonedChromiumProfiles = () => {
    const baseDir = getDefaultChromiumDataDir();
    if (!baseDir) {
      return;
    }
  
    // Find all the Purple-A11y directories in the Chromium data directory
    const destDir = globSync('**/Purple-A11y*', {
      cwd: baseDir,
      recursive: true,
      absolute: true,
    });
  
    if (destDir.length > 0) {
      destDir.forEach(dir => {
        if (fs.existsSync(dir)) {
          try {
            fs.rmSync(dir, { recursive: true });
          } catch (err) {
            silentLogger.error(`CHROME Unable to delete ${dir} folder in the Chromium data directory. ${err}`);
          }
        }
      });
      return;
    }
  
  
  };

  export const createErrorData = (id, url, message) => {
    let data = {"id": id,
                "url": url,
                "error": `${message}`};
    return data
  };

  export function replaceCommaWithColons(inputArray) {
    if (!inputArray || inputArray.length === 0) {
        return "nil"; 
    }
  
    let formattedString = inputArray.join(" :: ");
    return formattedString;
  }

  export function cleanErrorMessage(inputString) {
    // Replace commas and line breaks with ::
    const modifiedString = inputString.replace(/,/g, '::').replace(/\n/g, '::');
    return modifiedString;
  }

  export async function asyncPool(poolLimit, array, iteratorFn) {
    const ret = [];
    const executing = [];
  
    for (let i = 0; i < array.length; i++) {
      const item = array[i];
      const p = Promise.resolve().then(() => iteratorFn(item, i, array)); // Pass index and array to iteratorFn
      ret.push(p);
  
      if (poolLimit <= array.length) {
        const e = p.then(() => executing.splice(executing.indexOf(e), 1));
        executing.push(e);
  
        if (executing.length >= poolLimit) {
          await Promise.race(executing);
        }
      }
    }
  
    return Promise.all(ret);
  }

  export const cleanUrl = (url) => {
    // Remove 'http://', 'https://', 'www.' prefixes & trailing slash 
    url = url.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '')
    return url
}
  
  export const defaultScanDetails = {
    headlessMode: true,
    browser: 'chromium',
    fileTypes: 'html-only',
    includeScreenshots: false,
    includeSubdomains: true,
    followRobots: false,
    metadata: undefined,
  }
  
  export const deleteClonedProfiles = () => {
    console.log(defaultScanDetails.browser);
    if (defaultScanDetails.browser === 'chrome') {
      deleteClonedChromeProfiles();
    } else if (defaultScanDetails.browser === 'msedge') {
      deleteClonedEdgeProfiles();
    }else if (defaultScanDetails.browser === 'chromium') {
      deleteClonedChromiumProfiles();
    }
  };

  export const validEmail = email => {
    const emailRegex = /^.+@.+\..+$/u;
  
    return emailRegex.test(email);
  };
  
  // For new user flow.
  export const validName = (name) => {
    // Allow only printable characters from any language
    const regex = /^[\p{L}\p{N}\s'".,()\[\]{}!?:؛،؟…]+$/u;
  
    // Check if the length is between 2 and 32000 characters
    if (name.length < 2 || name.length > 32000) {
      // Handle invalid name length
      return false;
    }
  
    if (!regex.test(name)) {
      // Handle invalid name format
      return false;
    }
  
    // Include a check for specific characters to sanitize injection patterns
    const preventInjectionRegex = /[<>'"\\/;|&!$*{}()\[\]\r\n\t]/;
    if (preventInjectionRegex.test(name)) {
      // Handle potential injection attempts
      return false;
    }
  
    return true;
  };

 
  
export default {
    browserTypes,
    appPath,
    backendPath,
    enginePath,
    resultsPath,
    cliOptions,
    messageOptions,
    defaultScanDetails
}