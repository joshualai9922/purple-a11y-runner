import _yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import fs from 'fs-extra';
import csvParser from 'csv-parser';
import path from 'path';
import { spawn } from 'child_process';
import printMessage from 'print-message';
import constants, {
  getScanOptions,
  silentLogger,
  validEmail,
  validName,
  deleteClonedProfiles,
  asyncPool,
  createErrorData,
  replaceCommaWithColons,
  cleanErrorMessage,
} from './constants.js';

process.env.RUNNING_FROM_MASS_SCANNER = true;
process.env.MASS_SCANNER_STORAGE_PATH = path.join(process.cwd(), 'results');
let massScannerResults = []


let errorsFromBackend = [];
let retryMode = false;
let scanSummary = [];
let recievedZipFileName = false;

const yargs = _yargs(hideBin(process.argv));
const options = yargs
  .version(false)
  .strictOptions(true)
  .options(constants.cliOptions)
  .coerce('f', (option) => {


    return option;
  })
  .coerce('k', (nameEmail) => {
    if (nameEmail.indexOf(':') === -1) {
      printMessage(
        [`Invalid format. Please provide your name and email address separated by ":"`],
        constants.messageOptions,
      );
      process.exit(1);
    }
    const [name, email] = nameEmail.split(':');
    if (name === '' || name === undefined || name === null) {
      printMessage([`Please provide your name.`], constants.messageOptions);
      process.exit(1);
    }
    if (!validName(name)) {
      printMessage([`Invalid name. Please provide a valid name.`], constants.messageOptions);
      process.exit(1);
    }
    if (!validEmail(email)) {
      printMessage(
        [`Invalid email address. Please provide a valid email address.`],
        constants.messageOptions,
      );
      process.exit(1);
    }

    let nameEmailDetails = {"name":name,
                            "email": email};
    return nameEmailDetails;
  })
  .epilogue('').argv;


let allScanDetails = []
let crawlConcurrency = undefined

//ang yong start
async function startScanInputCsv() {
  return new Promise((resolve, reject) => {
    let rowIndex = 1
    fs.createReadStream(options.f)
      .pipe(csvParser())
      .on('headers', (headers) => {
        if (headers.includes('Error')) {
          retryMode = true;
        }
      })

      .on('data', (row) => {
        if (!crawlConcurrency) {
          crawlConcurrency = row['Crawl Concurrency']
        }
        let scanDetails = { ...constants.defaultScanDetails, name: options.nameEmail.name, email: options.nameEmail.email };

        if ((retryMode && row["Error"] != "nil") || (!retryMode)) {
            allScanDetails.push({
            id: rowIndex,
            url: row['Url'],
            maxPages: row['Max Pages'],
            maxConcurrency: row['Max Concurrency'],
            scanType: row['Scan Type'],
            ...scanDetails 
          });
        }
        rowIndex++
      })

      .on('end', async () => {
        console.log('crawlConcurrency :', crawlConcurrency);
        // startScan according to crawlConcurrency
        asyncPool(crawlConcurrency, allScanDetails, async (scanDetails) => {
          try {
            await startScan(scanDetails);
          } catch (error) {
            silentLogger.error("Error at startScan:",error);
          }
        }).then(() => {
          resolve(); // Resolve the promise when all scans are done
        });
      })

      .on('error', (error) => {
        silentLogger.error("Error reading csv file:",error);
        reject(error);
      });
  });
}


const additionalHeadersForSummary = [
  'Retry Count',
  'Error',
  'Start Time',
  'End Time',
  'Pages Scanned',
  'Wcag Pass Percentage',
  'Wcag Violations',
  'Must Fix Issues',
  'Must Fix Occurrences',
  'Good to Fix Issues',
  'Good to Fix Occurrences',
  'Needs Review Issues',
  'Needs Review Occurrences',
  'Passed Occurrences',
  'Critical Occurrences',
  'Serious Occurrences',
  'Moderate Occurrences',
  'Minor Occurrences'
];

function createSummaryCsv() {
  try {

    let massScannerResultsAndErrors = massScannerResults.concat(errorsFromBackend);

    const inputFileName = options.f;
    const outputFileName = 'summary.csv';

    // Read the input CSV file
    const inputCsvData = fs.readFileSync(inputFileName, 'utf8');
    const inputCsvRows = inputCsvData.split('\n');

    const retryCountColumnIndex = inputCsvRows[0].split(',').indexOf('Retry Count');
    const urlColumnIndex = inputCsvRows[0].split(',').indexOf('Url');

    // Add additional headers as new columns
    const modifiedHeader = inputCsvRows[0].trim() + ',' + additionalHeadersForSummary.join(',') + '\n';

    // Loop through each line of input CSV and append relevant information from the data
    for (let i = 1; i < inputCsvRows.length; i++) {
      const inputRow = inputCsvRows[i].trim();
      if (inputRow) {
        const url = inputRow.split(',')[urlColumnIndex].trim();
        const scanInfo = massScannerResultsAndErrors.find(scanInfoItem => scanInfoItem.id === i);
        if (scanInfo) {

          //create scan summary row data
          let scanSummaryRowData;
          if (scanInfo.error) {
            scanSummaryRowData = [
              retryMode ? parseInt(inputRow.split(',')[retryCountColumnIndex]) + 1 : 0,
              cleanErrorMessage(scanInfo.error)
            ].join(',');
          } else {
            scanSummaryRowData = [
              retryMode ? parseInt(inputRow.split(',')[retryCountColumnIndex]) + 1 : 0,
              "nil",
              scanInfo.startTime,
              scanInfo.endTime,
              scanInfo.pagesScanned,
              scanInfo.wcagPassPercentage,
              scanInfo.wcagViolations,
              scanInfo.mustFix.issues,
              scanInfo.mustFix.occurrence,
              scanInfo.goodToFix.issues,
              scanInfo.goodToFix.occurrence,
              scanInfo.needsReview.issues,
              scanInfo.needsReview.occurrence,
              scanInfo.passed.occurrence,
              scanInfo.critical,
              scanInfo.serious,
              scanInfo.moderate,
              scanInfo.minor
            ].join(',');
          }

          // append the scan summary row data
          if (retryMode) {
            inputCsvRows[i] = inputRow.split(',').slice(0, retryCountColumnIndex).join() + ',' + scanSummaryRowData
          } else {
            inputCsvRows[i] = inputRow + ',' + scanSummaryRowData;
          }
        }
      }
    }

    // Write the modified header and the rest of the content to summary.csv
    fs.writeFileSync(outputFileName, retryMode ? inputCsvRows.join('\n') : modifiedHeader + inputCsvRows.slice(1).join('\n'));
    console.log(`File "${outputFileName}" created successfully.`);
  } catch (error) {
    silentLogger.error(`Error in creating summary.csv:`, error);
  }
}




function getDetails(parsedResults) {
  const rows = [];

  parsedResults.forEach(result => {
    // Scan URL is the main URL for each result
    const scanUrl = result.url;

    // Define a helper function to process each rule section
    function processRules(sectionName, rules) {
      if (rules && Array.isArray(rules)) {
        rules.forEach(rule => {
          const ruleName = rule.rule || "No rule name";
          const ruleDescription = rule.description || "No description provided";
          const axeImpact = rule.axeImpact
          rule.pagesAffected.forEach(page => {
            // Calculate total occurrences by counting items in page.affectedItems
            const totalOccurrences = page.items ? page.items.length : 0;

            // Push a new row for each affected page
            rows.push({
              "Scan URL": scanUrl,
              "Rule Name": ruleName,
              "Rule Description": ruleDescription,
              "URL": page.url,
              "Total Occurrences": totalOccurrences,
              "Category": sectionName,
              "Axe Impact": axeImpact
            });
          });
        });
      }
    }

    // Process each category of rules
    if (result.mustFix) processRules('mustFix', result.mustFix.rules);
    if (result.goodToFix) processRules('goodToFix', result.goodToFix.rules);
    if (result.needsReview) processRules('needsReview', result.needsReview.rules);
  });

  return rows;
}

function createDetailsCsv() {
  try {
    const detailsCsvHeaders = ['Scan URL', 'Rule Name', 'Rule Description', 'URL', 'Total Occurrences', 'Category', 'Axe Impact'];
    const outputFileName = 'details.csv';

    // get details from mass scanner results
    const detailsCsvRows = getDetails(massScannerResults);
    const detailsCsvHeaderString = detailsCsvHeaders.join(',') + '\n';
    const DetailsCsvRowsString = detailsCsvRows.map(row =>
      detailsCsvHeaders.map(header => `"${row[header] || ''}"`).join(',')  // Ensure that fields are enclosed in quotes in case of commas or other special characters
    );


    // Write the headers and the row data to the output CSV file
    if (retryMode){
    fs.appendFileSync(outputFileName, '\n'+DetailsCsvRowsString.join('\n'));
    } else {
    fs.writeFileSync(outputFileName, detailsCsvHeaderString + DetailsCsvRowsString.join('\n'));
    }
    console.log(`File "${outputFileName}" created successfully`);
  } catch (error) {
    silentLogger.error(`Error in creating details.csv:`, error);
  }
}


function cleanMassScannerResults() {
  //seperate wcag violations by :: istead of commas
  try {
    Object.keys(massScannerResults).forEach(key => {
      massScannerResults[key].wcagViolations = replaceCommaWithColons(massScannerResults[key].wcagViolations);
});
  
   
  } catch (error) {
    silentLogger.error(`Error in cleanMassScannerData:`,error);
  }
}





let currentChildProcess;
const scanHistory = {};

const startScan = async (scanDetails) => {
  const { scanType, url, id } = scanDetails;

  const response = await new Promise(async (resolve) => {
    // Exclude mass_scanner_data from process.env
    let { MASS_SCANNER_DATA, ...filteredEnv } = process.env;

    const scan = spawn(
      "node",
      ["cli.js", ...getScanOptions(scanDetails)],
      {
        cwd: constants.enginePath,
        env: {
          ...filteredEnv
        },
        stdio: ['pipe', 'pipe', 'pipe', 'ipc']
      }
    );

    scan.on('message', (message) => {
      let parsedMessage = JSON.parse(message)
      let messageFromBackend = parsedMessage.payload;

      if (parsedMessage.type === 'scanData') {
        messageFromBackend.id = id;
        messageFromBackend.url = url;
        massScannerResults.push(messageFromBackend);
      }

      if (parsedMessage.type === 'zipFileName') {
        if (!recievedZipFileName) {
          let scanSummaryIntro = retryMode? 
          [`SCAN SUMMARY  [RETRY MODE]`, `(Reports of the runs are at ${messageFromBackend}.)`]
          : [`SCAN SUMMARY`, `(Reports of the runs are at ${messageFromBackend}.)`];
          scanSummary = scanSummaryIntro.concat(scanSummary)
          recievedZipFileName = true;
        }
      }

      if (parsedMessage.type === 'scanSummary') {
        let scanTitle = ["", "", `${scanType} scan at ${url}`]
        messageFromBackend = scanTitle.concat(messageFromBackend)
        scanSummary = scanSummary.concat(messageFromBackend);
      }

      // just for debugging purposes
      // console.log("message from backend",messageFromBackend);

    });

    currentChildProcess = scan;

    scan.stderr.setEncoding("utf8");
    scan.stderr.on("data", function (data) {
      console.log("stderr: " + data);
      let errorData = createErrorData(id, url, data);
      errorsFromBackend.push(errorData);
    });

    scan.stdout.setEncoding("utf8");
    scan.stdout.on("data", async (data) => {
      /** Code 0 handled indirectly here (i.e. successful process run),
      as unable to get stdout on close event after changing to spawn from fork */

      // Output from combine.js which prints the string "No pages were scanned" if crawled URL <= 0
      // consider this as successful that the process ran,
      // but failure in the sense that no pages were scanned so that we can display a message to the user
      if (data.includes("No pages were scanned")) {
        scan.kill("SIGKILL");
        currentChildProcess = null;
        resolve({ success: false });
      }

      // The true success where the process ran and pages were scanned
      if (data.includes("Results directory is at")) {
        scan.kill("SIGKILL");
        currentChildProcess = null;
        resolve({ success: true });
      }

      // Handle live crawling output
      if (data.includes("Electron crawling")) {
        const urlScannedNum = parseInt(data.split("::")[1].trim());
        const status = data.split("::")[2].trim();
        const url = data.split("::")[3].trim();
        console.log(urlScannedNum, ": ", status, ": ", url);
      }

      if (data.includes("Starting scan")) {
        console.log(`Starting new ${scanType} scan at ${url}`);
      }

      if (data.includes("Electron scan completed")) {
        console.log(`Completed ${scanType} scan at ${url}`);
      }

      //silentlogger errors
      if (data.includes('"level":"error"')) {
        console.log(`Error in ${scanType} scan at ${url} :`, data);
        let errorMessage = JSON.parse(data).message
        let errorData = createErrorData(id, url, errorMessage)
        errorsFromBackend.push(errorData);
      }

    });

    // Only handles error code closes (i.e. code > 0)
    // as successful resolves are handled above
    scan.on("close", (code) => {
      if (code !== 0) {
        resolve({ success: false, statusCode: code });
      }
      currentChildProcess = null;
    });
  });
  return response;
};


  // Start 
  try {
    deleteClonedProfiles();
    await startScanInputCsv();
    deleteClonedProfiles();
    cleanMassScannerResults()

    console.log('massScannerResults :',massScannerResults);
    console.log('errorsFromBackend :',errorsFromBackend);

    createSummaryCsv();
    createDetailsCsv();
    printMessage(scanSummary);

  } catch (error) {
    silentLogger('error in main part:', error);
  }


